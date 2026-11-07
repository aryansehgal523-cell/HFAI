import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { ArrowLeft, ExternalLink, MapPin, Briefcase, Clock, AlertTriangle, CheckCircle2 } from "lucide-react";
import { db } from "@/db";
import { applications, connections, profiles, referralRequests, tailorings } from "@/db/schema";
import { getJob } from "@/lib/jobs-query";
import { getCurrentUser } from "@/lib/session";
import { atsScore, prettySkill, resumeToText } from "@/lib/ats";
import { formatSalary, timeAgo } from "@/lib/utils";
import { CompanyAvatar } from "@/components/CompanyAvatar";
import { SaveButton } from "@/components/SaveButton";
import { TailorButton } from "@/components/TailorButton";
import { NetworkCard, type NetworkPerson } from "@/components/NetworkCard";
import { initialsPreview, networkAt } from "@/lib/referrals/store";
import { alumniSearchUrl, rankPeople } from "@/lib/referrals/rank";
import { matchJob } from "@/lib/matching";
import { matchProfileFor, storedMatches } from "@/lib/match-store";

type Params = Promise<{ id: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const found = await getJob((await params).id);
  if (!found) return { title: "Job not found" };
  return {
    title: `${found.job.title} at ${found.company.name}`,
    description: `${found.job.title} at ${found.company.name}, ${found.job.location}. Apply on the company site and get a tailored resume with HireFlow AI.`,
  };
}

const MODE: Record<string, string> = { REMOTE: "Remote", HYBRID: "Hybrid", ONSITE: "On site" };

