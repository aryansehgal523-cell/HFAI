import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { companies, jobs, profiles, tailorings, type User } from "@/db/schema";
import { canonicalJobUrl, parseAtsUrl } from "./ats-url";
import { slugify } from "./utils";

/** The HireFlow job behind an application page URL, if we know it. */
export async function findJobByUrl(url: string) {
  const ref = parseAtsUrl(url);
  if (ref.jobId) {
    const [byId] = await db.select({ id: jobs.id, title: jobs.title, company: companies.name }).from(jobs)
      .innerJoin(companies, eq(companies.id, jobs.companyId)).where(eq(jobs.externalId, ref.jobId)).limit(1);
    if (byId) return byId;
  }
  const canon = canonicalJobUrl(url);
  const [byUrl] = await db.select({ id: jobs.id, title: jobs.title, company: companies.name }).from(jobs)
    .innerJoin(companies, eq(companies.id, jobs.companyId))
    .where(sql`lower(regexp_replace(regexp_replace(${jobs.applyUrl}, '^https?://(www\\.)?', ''), '/(apply|application)/?$|/+$|\\?.*$', '', 'g')) = ${canon}`)
    .limit(1);
  return byUrl ?? null;
}

/** Everything a form might ask for. Free users get contact details only. */
export async function extProfile(user: User, full: boolean) {
  const [p] = await db.select().from(profiles).where(eq(profiles.userId, user.id)).limit(1);
  const r = p?.data;
  const d = p?.applicationDetails;
  const [first, ...rest] = (r?.name ?? user.name ?? "").trim().split(/\s+/);
  const contact = {
    fullName: r?.name ?? user.name ?? "",
    firstName: first ?? "",
    lastName: rest.join(" "),
    email: r?.contact?.email ?? user.email,
    phone: d?.phone ?? r?.contact?.phone ?? user.phone ?? "",
    city: d?.city ?? r?.contact?.location?.split(",")[0]?.trim() ?? "",
    linkedin: d?.linkedinUrl ?? r?.contact?.links?.find((l) => /linkedin\.com/i.test(l)) ?? "",
  };
  if (!full) return { plan: user.plan, contact };
  const current = r?.experience?.[0];
  // No end date usually means the role is current.
  const ended = Boolean(current?.end && !/present|current|now|till date/i.test(current.end));
  return {
    plan: user.plan,
    contact: {
      ...contact,
      github: d?.githubUrl ?? r?.contact?.links?.find((l) => /github\.com/i.test(l)) ?? "",
      website: d?.portfolioUrl ?? "",
      state: d?.state ?? "",
      pinCode: d?.pinCode ?? "",
    },
    work: {
      currentCompany: current && !ended ? current.company : "",
      currentTitle: current?.title ?? r?.headline ?? "",
      totalExperienceYears: d?.totalExperienceYears ?? null,
      currentCtcLpa: d?.currentCtcLpa ?? null,
      expectedCtcLpa: d?.expectedCtcLpa ?? p?.preferences?.expectedSalaryLpa ?? null,
      noticePeriod: d?.noticePeriod ?? p?.preferences?.noticePeriod ?? null,
      earliestStartDate: d?.earliestStartDate ?? null,
    },
    eligibility: {
      authorisedToWorkInIndia: d?.authorisedToWorkInIndia ?? null,
      needsVisaSponsorship: d?.needsVisaSponsorship ?? null,
      willingToRelocate: d?.willingToRelocate ?? p?.preferences?.openToRelocation ?? null,
    },
    eeo: { gender: d?.gender ?? "Prefer not to say", disability: d?.disability ?? "Prefer not to say", veteran: d?.veteran ?? "Prefer not to say" },
    education: r?.education ?? [],
    experience: r?.experience ?? [],
    skills: r?.skills.flatMap((s) => s.items) ?? [],
  };
}

/** Tailored resume for the job if there is one, otherwise the master. */
export async function resumeForJob(userId: string, jobId: string | null) {
  if (jobId) {
    const [t] = await db.select({ resume: tailorings.resume }).from(tailorings).where(and(eq(tailorings.userId, userId), eq(tailorings.jobId, jobId))).limit(1);
    if (t) return { resume: t.resume, tailored: true };
  }
  const [p] = await db.select({ data: profiles.data }).from(profiles).where(eq(profiles.userId, userId)).limit(1);
  return p?.data ? { resume: p.data, tailored: false } : null;
}

/** A job HireFlow did not crawl, recorded so the tracker can show it. */
export async function upsertManualJob(input: { url: string; title: string; company: string }) {
  const companyName = input.company.trim().slice(0, 120) || new URL(input.url).hostname.replace(/^www\./, "");
  const slug = `manual-${slugify(companyName)}`.slice(0, 80);
  const [co] = await db.insert(companies).values({ name: companyName, slug, ats: "MANUAL", atsToken: slug, active: false })
    .onConflictDoUpdate({ target: companies.slug, set: { name: companyName } }).returning({ id: companies.id });
  const externalId = `url:${canonicalJobUrl(input.url)}`.slice(0, 300);
  const [job] = await db.insert(jobs).values({
    companyId: co.id, externalId, title: input.title.trim().slice(0, 200) || "Job application", location: "Not specified",
    description: "Added from the HireFlow Chrome extension when you applied.", applyUrl: input.url, postedAt: new Date(), hash: externalId,
  }).onConflictDoUpdate({ target: [jobs.companyId, jobs.externalId], set: { lastSeenAt: new Date() } }).returning({ id: jobs.id });
  return job.id;
}

export const findJobByUrlOrId = async (url: string, jobId?: string | null) => {
  if (jobId) {
    const [j] = await db.select({ id: jobs.id, title: jobs.title, company: companies.name }).from(jobs).innerJoin(companies, eq(companies.id, jobs.companyId)).where(eq(jobs.id, jobId)).limit(1);
    if (j) return j;
  }
  return findJobByUrl(url);
};
