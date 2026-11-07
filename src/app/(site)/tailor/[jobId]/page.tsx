import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";
import { db } from "@/db";
import { applications, profiles, tailorings } from "@/db/schema";
import { requireUser } from "@/lib/session";
import { getJob } from "@/lib/jobs-query";
import { TailoredView } from "@/components/TailoredView";
import { TailorButton } from "@/components/TailorButton";
import { scoreResume } from "@/lib/resumeScore";

export const metadata: Metadata = { title: "Tailored resume" };

export default async function TailorPage({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  const user = await requireUser(`/tailor/${jobId}`);
  const found = await getJob(jobId);
  if (!found) notFound();

  const [[t], [app], [profile]] = await Promise.all([
    db.select().from(tailorings).where(and(eq(tailorings.userId, user.id), eq(tailorings.jobId, jobId))).limit(1),
    db.select().from(applications).where(and(eq(applications.userId, user.id), eq(applications.jobId, jobId))).limit(1),
    db.select({ id: profiles.id, data: profiles.data, details: profiles.applicationDetails, prefs: profiles.preferences }).from(profiles).where(eq(profiles.userId, user.id)).limit(1),
  ]);
  const scoreJob = { title: found.job.title, description: found.job.description, skills: found.job.skills };
  const experienceYears = profile?.details?.totalExperienceYears ?? profile?.prefs?.experienceYears ?? 0;
  // Tailorings made before scores existed: compute them now from the same pure function.
  const empty = { experience: [], projects: [], education: [], skills: [], achievements: [] };
  const breakdownBefore = t?.breakdownBefore ?? scoreResume(profile?.data ?? empty, { job: scoreJob, experienceYears });
  const breakdownAfter = t?.breakdownAfter ?? (t ? scoreResume(t.resume, { job: scoreJob, experienceYears }) : null);

  return (
    <div className="container-x py-10">
      <Link href={`/jobs/${jobId}`} className="no-print inline-flex items-center gap-1.5 text-sm text-slate hover:text-ink">
        <ArrowLeft className="h-4 w-4" /> Back to the job
      </Link>
      <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-slate">Tailored for</p>
          <h1 className="text-3xl font-semibold sm:text-4xl">{found.job.title}, {found.company.name}</h1>
        </div>
        {t && (
          <div className="w-full sm:w-56">
            <TailorButton jobId={jobId} loggedIn hasProfile={Boolean(profile?.data)} credits={user.credits} existing regenerate />
          </div>
        )}
      </div>

      <div className="mt-8">
        {t ? (
          <TailoredView
            tailoringId={t.id}
            jobId={jobId}
            jobTitle={found.job.title}
            company={found.company.name}
            applyUrl={found.job.applyUrl}
            resume={t.resume}
            coverLetter={t.coverLetter}
            scoreJob={scoreJob}
            experienceYears={experienceYears}
            breakdownBefore={breakdownBefore}
            breakdownAfter={breakdownAfter!}
            missing={t.missing}
            premium={user.plan === "PREMIUM"}
            applied={app?.status === "APPLIED" || app?.status === "INTERVIEWING" || app?.status === "OFFER"}
          />
        ) : (
          <div className="panel mx-auto max-w-lg p-8 text-center">
            <p className="font-display text-2xl font-semibold">No tailored resume for this job yet</p>
            <p className="mt-2 text-slate">It takes about 30 seconds and uses 1 of your {user.credits} credits.</p>
            <TailorButton className="mt-6" jobId={jobId} loggedIn hasProfile={Boolean(profile?.data)} credits={user.credits} />
          </div>
        )}
      </div>
    </div>
  );
}
