import type { Metadata } from "next";
import Link from "next/link";
import { and, desc, eq, ne } from "drizzle-orm";
import { Sparkles } from "lucide-react";
import { db } from "@/db";
import { applications, companies, jobs, profiles, referralRequests, tailorings } from "@/db/schema";
import { requireUser } from "@/lib/session";
import { Tracker, type TrackerItem } from "@/components/Tracker";
import { PLANS } from "@/lib/plans";
import { after } from "next/server";
import { aiRerankIfDue, ensureMatches, forYou } from "@/lib/match-store";

export const metadata: Metadata = { title: "Application tracker" };

export default async function Dashboard() {
  const user = await requireUser("/dashboard");
  const [rows, tailored, [profile], referrals] = await Promise.all([
    db
      .select({
        id: applications.id, jobId: applications.jobId, status: applications.status, updatedAt: applications.updatedAt,
        title: jobs.title, location: jobs.location, closedAt: jobs.closedAt, company: companies.name,
      })
      .from(applications)
      .innerJoin(jobs, eq(jobs.id, applications.jobId))
      .innerJoin(companies, eq(companies.id, jobs.companyId))
      .where(and(eq(applications.userId, user.id), ne(applications.status, "HIDDEN")))
      .orderBy(desc(applications.updatedAt)),
    db.select({ jobId: tailorings.jobId }).from(tailorings).where(eq(tailorings.userId, user.id)),
    db.select({ id: profiles.id, data: profiles.data }).from(profiles).where(eq(profiles.userId, user.id)).limit(1),
    db.select({ jobId: referralRequests.jobId, status: referralRequests.status }).from(referralRequests)
      .where(eq(referralRequests.userId, user.id)).orderBy(desc(referralRequests.updatedAt)),
  ]);
  // Most advanced status per job wins (referred > replied > sent > ...).
  const RANK: Record<string, number> = { referred: 6, replied: 5, sent: 4, declined: 3, no_response: 2, drafted: 1 };
  const referralBy = new Map<string, string>();
  for (const r of referrals) if ((RANK[r.status] ?? 0) > (RANK[referralBy.get(r.jobId) ?? ""] ?? 0)) referralBy.set(r.jobId, r.status);
  const tailoredSet = new Set(tailored.map((t) => t.jobId));
  const items: TrackerItem[] = rows.map((r) => ({
    id: r.id,
    jobId: r.jobId,
    status: r.status as TrackerItem["status"],
    title: r.title,
    company: r.company,
    location: r.location,
    updatedAt: r.updatedAt.toISOString(),
    tailored: tailoredSet.has(r.jobId),
    closed: Boolean(r.closedAt),
    referral: referralBy.get(r.jobId) ?? null,
  }));
  const premium = user.plan === "PREMIUM";
  const hasMatches = profile?.data ? await ensureMatches(user.id) : false;
  const top = hasMatches ? (await forYou(user.id, 1, premium ? 10 : 3)).rows : [];
  // The daily AI verdicts run after this response is sent; they show on the next visit.
  if (premium && hasMatches) after(() => aiRerankIfDue(user.id).catch((e) => console.error("rerank failed", e)));

  const applied = items.filter((i) => ["APPLIED", "INTERVIEWING", "OFFER"].includes(i.status)).length;
  const allowance = user.plan === "PREMIUM" ? PLANS.monthly.monthlyCredits : PLANS.free.monthlyCredits;
  const resetsOn = new Date(new Date(user.creditsResetAt).getTime() + 30 * 86_400_000);

  return (
    <div className="container-x py-12">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <h1 className="text-4xl font-semibold">Hi {user.name?.split(" ")[0] ?? "there"}</h1>
          <p className="mt-2 text-slate">
            {applied} {applied === 1 ? "application" : "applications"} sent, {tailored.length} tailored {tailored.length === 1 ? "resume" : "resumes"} so far.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="panel flex items-center gap-4 px-5 py-3">
            <div>
              <p className="text-xs text-slate">Credits this month</p>
              <p className="font-display text-2xl font-semibold tabular-nums">{user.credits}<span className="text-base font-normal text-slate"> / {allowance}</span></p>
            </div>
            <div className="h-10 w-px bg-line" />
            <p className="text-xs text-slate">Refills on<br /><span className="text-ink">{resetsOn.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</span></p>
          </div>
          {user.plan === "FREE" && (
            <Link href="/pricing" className="btn-primary"><Sparkles className="h-4 w-4" />Get 30 credits a month</Link>
          )}
        </div>
      </div>

      {!profile?.data && (
        <div className="mt-8 flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-cobalt-tint px-6 py-5">
          <p className="text-ink"><span className="font-semibold">Add your master resume</span> so HireFlow can tailor it to the jobs you save.</p>
          <Link href="/profile" className="btn-primary btn-sm">Add resume</Link>
        </div>
      )}

      {top.length > 0 && (
        <section aria-labelledby="top-title" className="panel mt-8 p-6">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 id="top-title" className="text-xl font-semibold">{premium ? "Top 10 for you today" : "Your best matches"}</h2>
            <Link href="/jobs?tab=foryou" className="text-sm text-cobalt underline-offset-2 hover:underline">See all matches</Link>
          </div>
          <ol className="mt-4 divide-y divide-line">
            {top.map((j, i) => (
              <li key={j.id} className="flex items-start gap-4 py-3">
                <span className="w-6 shrink-0 pt-0.5 font-display text-lg font-semibold text-slate">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <Link href={`/jobs/${j.id}`} className="font-medium hover:text-cobalt">{j.title}</Link>
                  <p className="text-sm text-slate">{j.companyName} · {j.location}</p>
                  {premium && j.aiReason && <p className="mt-1 text-sm text-ink-soft">{j.aiVerdict === "strong" ? "Strong fit: " : j.aiVerdict === "good" ? "Good fit: " : "Stretch: "}{j.aiReason}</p>}
                </div>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${j.score >= 75 ? "bg-mint-tint text-mint-ink" : "bg-paper text-slate"}`}>{j.score}%</span>
              </li>
            ))}
          </ol>
          {!premium && <p className="mt-3 text-sm text-slate"><Link href="/pricing" className="text-cobalt underline underline-offset-2">Premium</Link> ranks a fresh top 10 every day with an AI verdict on each.</p>}
        </section>
      )}

      <div className="mt-10">
        <Tracker initial={items} />
      </div>
    </div>
  );
}
