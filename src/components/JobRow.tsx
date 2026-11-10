import Link from "next/link";
import { MapPin, Clock, Users } from "lucide-react";
import type { JobRow as Row } from "@/lib/jobs-query";
import { formatSalary, timeAgo } from "@/lib/utils";
import { prettySkill } from "@/lib/ats";
import { attributionFor } from "@/lib/sources";
import { CompanyAvatar } from "./CompanyAvatar";
import { SaveButton } from "./SaveButton";

const MODE: Record<string, string> = { REMOTE: "Remote", HYBRID: "Hybrid", ONSITE: "On site" };

function expLabel(min: number | null, max: number | null) {
  if (min === null) return null;
  if (min === 0 && (max ?? 1) <= 1) return "Fresher";
  if (max === null) return `${min}+ yrs`;
  return `${min} to ${max} yrs`;
}

export function MncBadge({ className = "" }: { className?: string }) {
  return (
    <span className={`rounded-md bg-cobalt-tint px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-cobalt ${className}`} title="Multinational company">
      MNC
    </span>
  );
}

export function JobRow({ job, saved, showSave = true, networkCount, matchScore, verdict }: {
  job: Row; saved?: boolean; showSave?: boolean; networkCount?: number; matchScore?: number; verdict?: string | null;
}) {
  const salary = formatSalary(job.salaryMin, job.salaryMax, job.salaryCurrency, job.salaryPeriod);
  const exp = expLabel(job.experienceMin, job.experienceMax);
  const fresh = Date.now() - new Date(job.postedAt).getTime() < 2 * 86_400_000;
  const via = attributionFor(job.source);
  return (
    <article className="group relative flex gap-4 border-b border-line px-1 py-5 transition-colors last:border-0 hover:bg-white/60 sm:px-3">
      <CompanyAvatar name={job.companyName} />
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="font-display text-[18px] font-semibold leading-snug">
              <Link href={`/jobs/${job.id}`} className="after:absolute after:inset-0 hover:text-cobalt">
                {job.title}
              </Link>
            </h3>
            <p className="mt-0.5 flex flex-wrap items-center gap-2 text-[15px] text-ink-soft">
              {job.companyName}
              {job.companyIsMnc && <MncBadge />}
              {matchScore !== undefined && (
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${matchScore >= 75 ? "bg-mint-tint text-mint-ink" : matchScore >= 50 ? "bg-marigold-tint text-ink" : "bg-paper text-slate"}`}>
                  {matchScore}% match{verdict ? ` · ${verdict === "strong" ? "Strong fit" : verdict === "good" ? "Good fit" : "Stretch"}` : ""}
                </span>
              )}
              {networkCount ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-mint-tint px-2 py-0.5 text-xs font-medium text-mint-ink">
                  <Users className="h-3 w-3" aria-hidden />You know {networkCount}
                </span>
              ) : null}
            </p>
          </div>
          {showSave && (
            <div className="relative z-10">
              <SaveButton jobId={job.id} initial={saved} />
            </div>
          )}
        </div>
        <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[13.5px] text-slate">
          <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{job.location}</span>
          <span>{MODE[job.workMode]}</span>
          {exp && <span>{exp}</span>}
          {salary && <span className="font-medium text-ink">{salary}</span>}
          <span className="inline-flex items-center gap-1">
            {fresh ? <span className="h-1.5 w-1.5 animate-pulseDot rounded-full bg-mint" /> : <Clock className="h-3.5 w-3.5" />}
            {timeAgo(job.postedAt)}
          </span>
          {via && (
            <a href={via.href} target="_blank" rel="noopener noreferrer" className="relative z-10 text-xs text-slate underline-offset-2 hover:text-ink hover:underline">
              {via.label}
            </a>
          )}
        </div>
        {job.skills.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {job.skills.slice(0, 6).map((s) => (
              <span key={s} className="tag">{prettySkill(s)}</span>
            ))}
          </div>
        )}
      </div>
    </article>
  );
}
