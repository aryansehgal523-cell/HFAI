import { and, asc, eq, inArray, isNull, lt, notInArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { companies, crawlRuns, crawlSkips, jobs } from "@/db/schema";
import { fetchJobsFor } from "./connectors";
import { jobInScope } from "./geo";
import { BlockedByRobotsError, HostUnavailableError } from "./http";
import { ghostScore, normalize } from "./normalize";
import type { AtsConfig } from "./types";

type Options = {
  companyIds?: string[];
  concurrency?: number;
  log?: (m: string) => void;
  /** Crawl at most this many companies, oldest crawl first. */
  limit?: number;
  /** Stop starting new companies after this many milliseconds (serverless time limits). */
  timeBudgetMs?: number;
  /** Max detail page requests per company per run (Workday, SmartRecruiters, JSON-LD). */
  maxDetails?: number;
};

type SourceStats = { companies: number; ok: number; failed: number; jobsSeen: number; jobsNew: number; jobsClosed: number };
type CompanyRow = typeof companies.$inferSelect;

const SKIP_TTL_DAYS = 30;
const DETAIL_SOURCES = new Set(["WORKDAY", "SMARTRECRUITERS", "ORACLE", "JSONLD"]);
const BATCH = 200;
const chunk = <T,>(arr: T[], n: number) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));

export type CompanyCrawlResult = {
  status: "ok" | "empty" | "error" | "blocked";
  listed: number;
  seen: number;
  inserted: number;
  closed: number;
  skipped: number;
  deferred: number;
  error?: string;
};

/** Crawl one company: fetch, normalise, upsert, keep listed jobs open, close vanished ones, record status. */
export async function crawlCompany(company: CompanyRow, opts: { maxDetails: number; log: (m: string) => void }): Promise<CompanyCrawlResult> {
  const config = (company.atsConfig ?? {}) as AtsConfig;
  try {
    const [stored, skips] = await Promise.all([
      db.select({ externalId: jobs.externalId }).from(jobs).where(eq(jobs.companyId, company.id)),
      db.select({ externalId: crawlSkips.externalId }).from(crawlSkips).where(eq(crawlSkips.companyId, company.id)),
    ]);
    const storedIds = new Set(stored.map((r) => r.externalId));
    const skipIds = new Set(skips.map((r) => r.externalId));
    const known = new Set([...storedIds, ...skipIds]);

    const result = await fetchJobsFor(company.ats, company.atsToken, config, { known, maxDetails: opts.maxDetails, log: opts.log });

    const rows = new Map<string, ReturnType<typeof normalize>>();
    const skipped: { externalId: string; reason: string }[] = (result.skipped ?? []).map((externalId) => ({ externalId, reason: "not_a_job" }));
    for (const raw of result.jobs) {
      if (!raw.title || !raw.applyUrl || !raw.externalId) continue;
      const row = normalize(company.id, raw);
      if (!jobInScope(row.country, row.location)) {
        skipped.push({ externalId: row.externalId, reason: "scope" });
        continue;
      }
      rows.set(row.externalId, row);
    }

    // Upsert in batches. xmax = 0 is true only for freshly inserted rows.
    let inserted = 0;
    for (const batch of chunk([...rows.values()], BATCH)) {
      const out = await db
        .insert(jobs)
        .values(batch.map((r) => ({ ...r, source: company.ats.toLowerCase() })))
        .onConflictDoUpdate({
          target: [jobs.companyId, jobs.externalId],
          set: {
            title: sql`excluded.title`, location: sql`excluded.location`, country: sql`excluded.country`, workMode: sql`excluded.work_mode`,
            department: sql`excluded.department`, employment: sql`excluded.employment`, description: sql`excluded.description`,
            applyUrl: sql`excluded.apply_url`, skills: sql`excluded.skills`, salaryMin: sql`excluded.salary_min`, salaryMax: sql`excluded.salary_max`,
            salaryCurrency: sql`excluded.salary_currency`, salaryPeriod: sql`excluded.salary_period`,
            experienceMin: sql`excluded.experience_min`, experienceMax: sql`excluded.experience_max`, hash: sql`excluded.hash`,
            source: sql`excluded.source`, lastSeenAt: new Date(), closedAt: null,
          },
        })
        .returning({ inserted: sql<boolean>`(xmax = 0)` });
      inserted += out.filter((o) => o.inserted).length;
    }

    // Known jobs still listed: keep them open without fetching them again.
    const still = result.stillListed.filter((id) => storedIds.has(id));
    for (const ids of chunk(still, 1000)) {
      await db.update(jobs).set({ lastSeenAt: new Date(), closedAt: null }).where(and(eq(jobs.companyId, company.id), inArray(jobs.externalId, ids)));
    }

    // Only sources that open a page per job benefit from remembering skips; simple feeds list everything anyway.
    if (skipped.length && DETAIL_SOURCES.has(company.ats)) {
      for (const batch of chunk(skipped, 500)) {
        await db.insert(crawlSkips).values(batch.map((s) => ({ companyId: company.id, ...s }))).onConflictDoNothing();
      }
    }

    // Close jobs that vanished from the listing. Only when the listing was complete.
    let closed = 0;
    const listedIds = [...rows.keys(), ...still];
    if (result.complete !== false && listedIds.length < 30_000) {
      const out = await db
        .update(jobs)
        .set({ closedAt: new Date() })
        .where(and(eq(jobs.companyId, company.id), isNull(jobs.closedAt), listedIds.length ? notInArray(jobs.externalId, listedIds) : sql`true`))
        .returning({ id: jobs.id });
      closed = out.length;
    }

    const listed = rows.size + still.length;
    const status = listed > 0 || (result.deferred ?? 0) > 0 ? "ok" : "empty";
    await db
      .update(companies)
      .set({
        lastCrawledAt: new Date(), lastCrawlStatus: status, lastCrawlJobs: listed, lastCrawlError: null, consecutiveFailures: 0,
        ...(result.config ? { atsConfig: { ...config, ...result.config } } : {}),
      })
      .where(eq(companies.id, company.id));

    return { status, listed, seen: rows.size, inserted, closed, skipped: skipped.length, deferred: result.deferred ?? 0 };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    const status = e instanceof BlockedByRobotsError || e instanceof HostUnavailableError ? "blocked" : "error";
    await db
      .update(companies)
      .set({ lastCrawledAt: new Date(), lastCrawlStatus: status, lastCrawlError: error.slice(0, 500), consecutiveFailures: sql`${companies.consecutiveFailures} + 1` })
      .where(eq(companies.id, company.id));
    return { status, listed: 0, seen: 0, inserted: 0, closed: 0, skipped: 0, deferred: 0, error };
  }
}

