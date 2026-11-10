import { and, desc, eq, gte, inArray, isNull, lte, max, sql } from "drizzle-orm";
import { db } from "@/db";
import { companies, jobMatches, jobs, profiles } from "@/db/schema";
import { matchJob, type MatchProfile } from "./matching";
import { rerankMatches } from "./ai";

/** Company filters from the user's preferences, as SQL over the companies table (null when there are none). */
export function companyPreferenceSql(prefs: { mncOnly?: boolean; companyTypes?: string[] } | null | undefined) {
  const parts = [];
  if (prefs?.mncOnly) parts.push(sql`${companies.isMnc} = true`);
  if (prefs?.companyTypes?.length) parts.push(sql`${companies.companyType} IN (${sql.join(prefs.companyTypes.map((t) => sql`${t}`), sql`, `)})`);
  return parts.length ? sql.join(parts, sql` AND `) : null;
}

export async function matchProfileFor(userId: string): Promise<{ profile: MatchProfile; updatedAt: Date; companyFilter: ReturnType<typeof companyPreferenceSql> } | null> {
  const [p] = await db.select().from(profiles).where(eq(profiles.userId, userId)).limit(1);
  if (!p?.data) return null;
  const prefs = p.preferences;
  return {
    updatedAt: p.updatedAt,
    companyFilter: companyPreferenceSql(prefs),
    profile: {
      resume: p.data,
      years: p.applicationDetails?.totalExperienceYears ?? prefs?.experienceYears,
      targetRoles: prefs?.targetRoles,
      cities: prefs?.cities,
      workModes: prefs?.workModes,
      expectedSalaryLpa: prefs?.expectedSalaryLpa ?? p.applicationDetails?.expectedCtcLpa,
      openToRelocation: prefs?.openToRelocation ?? p.applicationDetails?.willingToRelocate,
    },
  };
}

const openJobs = and(isNull(jobs.closedAt), lte(jobs.ghostScore, 40));

/** Score open jobs for one user (all, or just these ids) and store the results. */
export async function computeMatchesForUser(userId: string, jobIds?: string[]) {
  const mp = await matchProfileFor(userId);
  if (!mp) return 0;
  const rows = await db
    .select({
      id: jobs.id, title: jobs.title, description: jobs.description, skills: jobs.skills, location: jobs.location, workMode: jobs.workMode,
      experienceMin: jobs.experienceMin, experienceMax: jobs.experienceMax, salaryMin: jobs.salaryMin, salaryMax: jobs.salaryMax,
      salaryCurrency: jobs.salaryCurrency, salaryPeriod: jobs.salaryPeriod, postedAt: jobs.postedAt,
    })
    .from(jobs)
    .innerJoin(companies, eq(companies.id, jobs.companyId))
    .where(and(jobIds ? and(openJobs, inArray(jobs.id, jobIds)) : openJobs, mp.companyFilter ?? sql`true`));
  if (!jobIds && mp.companyFilter) {
    // Preferences changed to exclude some companies: drop their stored matches.
    await db.execute(sql`DELETE FROM job_matches WHERE user_id = ${userId} AND job_id IN (
      SELECT jobs.id FROM jobs JOIN companies ON companies.id = jobs.company_id WHERE NOT (${mp.companyFilter}))`);
  }
  const now = new Date();
  const values = rows.map((j) => {
    const m = matchJob(mp.profile, j, now);
    return { userId, jobId: j.id, score: m.score, reasons: m.reasons, missing: m.missing, computedAt: now };
  });
  for (let i = 0; i < values.length; i += 1000) {
    await db.insert(jobMatches).values(values.slice(i, i + 1000)).onConflictDoUpdate({
      target: [jobMatches.userId, jobMatches.jobId],
      set: { score: sql`excluded.score`, reasons: sql`excluded.reasons`, missing: sql`excluded.missing`, computedAt: sql`excluded.computed_at` },
    });
  }
  return values.length;
}

/** Recompute when the profile changed after the last computation, or nothing is stored yet. */
export async function ensureMatches(userId: string) {
  const mp = await matchProfileFor(userId);
  if (!mp) return false;
  const [{ last }] = await db.select({ last: max(jobMatches.computedAt) }).from(jobMatches).where(eq(jobMatches.userId, userId));
  if (!last || last < mp.updatedAt || Date.now() - last.getTime() > 24 * 3600_000) await computeMatchesForUser(userId);
  return true;
}

export async function storedMatches(userId: string, jobIds: string[]) {
  if (!jobIds.length) return new Map<string, typeof jobMatches.$inferSelect>();
  const rows = await db.select().from(jobMatches).where(and(eq(jobMatches.userId, userId), inArray(jobMatches.jobId, jobIds)));
  return new Map(rows.map((r) => [r.jobId, r]));
}

