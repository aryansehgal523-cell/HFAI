import { and, desc, eq, gte, ilike, isNull, lte, or, sql, inArray, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { companies, jobs } from "@/db/schema";
import { COMPANY_TYPES, type CompanyType } from "@/lib/company-type";
import { functionFromSlug, type JobFunction } from "@/lib/job-function";

export type JobFilters = {
  q?: string;
  location?: string;
  mode?: string[]; // REMOTE | HYBRID | ONSITE
  exp?: string; // "0-1", "1-3", "3-5", "5-8", "8+"
  posted?: string; // "1", "3", "7", "30" days
  salary?: string; // "with" to only show jobs with pay
  country?: string;
  showGhost?: boolean;
  page?: number;
  /** "Jobs where you know someone" (resolved to company ids by the page). */
  network?: boolean;
  companyIds?: string[];
  /** Job function (?fn=data-and-ai). */
  fn?: JobFunction;
  /** Only jobs at MNCs (?mnc=1). */
  mnc?: boolean;
  /** Company types (?ctype=UNICORN,GCC). */
  ctype?: CompanyType[];
};

export const PAGE_SIZE = 20;

export function parseFilters(sp: Record<string, string | string[] | undefined>): JobFilters {
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k]![0] : (sp[k] as string | undefined)) || undefined;
  const many = (k: string) => (sp[k] ? (Array.isArray(sp[k]) ? (sp[k] as string[]) : String(sp[k]).split(",")) : undefined);
  return {
    q: one("q")?.slice(0, 100),
    location: one("location")?.slice(0, 80),
    mode: many("mode")?.filter((m) => ["REMOTE", "HYBRID", "ONSITE"].includes(m)),
    exp: one("exp"),
    posted: one("posted"),
    salary: one("salary"),
    country: one("country"),
    showGhost: one("ghost") === "1",
    network: one("network") === "1",
    mnc: one("mnc") === "1",
    fn: functionFromSlug(one("fn") ?? ""),
    ctype: many("ctype")?.filter((t): t is CompanyType => (COMPANY_TYPES as readonly string[]).includes(t)),
    page: Math.max(1, Number(one("page") ?? 1) || 1),
  };
}

/**
 * How widely a search matches, tried in order until enough jobs are found:
 *   main   title, company and skills (jobs.search_main), so "product manager" means product manager jobs
 *   full   also the description (jobs.search)
 *   typos  also trigram word similarity on the title ("devloper" finds "Developer")
 */
type Tier = "main" | "full" | "typos";
function textCondition(q: string, tier: Tier): SQL {
  if (tier === "main") return sql`${jobs.searchMain} @@ websearch_to_tsquery('english', ${q})`;
  if (tier === "full") return sql`${jobs.search} @@ websearch_to_tsquery('english', ${q})`;
  return sql`(${jobs.search} @@ websearch_to_tsquery('english', ${q}) OR ${q} <% ${jobs.title})`;
}

/** Every filter except the text search and the company type filters. */
function baseConditions(f: JobFilters): SQL[] {
  const where: SQL[] = [isNull(jobs.closedAt)];
  if (!f.showGhost) where.push(lte(jobs.ghostScore, 40));
  if (f.location) where.push(ilike(jobs.location, `%${f.location.replace(/[%_]/g, "")}%`));
  if (f.mode?.length) where.push(inArray(jobs.workMode, f.mode as ("REMOTE" | "HYBRID" | "ONSITE")[]));
  if (f.country) where.push(eq(jobs.country, f.country));
  if (f.fn) where.push(eq(jobs.jobFunction, f.fn));
  if (f.companyIds) where.push(f.companyIds.length ? inArray(jobs.companyId, f.companyIds) : sql`false`);
  if (f.salary === "with") where.push(sql`(${jobs.salaryMin} IS NOT NULL OR ${jobs.salaryMax} IS NOT NULL)`);
  if (f.posted) where.push(gte(jobs.postedAt, new Date(Date.now() - Number(f.posted) * 86_400_000)));
  if (f.exp) {
    const [lo, hi] = f.exp === "8+" ? [8, 50] : f.exp.split("-").map(Number);
    // Overlap between the job's range and the chosen band; unknown experience always matches.
    where.push(sql`(${jobs.experienceMin} IS NULL OR (${jobs.experienceMin} <= ${hi} AND COALESCE(${jobs.experienceMax}, ${jobs.experienceMin} + 3) >= ${lo}))`);
  }
  return where;
}

