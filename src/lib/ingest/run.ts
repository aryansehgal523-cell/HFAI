import { and, asc, eq, inArray, isNull, lt, notInArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { companies, crawlRuns, crawlSkips, jobs } from "@/db/schema";
import { fetchJobsFor } from "./connectors";
import { jobInScope } from "./geo";
import { BlockedByRobotsError, HostUnavailableError } from "./http";
import { ghostScore, normalize } from "./normalize";
import { dedupeKey } from "./dedupe";
import { dedupeAgainstEmployerFeeds } from "./aggregators/run";
import { classifyUnclassified } from "@/lib/company-classify-db";
import { fillJobFunctions } from "./functions";
import { companyKey } from "@/lib/referrals/company";
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
  /** Max jobs whose function the AI model may classify this run (0 to skip). */
  functionAiLimit?: number;
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
      db.select({ externalId: jobs.externalId }).from(jobs).where(and(eq(jobs.companyId, company.id), sql`(${jobs.source} = ${company.ats.toLowerCase()} OR ${jobs.source} IS NULL)`)),
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
        .values(batch.map((r) => ({ ...r, source: company.ats.toLowerCase(), companyName: company.name })))
        .onConflictDoUpdate({
          target: [jobs.companyId, jobs.externalId],
          set: {
            title: sql`excluded.title`, location: sql`excluded.location`, country: sql`excluded.country`, workMode: sql`excluded.work_mode`,
            department: sql`excluded.department`, employment: sql`excluded.employment`, description: sql`excluded.description`,
            applyUrl: sql`excluded.apply_url`, skills: sql`excluded.skills`, salaryMin: sql`excluded.salary_min`, salaryMax: sql`excluded.salary_max`,
            salaryCurrency: sql`excluded.salary_currency`, salaryPeriod: sql`excluded.salary_period`,
            experienceMin: sql`excluded.experience_min`, experienceMax: sql`excluded.experience_max`, hash: sql`excluded.hash`,
            source: sql`excluded.source`, dedupeKey: sql`excluded.dedupe_key`, companyName: sql`excluded.company_name`,
            jobFunction: sql`COALESCE(excluded.job_function, jobs.job_function)`, lastSeenAt: new Date(), closedAt: null, duplicateOf: null,
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

    // Close jobs that vanished from the listing. Only when the listing was complete, and only this
    // source's jobs: aggregator jobs attached to the same company are closed by their own rules.
    let closed = 0;
    const listedIds = [...rows.keys(), ...still];
    const source = company.ats.toLowerCase();
    if (result.complete !== false && listedIds.length < 30_000) {
      const out = await db
        .update(jobs)
        .set({ closedAt: new Date() })
        .where(
          and(
            eq(jobs.companyId, company.id),
            isNull(jobs.closedAt),
            sql`(${jobs.source} = ${source} OR ${jobs.source} IS NULL)`,
            listedIds.length ? notInArray(jobs.externalId, listedIds) : sql`true`,
          ),
        )
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
    const error = crawlErrorMessage(e);
    const status = e instanceof BlockedByRobotsError || e instanceof HostUnavailableError ? "blocked" : "error";
    await db
      .update(companies)
      .set({ lastCrawledAt: new Date(), lastCrawlStatus: status, lastCrawlError: error.slice(0, 500), consecutiveFailures: sql`${companies.consecutiveFailures} + 1` })
      .where(eq(companies.id, company.id));
    return { status, listed: 0, seen: 0, inserted: 0, closed: 0, skipped: 0, deferred: 0, error };
  }
}

/**
 * A short, useful error: database errors carry the whole query in their message, so prefer the
 * driver's cause ("value too long for type...", "connection terminated").
 */
export function crawlErrorMessage(e: unknown): string {
  const err = e as { message?: string; cause?: { message?: string; code?: string } };
  if (err?.cause?.message) return `database: ${err.cause.message}${err.cause.code ? ` (${err.cause.code})` : ""}`.slice(0, 300);
  const msg = err?.message ?? String(e);
  return (msg.startsWith("Failed query:") ? "database query failed" : msg).slice(0, 300);
}

/**
 * Crawl active companies (oldest crawl first), upsert their jobs, close jobs that disappeared,
 * and refresh ghost scores. Safe to run repeatedly (idempotent). Every company's outcome is
 * recorded on the company row, so a failing source is always visible in the admin panel.
 */
export async function runCrawl({ companyIds, concurrency = 4, log = () => {}, limit, timeBudgetMs, maxDetails = 300, functionAiLimit }: Options = {}) {
  const started = Date.now();
  const [run] = await db.insert(crawlRuns).values({}).returning();
  await backfillKeys();
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

  // Aggregator copies of jobs we now have straight from the employer.
  const duplicatesRemoved = await dedupeAgainstEmployerFeeds();
  await classifyUnclassified();
  await trimClosedJobs();
  await fillJobFunctions({ log, maxJobs: functionAiLimit }).catch((e) => log(`  functions failed: ${crawlErrorMessage(e)}`));
  await refreshGhostScores();

  await db
    .update(crawlRuns)
    .set({ finishedAt: new Date(), companies: crawled, jobsSeen, jobsNew, jobsClosed, duplicatesRemoved, errors, stats, liveBySource: await liveJobsBySource() })
    .where(eq(crawlRuns.id, run.id));

  return { runId: run.id, companies: crawled, pending: list.length - crawled, jobsSeen, jobsNew, jobsClosed, duplicatesRemoved, errors, stats };
}

/**
 * Keep the database small: a job closed for more than 30 days keeps its row (users' saved jobs and
 * applications point at it) but loses its description, which is most of its size.
 */
export async function trimClosedJobs(days = 30): Promise<number> {
  const out = await db.execute(sql`UPDATE jobs SET description = '' WHERE closed_at < now() - make_interval(days => ${days}) AND description <> ''`);
  return out.rowCount ?? 0;
}

/** Open jobs per source right now (stored on each crawl run for the "source dropped" alert). */
export async function liveJobsBySource(): Promise<Record<string, number>> {
  const rows = await db.execute<{ source: string | null; n: number }>(sql`SELECT source, count(*)::int AS n FROM jobs WHERE closed_at IS NULL GROUP BY source`);
  return Object.fromEntries(rows.rows.map((r) => [r.source ?? "unknown", Number(r.n)]));
}

type AggStats = { calls: number; jobsSeen: number; jobsNew: number; duplicates: number; errors: number; skipped?: string };

/** Add the job search API results to a crawl run's record (or a new record when only the APIs ran). */
export async function recordAggregatorRun(runId: string | null, sources: Record<string, AggStats>) {
  const extra: Record<string, { companies: number; ok: number; failed: number; jobsSeen: number; jobsNew: number; jobsClosed: number; duplicates?: number; calls?: number; skipped?: string }> = {};
  let dups = 0;
  for (const [id, s] of Object.entries(sources)) {
    extra[id] = { companies: 0, ok: s.skipped || s.errors ? 0 : 1, failed: s.errors ? 1 : 0, jobsSeen: s.jobsSeen, jobsNew: s.jobsNew, jobsClosed: 0, duplicates: s.duplicates, calls: s.calls, skipped: s.skipped };
    dups += s.duplicates;
  }
  const live = await liveJobsBySource();
  const newJobs = Object.values(sources).reduce((a, s) => a + s.jobsNew, 0);
  if (!runId) {
    await db.insert(crawlRuns).values({ finishedAt: new Date(), stats: extra, jobsNew: newJobs, duplicatesRemoved: dups, liveBySource: live });
    return;
  }
  const [run] = await db.select().from(crawlRuns).where(eq(crawlRuns.id, runId));
  await db.update(crawlRuns).set({
    stats: { ...(run?.stats ?? {}), ...extra },
    jobsNew: (run?.jobsNew ?? 0) + newJobs,
    duplicatesRemoved: (run?.duplicatesRemoved ?? 0) + dups,
    liveBySource: live,
    finishedAt: new Date(),
  }).where(eq(crawlRuns.id, runId));
}

/**
 * Fill in keys added after rows were created: companies.normalized_name (for matching aggregator jobs)
 * and jobs.dedupe_key (for cross source duplicates). Cheap when there is nothing to do.
 */
export async function backfillKeys() {
  const unnamed = await db.select({ id: companies.id, name: companies.name }).from(companies).where(isNull(companies.normalizedName)).limit(5000);
  for (const c of unnamed) await db.update(companies).set({ normalizedName: companyKey(c.name) }).where(eq(companies.id, c.id));
  for (;;) {
    const rows = await db
      .select({ id: jobs.id, companyId: jobs.companyId, title: jobs.title, location: jobs.location })
      .from(jobs)
      .where(isNull(jobs.dedupeKey))
      .limit(1000);
    if (!rows.length) break;
    const values = rows.map((r) => sql`(${r.id}, ${dedupeKey(r.companyId, r.title, r.location)})`);
    await db.execute(sql`UPDATE jobs SET dedupe_key = v.k FROM (VALUES ${sql.join(values, sql`, `)}) AS v(id, k) WHERE jobs.id = v.id`);
  }
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
