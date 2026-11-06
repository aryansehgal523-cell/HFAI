import { and, desc, eq, gte, ilike, isNull, lte, or, sql, inArray, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { companies, jobs } from "@/db/schema";

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
    page: Math.max(1, Number(one("page") ?? 1) || 1),
  };
}

export async function searchJobs(f: JobFilters) {
  const where: SQL[] = [isNull(jobs.closedAt)];
  if (!f.showGhost) where.push(lte(jobs.ghostScore, 40));

  if (f.q) {
    const terms = f.q.split(/\s+/).filter(Boolean).slice(0, 6);
    for (const t of terms) {
      const like = `%${t.replace(/[%_]/g, "")}%`;
      where.push(or(ilike(jobs.title, like), ilike(companies.name, like), sql`${jobs.skills} @> ARRAY[${t.toLowerCase()}]::text[]`)!);
    }
  }
  if (f.location) where.push(ilike(jobs.location, `%${f.location.replace(/[%_]/g, "")}%`));
  if (f.mode?.length) where.push(inArray(jobs.workMode, f.mode as ("REMOTE" | "HYBRID" | "ONSITE")[]));
  if (f.country) where.push(eq(jobs.country, f.country));
  if (f.salary === "with") where.push(sql`(${jobs.salaryMin} IS NOT NULL OR ${jobs.salaryMax} IS NOT NULL)`);
  if (f.posted) where.push(gte(jobs.postedAt, new Date(Date.now() - Number(f.posted) * 86_400_000)));
  if (f.exp) {
    const [lo, hi] = f.exp === "8+" ? [8, 50] : f.exp.split("-").map(Number);
    // Overlap between the job's range and the chosen band; unknown experience always matches.
    where.push(sql`(${jobs.experienceMin} IS NULL OR (${jobs.experienceMin} <= ${hi} AND COALESCE(${jobs.experienceMax}, ${jobs.experienceMin} + 3) >= ${lo}))`);
  }

  const page = f.page ?? 1;
  const base = db
    .select({
      id: jobs.id, title: jobs.title, location: jobs.location, workMode: jobs.workMode,
      salaryMin: jobs.salaryMin, salaryMax: jobs.salaryMax, salaryCurrency: jobs.salaryCurrency, salaryPeriod: jobs.salaryPeriod,
      experienceMin: jobs.experienceMin, experienceMax: jobs.experienceMax, skills: jobs.skills,
      postedAt: jobs.postedAt, employment: jobs.employment, ghostScore: jobs.ghostScore,
      companyName: companies.name, companySlug: companies.slug, companyIndustry: companies.industry,
    })
    .from(jobs)
    .innerJoin(companies, eq(companies.id, jobs.companyId))
    .where(and(...where));

  const [rows, [{ count }]] = await Promise.all([
    base.orderBy(desc(jobs.postedAt)).limit(PAGE_SIZE).offset((page - 1) * PAGE_SIZE),
    db.select({ count: sql<number>`count(*)::int` }).from(jobs).innerJoin(companies, eq(companies.id, jobs.companyId)).where(and(...where)),
  ]);
  return { rows, total: count, page, pages: Math.max(1, Math.ceil(count / PAGE_SIZE)) };
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

export async function siteStats() {
  const [r] = await db
    .select({
      open: sql<number>`count(*) filter (where ${jobs.closedAt} is null and ${jobs.ghostScore} <= 40)::int`,
      companies: sql<number>`count(distinct ${jobs.companyId})::int`,
      today: sql<number>`count(*) filter (where ${jobs.firstSeenAt} > now() - interval '1 day')::int`,
    })
    .from(jobs);
  return r;
}
