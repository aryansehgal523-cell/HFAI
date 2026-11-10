/*
 * Run the official job search APIs (Adzuna, Jooble) inside each source's daily quota.
 *
 *  - Each source walks the keyword × city plan from where it stopped last time (cursor in crawl_state).
 *  - The daily call limit is spread across the day's runs (AGGREGATOR_RUNS_PER_DAY, default 4).
 *  - Jobs attach to an existing company with the same normalised name (so Infosys jobs from Adzuna sit
 *    with Infosys' own Workday jobs), or to a new company with ats "AGGREGATOR".
 *  - Duplicates of a job we already have are not stored twice: the link is added to the kept job instead.
 *  - Expiry: a job missed by 3 full runs of the query that found it is closed, and any aggregator job is
 *    closed 30 days after posting.
 */
import { and, eq, inArray, isNull, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { companies, crawlState, jobs } from "@/db/schema";
import { companyKey } from "@/lib/referrals/company";
import { slugify } from "@/lib/utils";
import { classifyUnclassified } from "@/lib/company-classify-db";
import { normalize } from "../normalize";
import { isDuplicate, preferred, type DedupeCandidate } from "../dedupe";
import { AGGREGATORS, type AggregatorJob, type AggregatorSource } from "./sources";
import { buildQueryPlan, queryKey, type Query } from "./queries";

export const AGGREGATOR_SOURCES = ["adzuna", "jooble"];
const MAX_CONSECUTIVE_ERRORS = 3;

export type AggregatorStats = { queries: number; calls: number; jobsSeen: number; jobsNew: number; duplicates: number; errors: number; skipped?: string };

async function getState<T extends Record<string, unknown>>(key: string): Promise<T | null> {
  const [row] = await db.select().from(crawlState).where(eq(crawlState.key, key));
  return (row?.value as T) ?? null;
}
async function setState(key: string, value: Record<string, unknown>) {
  await db.insert(crawlState).values({ key, value }).onConflictDoUpdate({ target: crawlState.key, set: { value, updatedAt: new Date() } });
}

/** Today's date in India, used for daily quotas. */
export const istDay = (d = new Date()) => new Date(d.getTime() + 5.5 * 3_600_000).toISOString().slice(0, 10);

/** How many calls this run may make: an even share of the daily limit, never more than what is left today. */
export function callBudget(dailyLimit: number, usedToday: number, runsPerDay: number): number {
  return Math.max(0, Math.min(Math.ceil(dailyLimit / Math.max(1, runsPerDay)), dailyLimit - usedToday));
}

// ── companies ───────────────────────────────────────────────
const companyCache = new Map<string, string>();

/** Find the company for an aggregator job by normalised name, preferring one we crawl directly; create it if new. */
export async function companyForName(name: string): Promise<string> {
  const key = companyKey(name);
  const cached = companyCache.get(key);
  if (cached) return cached;
  const existing = await db
    .select({ id: companies.id, ats: companies.ats })
    .from(companies)
    .where(eq(companies.normalizedName, key))
    .orderBy(sql`CASE WHEN ${companies.ats} = 'AGGREGATOR' THEN 2 WHEN ${companies.ats} = 'MANUAL' THEN 3 ELSE 1 END`)
    .limit(1);
  let id = existing[0]?.id;
  if (!id) {
    const base = slugify(name) || "company";
    const [taken] = await db.select({ id: companies.id }).from(companies).where(eq(companies.slug, base));
    const [row] = await db
      .insert(companies)
      .values({ name: name.slice(0, 120), slug: taken ? `${base}-${key.replace(/[^a-z0-9]+/g, "").slice(0, 6) || "co"}-${Date.now().toString(36)}` : base, ats: "AGGREGATOR", atsToken: key, normalizedName: key })
      .onConflictDoNothing()
      .returning({ id: companies.id });
    id = row?.id ?? (await db.select({ id: companies.id }).from(companies).where(and(eq(companies.ats, "AGGREGATOR"), eq(companies.atsToken, key))))[0]?.id;
  }
  if (!id) throw new Error(`could not create company for ${name}`);
  companyCache.set(key, id);
  return id;
}

// ── storing ─────────────────────────────────────────────────
type Existing = DedupeCandidate & { closedAt?: boolean; externalId: string; applyUrl: string; dedupeKey: string | null; otherSources: { source: string; url: string; sourceJobId?: string }[] };

/** Store one page of aggregator jobs. Returns new and duplicate counts and the external ids seen. */
export async function storeAggregatorJobs(source: string, q: Query, list: AggregatorJob[]) {
  let inserted = 0;
  let duplicates = 0;
  const seen: string[] = [];
  const rows: (ReturnType<typeof normalize> & { companyName: string; sourceJobId: string })[] = [];
  for (const raw of list) {
    const companyId = await companyForName(raw.companyName);
    rows.push({ ...normalize(companyId, raw), companyName: raw.companyName, sourceJobId: raw.sourceJobId });
  }
  if (!rows.length) return { inserted, duplicates, seen };

  // Open jobs that might be the same opening (same company, title and city).
  const keys = [...new Set(rows.map((r) => r.dedupeKey))];
  const candidates = (await db
    .select({
      id: jobs.id, externalId: jobs.externalId, applyUrl: jobs.applyUrl, source: jobs.source, postedAt: jobs.postedAt, description: jobs.description,
      dedupeKey: jobs.dedupeKey, otherSources: jobs.otherSources,
    })
    .from(jobs)
    .where(and(inArray(jobs.dedupeKey, keys), isNull(jobs.closedAt)))).map((c) => ({ ...c, isEmployerFeed: !AGGREGATOR_SOURCES.includes(c.source ?? "") })) as Existing[];

  for (const row of rows) {
    seen.push(row.externalId);
    const incoming: DedupeCandidate = { id: "", source, postedAt: row.postedAt, description: row.description, isEmployerFeed: false };
    const twin = candidates.find((c) => !c.closedAt && c.dedupeKey === row.dedupeKey && c.externalId !== row.externalId && isDuplicate(c, incoming));
    const link = { source, url: row.applyUrl, sourceJobId: row.sourceJobId };

    if (twin && preferred(twin, incoming) === twin) {
      // Keep what we have; remember this source's link on it.
      if (!twin.otherSources.some((o) => o.source === source && o.url === row.applyUrl)) {
        twin.otherSources = [...twin.otherSources, link].slice(-10);
        await db.update(jobs).set({ otherSources: twin.otherSources }).where(eq(jobs.id, twin.id));
      }
      duplicates++;
      continue;
    }

    const { companyName, ...values } = row;
    const [out] = await db
      .insert(jobs)
      .values({ ...values, companyName, source, sourceJobId: row.sourceJobId, sourceQuery: queryKey(q), missedCrawls: 0, otherSources: twin ? [...twin.otherSources] : [] })
      .onConflictDoUpdate({
        target: [jobs.companyId, jobs.externalId],
        set: {
          title: sql`excluded.title`, location: sql`excluded.location`, country: sql`excluded.country`, description: sql`excluded.description`,
          applyUrl: sql`excluded.apply_url`, salaryMin: sql`excluded.salary_min`, salaryMax: sql`excluded.salary_max`,
          sourceQuery: sql`excluded.source_query`, missedCrawls: 0, lastSeenAt: new Date(), closedAt: null,
        },
      })
      .returning({ id: jobs.id, inserted: sql<boolean>`(xmax = 0)` });
    if (out?.inserted) inserted++;
    if (twin && out) {
      // The new copy is better (an aggregator with a fuller description): close the old one.
      await db
        .update(jobs)
        .set({ closedAt: new Date(), duplicateOf: out.id })
        .where(eq(jobs.id, twin.id));
      await db
        .update(jobs)
        .set({ otherSources: [...twin.otherSources, { source: twin.source ?? "unknown", url: twin.applyUrl }].slice(-10) })
        .where(eq(jobs.id, out.id));
      twin.closedAt = true;
      duplicates++;
    }
    // Later rows on the same page can be copies of this one.
    if (out) candidates.push({ id: out.id, externalId: row.externalId, applyUrl: row.applyUrl, source, postedAt: row.postedAt, description: row.description, isEmployerFeed: false, dedupeKey: row.dedupeKey, otherSources: [] });
  }
  return { inserted, duplicates, seen };
}

/** A query was read completely: jobs it found before but not now get a miss; 3 misses in a row close the job. */
export async function recordMisses(source: string, qk: string, seen: string[]) {
  await db
    .update(jobs)
    .set({ missedCrawls: sql`${jobs.missedCrawls} + 1` })
    .where(and(eq(jobs.source, source), eq(jobs.sourceQuery, qk), isNull(jobs.closedAt), seen.length ? sql`${jobs.externalId} NOT IN (${sql.join(seen.map((s) => sql`${s}`), sql`, `)})` : sql`true`));
  await db.update(jobs).set({ closedAt: new Date() }).where(and(eq(jobs.source, source), eq(jobs.sourceQuery, qk), isNull(jobs.closedAt), sql`${jobs.missedCrawls} >= 3`));
}

/** Aggregator jobs close 30 days after posting when nothing else closed them. */
export async function expireAggregatorJobs() {
  const out = await db
    .update(jobs)
    .set({ closedAt: new Date() })
    .where(and(inArray(jobs.source, AGGREGATOR_SOURCES), isNull(jobs.closedAt), lt(jobs.postedAt, new Date(Date.now() - 30 * 86_400_000))))
    .returning({ id: jobs.id });
  return out.length;
}

/**
 * After employer feeds are crawled: close open aggregator copies of jobs we now have from the employer,
 * keeping their links on the employer's job. Returns how many duplicates were removed.
 */
export async function dedupeAgainstEmployerFeeds(): Promise<number> {
  const pairs = await db.execute<{
    agg_id: string; agg_source: string; agg_url: string; agg_posted: Date; agg_desc: string;
    emp_id: string; emp_posted: Date; emp_desc: string; emp_other: { source: string; url: string }[];
  }>(sql`
    SELECT a.id AS agg_id, a.source AS agg_source, a.apply_url AS agg_url, a.posted_at AS agg_posted, a.description AS agg_desc,
           e.id AS emp_id, e.posted_at AS emp_posted, e.description AS emp_desc, e.other_sources AS emp_other
    FROM jobs a
    JOIN jobs e ON e.dedupe_key = a.dedupe_key AND e.id <> a.id AND e.closed_at IS NULL AND ${sql.raw("(e.source IS NULL OR e.source NOT IN ('adzuna','jooble'))")}
    WHERE a.closed_at IS NULL AND a.source IN ('adzuna', 'jooble') AND a.dedupe_key IS NOT NULL
    LIMIT 20000`);
  let removed = 0;
  for (const p of pairs.rows) {
    const agg = { id: p.agg_id, source: p.agg_source, postedAt: new Date(p.agg_posted), description: p.agg_desc, isEmployerFeed: false };
    const emp = { id: p.emp_id, source: null, postedAt: new Date(p.emp_posted), description: p.emp_desc, isEmployerFeed: true };
    if (!isDuplicate(agg, emp)) continue;
    const other = Array.isArray(p.emp_other) ? p.emp_other : [];
    if (!other.some((o) => o.url === p.agg_url)) {
      await db.update(jobs).set({ otherSources: [...other, { source: p.agg_source, url: p.agg_url }].slice(-10) }).where(eq(jobs.id, p.emp_id));
    }
    await db.update(jobs).set({ closedAt: new Date(), duplicateOf: p.emp_id }).where(eq(jobs.id, p.agg_id));
    removed++;
  }
  return removed;
}

// ── one source ──────────────────────────────────────────────
export async function runAggregator(src: AggregatorSource, opts: { log: (m: string) => void; runsPerDay: number; maxCalls?: number }): Promise<AggregatorStats> {
  const stats: AggregatorStats = { queries: 0, calls: 0, jobsSeen: 0, jobsNew: 0, duplicates: 0, errors: 0 };
  if (!src.enabled()) return { ...stats, skipped: `no API key (set ${src.id === "adzuna" ? "ADZUNA_APP_ID and ADZUNA_APP_KEY" : "JOOBLE_API_KEY"})` };

  const day = istDay();
  const quotaKey = `quota:${src.id}:${day}`;
  const used = Number((await getState<{ calls: number }>(quotaKey))?.calls ?? 0);
  let budget = callBudget(src.dailyLimit(), used, opts.runsPerDay);
  if (opts.maxCalls !== undefined) budget = Math.min(budget, opts.maxCalls);
  if (budget === 0) return { ...stats, skipped: `daily limit of ${src.dailyLimit()} calls reached` };

  const plan = buildQueryPlan();
  const cursorKey = `cursor:${src.id}`;
  let cursor = Number((await getState<{ index: number }>(cursorKey))?.index ?? 0);
  let consecutiveErrors = 0;

  while (stats.calls < budget && consecutiveErrors < MAX_CONSECUTIVE_ERRORS) {
    const q = plan[cursor % plan.length];
    cursor++;
    stats.queries++;
    const seen: string[] = [];
    let complete = false;
    for (let page = 1; page <= src.pages() && stats.calls < budget; page++) {
      try {
        stats.calls++;
        const res = await src.search(q, page);
        consecutiveErrors = 0;
        stats.jobsSeen += res.jobs.length;
        const r = await storeAggregatorJobs(src.id, q, res.jobs);
        stats.jobsNew += r.inserted;
        stats.duplicates += r.duplicates;
        seen.push(...r.seen);
        if (page * res.perPage >= res.total || res.jobs.length < res.perPage) {
          complete = true;
          break;
        }
      } catch (e) {
        stats.errors++;
        consecutiveErrors++;
        opts.log(`  ${src.id} "${q.keyword}" in ${q.location}: ${e instanceof Error ? e.message : e}`);
        break;
      }
    }
    if (complete) await recordMisses(src.id, queryKey(q), seen);
  }

  await setState(cursorKey, { index: cursor % plan.length, planSize: plan.length });
  await setState(quotaKey, { calls: used + stats.calls });
  if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) opts.log(`  ${src.id}: stopped after ${MAX_CONSECUTIVE_ERRORS} errors in a row`);
  return stats;
}

/** Run every enabled aggregator once, then expire old jobs. Sources without keys are skipped cleanly. */
export async function runAggregators(opts: { log?: (m: string) => void; runsPerDay?: number; maxCalls?: number } = {}) {
  const log = opts.log ?? (() => {});
  const runsPerDay = opts.runsPerDay ?? (Number(process.env.AGGREGATOR_RUNS_PER_DAY) || 4);
  const out: Record<string, AggregatorStats> = {};
  for (const src of AGGREGATORS) {
    out[src.id] = await runAggregator(src, { log, runsPerDay, maxCalls: opts.maxCalls });
    const s = out[src.id];
    log(s.skipped ? `- ${src.label}: skipped, ${s.skipped}` : `✓ ${src.label}: ${s.queries} queries, ${s.calls} calls, ${s.jobsSeen} jobs, ${s.jobsNew} new, ${s.duplicates} duplicates, ${s.errors} errors`);
  }
  const expired = await expireAggregatorJobs();
  await classifyUnclassified();
  return { sources: out, expired };
}