export default async function JobPage({ params }: { params: Params }) {
  const { id } = await params;
  const found = await getJob(id);
  if (!found) notFound();
  const { job, company } = found;
  const user = await getCurrentUser();

  const [profile, tailoring, app] = user
    ? await Promise.all([
        db.select().from(profiles).where(eq(profiles.userId, user.id)).limit(1).then((r) => r[0]),
        db.select({ id: tailorings.id }).from(tailorings).where(and(eq(tailorings.userId, user.id), eq(tailorings.jobId, job.id))).limit(1).then((r) => r[0]),
        db.select().from(applications).where(and(eq(applications.userId, user.id), eq(applications.jobId, job.id))).limit(1).then((r) => r[0]),
      ])
    : [undefined, undefined, undefined];

  // Referral engine: who the user knows here. Free users only get a count and initials.
  let network: React.ComponentProps<typeof NetworkCard> | null = null;
  if (user) {
    const [people, [anyConn], requests] = await Promise.all([
      networkAt(user.id, company.name),
      db.select({ id: connections.id }).from(connections).where(eq(connections.userId, user.id)).limit(1),
      db.select({ connectionId: referralRequests.connectionId, status: referralRequests.status }).from(referralRequests)
        .where(and(eq(referralRequests.userId, user.id), eq(referralRequests.jobId, job.id))),
    ]);
    const ranked = rankPeople({ title: job.title, department: job.department }, people);
    const premium = user.plan === "PREMIUM";
    const statusBy = new Map(requests.map((r) => [r.connectionId, r.status]));
    network = {
      jobId: job.id, jobTitle: job.title, company: company.name, premium,
      hasNetwork: Boolean(anyConn), count: ranked.length, initials: initialsPreview(ranked),
      people: premium
        ? ranked.map((p): NetworkPerson => ({
            id: p.id, name: `${p.firstName} ${p.lastName}`.trim(), firstName: p.firstName, position: p.position,
            profileUrl: p.profileUrl, email: p.email, relationship: p.relationship, reason: p.reason, tier: p.tier,
            requestStatus: statusBy.get(p.id) ?? null,
          }))
        : [],
      alumniUrl: alumniSearchUrl(company.name, profile?.data?.education?.[0]?.school),
    };
  }

  // Why this matches: same pure function as the job list, so the numbers agree.
  const mp = user ? await matchProfileFor(user.id) : null;
  const fit = mp ? matchJob(mp.profile, job) : null;
  const stored = user && fit ? (await storedMatches(user.id, [job.id])).get(job.id) : undefined;
  const verdict = user?.plan === "PREMIUM" ? stored?.aiVerdict ?? null : null;

  const match = profile?.data ? atsScore(resumeToText(profile.data), `${job.title}\n${job.description}`, job.skills) : null;
  const salary = formatSalary(job.salaryMin, job.salaryMax, job.salaryCurrency, job.salaryPeriod);

  // Google for Jobs structured data
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "JobPosting",
    title: job.title,
    description: job.description.replace(/\n/g, "<br>"),
    datePosted: job.postedAt.toISOString(),
    hiringOrganization: { "@type": "Organization", name: company.name, sameAs: company.website ?? undefined },
    jobLocation: { "@type": "Place", address: { "@type": "PostalAddress", addressLocality: job.location, addressCountry: job.country ?? undefined } },
    jobLocationType: job.workMode === "REMOTE" ? "TELECOMMUTE" : undefined,
    employmentType: job.employment ?? undefined,
    directApply: false,
  };

  return (
    <div className="container-x py-10">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <Link href="/jobs" className="inline-flex items-center gap-1.5 text-sm text-slate hover:text-ink">
        <ArrowLeft className="h-4 w-4" /> Back to jobs
      </Link>

      <div className="mt-6 grid gap-10 lg:grid-cols-[1fr_340px]">
        <article>
          <div className="flex items-start gap-4">
            <CompanyAvatar name={company.name} className="h-14 w-14 text-2xl" />
            <div>
              <h1 className="text-3xl font-semibold leading-tight sm:text-4xl">{job.title}</h1>
              <p className="mt-1 text-lg text-ink-soft">{company.name}{company.industry ? `, ${company.industry}` : ""}</p>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-[15px] text-slate">
            <span className="inline-flex items-center gap-1.5"><MapPin className="h-4 w-4" />{job.location}</span>
            <span className="inline-flex items-center gap-1.5"><Briefcase className="h-4 w-4" />{MODE[job.workMode]}{job.employment ? `, ${job.employment}` : ""}</span>
            <span className="inline-flex items-center gap-1.5"><Clock className="h-4 w-4" />Posted {timeAgo(job.postedAt)}</span>
            {salary && <span className="font-medium text-ink">{salary}</span>}
          </div>

          {job.closedAt && (
            <p className="mt-6 flex items-center gap-2 rounded-xl bg-rose-tint px-4 py-3 text-sm text-rose"><AlertTriangle className="h-4 w-4" />This job was removed from the company&apos;s career page and is likely closed.</p>
          )}
          {!job.closedAt && job.ghostScore > 40 && (
            <p className="mt-6 flex items-center gap-2 rounded-xl bg-marigold-tint px-4 py-3 text-sm text-ink"><AlertTriangle className="h-4 w-4 text-marigold-deep" />This listing is old or has been reposted several times. It may not be actively hiring.</p>
          )}

          {job.skills.length > 0 && (
            <div className="mt-8">
              <h2 className="text-lg font-semibold">Skills mentioned</h2>
              <div className="mt-3 flex flex-wrap gap-2">
                {job.skills.map((s) => {
                  const have = match?.matched.includes(s);
                  return (
                    <span key={s} className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-sm ${have ? "bg-mint-tint text-mint-ink" : "bg-white text-ink ring-1 ring-line"}`}>
                      {have && <CheckCircle2 className="h-3.5 w-3.5" />}{prettySkill(s)}
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          {fit && (
            <section aria-labelledby="why-title" className="panel mt-8 p-6">
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <h2 id="why-title" className="text-lg font-semibold">Why this matches</h2>
                <p className="text-sm text-slate">The {fit.score}% match comes from</p>
              </div>
              {verdict && (
                <p className="mt-3 rounded-xl bg-cobalt-tint px-4 py-3 text-sm text-ink">
                  <span className="font-semibold">{verdict === "strong" ? "Strong fit" : verdict === "good" ? "Good fit" : "A stretch"}.</span> {stored?.aiReason}
                </p>
              )}
              <ul className="mt-4 space-y-2 text-[15px] text-ink-soft">
                {fit.reasons.map((r) => <li key={r} className="flex gap-2"><span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-cobalt" />{r}</li>)}
              </ul>
              {fit.missing.length > 0 && (
                <p className="mt-4 text-sm text-slate">Skills this job asks for that your resume does not show: <span className="text-ink">{fit.missing.join(", ")}</span>. Add them if you have them.</p>
              )}
              {user?.plan !== "PREMIUM" && <p className="mt-4 text-xs text-slate"><Link href="/pricing" className="text-cobalt underline underline-offset-2">Premium</Link> adds an AI verdict and a daily top 10 for you.</p>}
            </section>
          )}

          <div className="mt-10">
            <h2 className="text-lg font-semibold">About the role</h2>
            <div className="mt-4 whitespace-pre-line text-[15.5px] leading-[1.75] text-ink-soft">{job.description}</div>
          </div>
        </article>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="panel p-6">
            {fit ? (
              <div>
                <p className="text-sm text-slate">Your match for this job</p>
                <p className="mt-1 font-display text-5xl font-semibold tabular-nums">{fit.score}<span className="text-2xl text-slate">%</span></p>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-paper">
                  <div className={`h-full rounded-full ${fit.score >= 75 ? "bg-mint" : fit.score >= 50 ? "bg-marigold" : "bg-rose"}`} style={{ width: `${fit.score}%` }} />
                </div>
                <p className="mt-3 text-sm text-slate">
                  {fit.missing.length ? `Missing: ${fit.missing.slice(0, 4).join(", ")}${fit.missing.length > 4 ? " and more" : ""}.` : "You cover every skill this job mentions."} <a href="#why-title" className="text-cobalt underline-offset-2 hover:underline">Why</a>
                </p>
              </div>
            ) : (
              <p className="text-[15px] text-slate">Get a resume and cover letter written for this exact job, with every bullet in XYZ format.</p>
            )}

            <TailorButton
              className="mt-6"
              jobId={job.id}
              loggedIn={Boolean(user)}
              hasProfile={Boolean(profile?.data)}
              credits={user?.credits ?? 0}
              existing={Boolean(tailoring)}
            />
            {user && !tailoring && <p className="mt-2 text-center text-xs text-slate">{user.credits} {user.credits === 1 ? "credit" : "credits"} left this month</p>}

            <div className="mt-4 grid grid-cols-[1fr_auto] gap-2">
              <a href={job.applyUrl} target="_blank" rel="noopener noreferrer nofollow" className="btn-ink">
                Apply on company site <ExternalLink className="h-4 w-4" />
              </a>
              <SaveButton jobId={job.id} initial={Boolean(app && app.status !== "HIDDEN")} />
            </div>
          </div>
          {network && <div className="mt-6"><NetworkCard {...network} /></div>}
          {user && (
            <Link href={`/coach?job=${job.id}`} className="btn-ghost mt-4 w-full">
              {user.plan === "PREMIUM" ? "Ask the coach about this job" : "Ask the coach about this job (Premium)"}
            </Link>
          )}
          <p className="mt-4 px-1 text-xs leading-relaxed text-slate">
            Listed from {company.name}&apos;s public career page. HireFlow is not the employer and never charges candidates to apply.
          </p>
        </aside>
      </div>
    </div>
  );
}
