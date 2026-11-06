import { and, eq, inArray, isNull, notInArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { companies, crawlRuns, jobs } from "@/db/schema";
import { fetchJobsFor } from "./connectors";
import { ghostScore, normalize } from "./normalize";

type Options = { companyIds?: string[]; concurrency?: number; log?: (m: string) => void };

/**
 * Crawl every active company, upsert its jobs, close jobs that disappeared,
 * and refresh ghost scores. Safe to run repeatedly (idempotent).
 */
export async function runCrawl({ companyIds, concurrency = 4, log = () => {} }: Options = {}) {
  const [run] = await db.insert(crawlRuns).values({}).returning();
  const list = await db
    .select()
    .from(companies)
    .where(companyIds?.length ? and(eq(companies.active, true), inArray(companies.id, companyIds)) : eq(companies.active, true));

  const errors: { company: string; error: string }[] = [];
  let jobsSeen = 0, jobsNew = 0, jobsClosed = 0;

  const queue = [...list.filter((c) => c.ats !== "MANUAL")];
  async function worker() {
    while (queue.length) {
      const company = queue.shift()!;
      try {
        const raw = await fetchJobsFor(company.ats, company.atsToken);
        const rows = raw.filter((r) => r.title && r.applyUrl).map((r) => normalize(company.id, r));
        jobsSeen += rows.length;

        for (const row of rows) {
          const inserted = await db
            .insert(jobs)
            .values(row)
            .onConflictDoUpdate({
              target: [jobs.companyId, jobs.externalId],
              set: {
                title: row.title, location: row.location, country: row.country, workMode: row.workMode,
                department: row.department, employment: row.employment, description: row.description,
                applyUrl: row.applyUrl, skills: row.skills, salaryMin: row.salaryMin, salaryMax: row.salaryMax,
                salaryCurrency: row.salaryCurrency, salaryPeriod: row.salaryPeriod,
                experienceMin: row.experienceMin, experienceMax: row.experienceMax, hash: row.hash,
                lastSeenAt: new Date(), closedAt: null,
              },
            })
            .returning({ firstSeenAt: jobs.firstSeenAt, lastSeenAt: jobs.lastSeenAt });
          if (inserted[0] && Math.abs(inserted[0].firstSeenAt.getTime() - inserted[0].lastSeenAt.getTime()) < 2000) jobsNew++;
        }

        // Close jobs that vanished from the company's board.
        const ids = rows.map((r) => r.externalId);
        const closed = await db
          .update(jobs)
          .set({ closedAt: new Date() })
          .where(and(eq(jobs.companyId, company.id), isNull(jobs.closedAt), ids.length ? notInArray(jobs.externalId, ids) : sql`true`))
          .returning({ id: jobs.id });
        jobsClosed += closed.length;

        await db.update(companies).set({ lastCrawledAt: new Date() }).where(eq(companies.id, company.id));
        log(`✓ ${company.name}: ${rows.length} jobs, ${closed.length} closed`);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        errors.push({ company: company.name, error: msg });
        log(`✗ ${company.name}: ${msg}`);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker));

  await refreshGhostScores();

  await db
    .update(crawlRuns)
    .set({ finishedAt: new Date(), companies: list.length, jobsSeen, jobsNew, jobsClosed, errors })
    .where(eq(crawlRuns.id, run.id));

  return { companies: list.length, jobsSeen, jobsNew, jobsClosed, errors };
}

/**
 * Recompute ghost scores for all open jobs in one statement.
 * Mirrors ghostScore() in normalize.ts: age, short description, bad link, duplicates.
 */
export async function refreshGhostScores() {
  await db.execute(sql`
    UPDATE jobs j SET ghost_score = LEAST(100,
      (CASE WHEN now() - j.posted_at > interval '45 days' THEN 25 ELSE 0 END) +
      (CASE WHEN now() - j.posted_at > interval '90 days' THEN 25 ELSE 0 END) +
      (CASE WHEN length(j.description) < 400 THEN 20 ELSE 0 END) +
      (CASE WHEN j.apply_url !~ '^https?://' THEN 30 ELSE 0 END) +
      (CASE WHEN d.cnt >= 3 THEN 20 ELSE 0 END))
    FROM (SELECT hash, count(*) AS cnt FROM jobs WHERE closed_at IS NULL GROUP BY hash) d
    WHERE j.hash = d.hash AND j.closed_at IS NULL`);
}

export { ghostScore };