/**
 * Crawl active companies (oldest crawl first), upsert their jobs, close jobs that disappeared,
 * and refresh ghost scores. Safe to run repeatedly (idempotent). Every company's outcome is
 * recorded on the company row, so a failing source is always visible in the admin panel.
 */
export async function runCrawl({ companyIds, concurrency = 4, log = () => {}, limit, timeBudgetMs, maxDetails = 300 }: Options = {}) {
  const started = Date.now();
  const [run] = await db.insert(crawlRuns).values({}).returning();
  await db.delete(crawlSkips).where(lt(crawlSkips.createdAt, new Date(Date.now() - SKIP_TTL_DAYS * 86_400_000)));

  const base = db
    .select()
    .from(companies)
    .where(
      companyIds?.length
        ? and(eq(companies.active, true), inArray(companies.id, companyIds))
        : and(eq(companies.active, true), notInArray(companies.ats, ["MANUAL", "AGGREGATOR"])),
    )
    .orderBy(sql`${companies.lastCrawledAt} asc nulls first`, asc(companies.name));
  const list = (limit ? await base.limit(limit) : await base).filter((c) => c.ats !== "MANUAL" && c.ats !== "AGGREGATOR");

  const errors: { company: string; error: string }[] = [];
  const stats: Record<string, SourceStats> = {};
  let jobsSeen = 0, jobsNew = 0, jobsClosed = 0, crawled = 0;

  const queue = [...list];
  async function worker() {
    while (queue.length) {
      if (timeBudgetMs && Date.now() - started > timeBudgetMs) return;
      const company = queue.shift()!;
      const r = await crawlCompany(company, { maxDetails, log });
      crawled++;
      const s = (stats[company.ats.toLowerCase()] ??= { companies: 0, ok: 0, failed: 0, jobsSeen: 0, jobsNew: 0, jobsClosed: 0 });
      s.companies++;
      if (r.error) {
        s.failed++;
        errors.push({ company: company.name, error: r.error });
        log(`✗ ${company.name} [${company.ats.toLowerCase()}]: ${r.error}`);
        continue;
      }
      s.ok++;
      s.jobsSeen += r.listed;
      s.jobsNew += r.inserted;
      s.jobsClosed += r.closed;
      jobsSeen += r.listed;
      jobsNew += r.inserted;
      jobsClosed += r.closed;
      log(`✓ ${company.name} [${company.ats.toLowerCase()}]: ${r.listed} jobs, ${r.inserted} new, ${r.closed} closed${r.skipped ? `, ${r.skipped} outside scope` : ""}${r.deferred ? `, ${r.deferred} left for next run` : ""}`);
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker));

  await refreshGhostScores();

  await db
    .update(crawlRuns)
    .set({ finishedAt: new Date(), companies: crawled, jobsSeen, jobsNew, jobsClosed, errors, stats })
    .where(eq(crawlRuns.id, run.id));

  return { companies: crawled, pending: list.length - crawled, jobsSeen, jobsNew, jobsClosed, errors, stats };
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