function companyTypeConditions(f: JobFilters): SQL[] {
  const where: SQL[] = [];
  if (f.mnc) where.push(eq(companies.isMnc, true));
  if (f.ctype?.length) where.push(inArray(companies.companyType, f.ctype));
  return where;
}

/**
 * Speed at tens of thousands of jobs: a search ranks only its newest RANK_WINDOW matches (relevance blends
 * with freshness, so the best results are among them), and counts stop at COUNT_CAP ("10,000+ jobs").
 */
export const RANK_WINDOW = 2000;
export const COUNT_CAP = 10_000;
/** When full text search finds fewer jobs than this, try again allowing typos. */
const TYPO_FALLBACK_BELOW = 20;

type Executor = Pick<typeof db, "select" | "execute">;

async function cappedCount(ex: Executor, where: SQL[]): Promise<number> {
  const r = await ex.execute<{ n: number }>(
    sql`SELECT count(*)::int AS n FROM (SELECT 1 FROM ${jobs} INNER JOIN ${companies} ON ${companies.id} = ${jobs.companyId} WHERE ${and(...where)} LIMIT ${COUNT_CAP + 1}) t`,
  );
  return Number(r.rows[0]?.n ?? 0);
}

/** Jobs matching the other filters, by company type, for the chip counts (capped like the total). */
export async function companyTypeCounts(f: JobFilters) {
  let text: SQL[] = [];
  if (f.q) {
    // Same first choice as searchJobs: title, company and skills, or the description when that finds little.
    const main = textCondition(f.q, "main");
    const few = (await cappedCount(db, [...baseConditions(f), main])) < TYPO_FALLBACK_BELOW;
    text = [few ? textCondition(f.q, "full") : main];
  }
  const where = [...baseConditions(f), ...text, ...(f.mnc ? [eq(companies.isMnc, true)] : [])];
  const rows = await db.execute<{ type: CompanyType | null; mnc: boolean; n: number }>(sql`
    SELECT t.company_type AS type, t.is_mnc AS mnc, count(*)::int AS n FROM (
      SELECT ${companies.companyType}, ${companies.isMnc} FROM ${jobs} INNER JOIN ${companies} ON ${companies.id} = ${jobs.companyId}
      WHERE ${and(...where)} LIMIT ${COUNT_CAP + 1}
    ) t GROUP BY 1, 2`);
  const byType: Partial<Record<CompanyType, number>> = {};
  let mnc = 0;
  for (const r of rows.rows) {
    if (r.type) byType[r.type] = (byType[r.type] ?? 0) + Number(r.n);
    if (r.mnc) mnc += Number(r.n);
  }
  return { byType, mnc };
}

const listColumns = {
  id: jobs.id, title: jobs.title, location: jobs.location, workMode: jobs.workMode,
  salaryMin: jobs.salaryMin, salaryMax: jobs.salaryMax, salaryCurrency: jobs.salaryCurrency, salaryPeriod: jobs.salaryPeriod,
  experienceMin: jobs.experienceMin, experienceMax: jobs.experienceMax, skills: jobs.skills,
  postedAt: jobs.postedAt, employment: jobs.employment, ghostScore: jobs.ghostScore,
  companyName: companies.name, companySlug: companies.slug, companyIndustry: companies.industry,
  source: jobs.source, companyIsMnc: companies.isMnc,
};