/** "For you": open jobs ranked by match score. */
export async function forYou(userId: string, page = 1, pageSize = 20) {
  const where = and(eq(jobMatches.userId, userId), openJobs);
  const [rows, [{ count }]] = await Promise.all([
    db.select({
      id: jobs.id, title: jobs.title, location: jobs.location, workMode: jobs.workMode,
      salaryMin: jobs.salaryMin, salaryMax: jobs.salaryMax, salaryCurrency: jobs.salaryCurrency, salaryPeriod: jobs.salaryPeriod,
      experienceMin: jobs.experienceMin, experienceMax: jobs.experienceMax, skills: jobs.skills,
      postedAt: jobs.postedAt, employment: jobs.employment, ghostScore: jobs.ghostScore,
      companyName: companies.name, companySlug: companies.slug, companyIndustry: companies.industry, source: jobs.source, companyIsMnc: companies.isMnc,
      score: jobMatches.score, reasons: jobMatches.reasons, aiVerdict: jobMatches.aiVerdict, aiReason: jobMatches.aiReason,
    })
      .from(jobMatches)
      .innerJoin(jobs, eq(jobs.id, jobMatches.jobId))
      .innerJoin(companies, eq(companies.id, jobs.companyId))
      .where(where)
      .orderBy(desc(jobMatches.score), desc(jobs.postedAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ count: sql<number>`count(*)::int` }).from(jobMatches).innerJoin(jobs, eq(jobs.id, jobMatches.jobId)).where(where),
  ]);
  return { rows, total: count, page, pages: Math.max(1, Math.ceil(count / pageSize)) };
}

/**
 * Premium: once a day, ask the fast model for a verdict on the top 30 matches.
 * Returns how many rows got a fresh verdict (0 when the cache is still fresh).
 */
export async function aiRerankIfDue(userId: string) {
  const top = await db
    .select({ jobId: jobMatches.jobId, score: jobMatches.score, aiAt: jobMatches.aiAt, title: jobs.title, company: companies.name, location: jobs.location, workMode: jobs.workMode, skills: jobs.skills, description: jobs.description, expMin: jobs.experienceMin, expMax: jobs.experienceMax })
    .from(jobMatches)
    .innerJoin(jobs, eq(jobs.id, jobMatches.jobId))
    .innerJoin(companies, eq(companies.id, jobs.companyId))
    .where(and(eq(jobMatches.userId, userId), openJobs))
    .orderBy(desc(jobMatches.score))
    .limit(30);
  if (!top.length) return 0;
  const fresh = top.every((t) => t.aiAt && Date.now() - t.aiAt.getTime() < 24 * 3600_000);
  if (fresh) return 0;
  const mp = await matchProfileFor(userId);
  if (!mp) return 0;
  const verdicts = await rerankMatches(mp.profile, top.map((t) => ({
    id: t.jobId, title: t.title, company: t.company, location: `${t.location} (${t.workMode.toLowerCase()})`,
    experience: t.expMin === null ? "not stated" : `${t.expMin}${t.expMax ? ` to ${t.expMax}` : "+"} years`,
    skills: t.skills.slice(0, 10), summary: t.description.slice(0, 600),
  })));
  const now = new Date();
  const known = new Set(top.map((t) => t.jobId));
  for (const v of verdicts) {
    if (!known.has(v.id)) continue; // ignore anything the model invented
    await db.update(jobMatches).set({ aiVerdict: v.verdict, aiReason: v.reason.slice(0, 280), aiAt: now })
      .where(and(eq(jobMatches.userId, userId), eq(jobMatches.jobId, v.id)));
  }
  return verdicts.length;
}

/** After a crawl: score new jobs for recently active users (bounded so the cron stays fast). */
export async function matchNewJobsForActiveUsers(sinceHours = 48, maxUsers = 200) {
  const since = new Date(Date.now() - sinceHours * 3600_000);
  const fresh = await db.select({ id: jobs.id }).from(jobs).where(and(openJobs, gte(jobs.firstSeenAt, since)));
  if (!fresh.length) return { users: 0, jobs: 0 };
  const active = await db.select({ userId: profiles.userId }).from(profiles)
    .where(gte(profiles.updatedAt, new Date(Date.now() - 30 * 86_400_000))).orderBy(desc(profiles.updatedAt)).limit(maxUsers);
  const ids = fresh.map((f) => f.id);
  for (const a of active) await computeMatchesForUser(a.userId, ids);
  return { users: active.length, jobs: ids.length };
}