/** Ids for one page of a search: newest RANK_WINDOW matches, ranked by relevance and freshness. */
async function rankedIds(ex: Executor, q: string, where: SQL[], page: number) {
  const cand = ex
    .select({ id: jobs.id, search: jobs.search, title: jobs.title, postedAt: jobs.postedAt })
    .from(jobs)
    .innerJoin(companies, eq(companies.id, jobs.companyId))
    .where(and(...where))
    .orderBy(desc(jobs.postedAt))
    .limit(RANK_WINDOW)
    .as("cand");
  // Text relevance (title and company weigh most) plus title similarity, divided by a freshness factor
  // that halves the score for a job about two weeks old.
  const rank = sql`(ts_rank_cd(${cand.search}, websearch_to_tsquery('english', ${q})) + 0.5 * word_similarity(${q}, ${cand.title}))
    / (1 + GREATEST(EXTRACT(EPOCH FROM (now() - ${cand.postedAt})) / 86400, 0) / 14)`;
  const rows = await ex.select({ id: cand.id }).from(cand).orderBy(desc(rank), desc(cand.postedAt)).limit(PAGE_SIZE).offset((page - 1) * PAGE_SIZE);
  return rows.map((r) => r.id);
}

export async function searchJobs(f: JobFilters) {
  const page = f.page ?? 1;
  const filters = [...baseConditions(f), ...companyTypeConditions(f)];

  if (!f.q) {
    const [rows, count] = await Promise.all([
      db.select(listColumns).from(jobs).innerJoin(companies, eq(companies.id, jobs.companyId)).where(and(...filters))
        .orderBy(desc(jobs.postedAt)).limit(PAGE_SIZE).offset((page - 1) * PAGE_SIZE),
      cappedCount(db, filters),
    ]);
    return { rows, total: Math.min(count, COUNT_CAP), capped: count > COUNT_CAP, page, pages: Math.max(1, Math.ceil(Math.min(count, COUNT_CAP) / PAGE_SIZE)) };
  }

  const q = f.q;
  let where = [...filters, textCondition(q, "main")];
  let [ids, count] = await Promise.all([rankedIds(db, q, where, page), cappedCount(db, where)]);
  if (count < TYPO_FALLBACK_BELOW) {
    // Few matches in titles, companies and skills: look in descriptions too.
    where = [...filters, textCondition(q, "full")];
    [ids, count] = await Promise.all([rankedIds(db, q, where, page), cappedCount(db, where)]);
  }
  if (count < TYPO_FALLBACK_BELOW) {
    // Few exact matches: allow typos. SET LOCAL keeps the looser threshold inside this transaction only.
    where = [...filters, textCondition(q, "typos")];
    [ids, count] = await db.transaction(async (tx) => {
      await tx.execute(sql`SET LOCAL pg_trgm.word_similarity_threshold = 0.45`);
      return [await rankedIds(tx, q, where, page), await cappedCount(tx, where)] as const;
    });
  }
  const found = ids.length
    ? await db.select(listColumns).from(jobs).innerJoin(companies, eq(companies.id, jobs.companyId)).where(inArray(jobs.id, ids))
    : [];
  const order = new Map(ids.map((id, i) => [id, i]));
  const rows = found.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  const shown = Math.min(count, COUNT_CAP);
  return { rows, total: shown, capped: count > COUNT_CAP, page, pages: Math.max(1, Math.min(Math.ceil(shown / PAGE_SIZE), RANK_WINDOW / PAGE_SIZE)) };
}

export type JobRow = Awaited<ReturnType<typeof searchJobs>>["rows"][number];

export async function getJob(id: string) {
  const [row] = await db
    .select({ job: jobs, company: companies })
    .from(jobs)
    .innerJoin(companies, eq(companies.id, jobs.companyId))
    .where(eq(jobs.id, id))
    .limit(1);
  return row ?? null;
}

/** Live numbers for the home page: open jobs, companies hiring, new today, jobs at MNCs, jobs in India. */
export async function siteStats() {
  const [r] = await db
    .select({
      open: sql<number>`count(*)::int`,
      companies: sql<number>`count(distinct ${jobs.companyId})::int`,
      today: sql<number>`count(*) filter (where ${jobs.firstSeenAt} > now() - interval '1 day')::int`,
      mnc: sql<number>`count(*) filter (where ${companies.isMnc})::int`,
      india: sql<number>`count(*) filter (where ${jobs.country} = 'IN')::int`,
    })
    .from(jobs)
    .innerJoin(companies, eq(companies.id, jobs.companyId))
    .where(and(isNull(jobs.closedAt), lte(jobs.ghostScore, 40)));
  return r;
}
