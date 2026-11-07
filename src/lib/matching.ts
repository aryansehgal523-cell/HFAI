/*
 * Job match score, 0 to 100, for (profile, preferences, job). Pure and deterministic.
 *   skills 40 · title 20 · experience 15 · location and work mode 15 · salary 5 · freshness 5
 * Returns short, accurate reasons ("Matches 6 of 8 skills") and the skills you are missing.
 */
import type { ResumeData } from "@/db/schema";
import { extractKeywords, prettySkill, resumeToText } from "./ats";
import { jobFunction } from "./referrals/rank";

export type MatchJob = {
  title: string;
  description: string;
  skills: string[];
  location: string;
  workMode: "REMOTE" | "HYBRID" | "ONSITE";
  experienceMin: number | null;
  experienceMax: number | null;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string | null;
  salaryPeriod: string | null;
  postedAt: Date | string;
};

export type MatchProfile = {
  resume: ResumeData | null;
  years?: number;
  targetRoles?: string[];
  cities?: string[];
  workModes?: ("REMOTE" | "HYBRID" | "ONSITE")[];
  expectedSalaryLpa?: number;
  openToRelocation?: boolean;
};

export type MatchResult = { score: number; reasons: string[]; missing: string[]; parts: Record<string, number> };

const MODE_WORD = { REMOTE: "Remote", HYBRID: "Hybrid", ONSITE: "On site" } as const;
const NOISE = new Set(["senior", "sr", "junior", "jr", "lead", "staff", "principal", "associate", "intern", "trainee", "i", "ii", "iii", "iv", "the", "and", "of", "a", "an", "to", "for", "in", "at", "with", "remote", "hybrid", "india", "–", "-"]);
const SYNONYMS: Record<string, string> = { developer: "engineer", dev: "engineer", sde: "engineer", swe: "engineer", programmer: "engineer", ml: "machine learning", ai: "machine learning", backend: "back end", frontend: "front end" };

function titleTokens(t: string) {
  return new Set(
    t.toLowerCase().replace(/[^a-z0-9+#. ]/g, " ").split(/\s+/)
      .map((w) => SYNONYMS[w] ?? w)
      .flatMap((w) => w.split(" "))
      .filter((w) => w && !NOISE.has(w)),
  );
}

function jaccard(a: Set<string>, b: Set<string>) {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

/** Annual salary in lakhs (LPA) when the job is in INR; null otherwise. */
export function jobSalaryLpa(job: Pick<MatchJob, "salaryMin" | "salaryMax" | "salaryCurrency" | "salaryPeriod">) {
  if (job.salaryCurrency && job.salaryCurrency !== "INR") return null;
  const v = job.salaryMax ?? job.salaryMin;
  if (!v) return null;
  const perYear = job.salaryPeriod === "MONTH" ? v * 12 : job.salaryPeriod === "HOUR" ? v * 2000 : v;
  return perYear / 100_000;
}

export function matchJob(p: MatchProfile, job: MatchJob, now = new Date()): MatchResult {
  const reasons: string[] = [];
  const parts: Record<string, number> = {};

  // ── Skills (40)
  const raw = [...new Set([...job.skills.map((s) => s.toLowerCase()), ...extractKeywords(`${job.title}\n${job.description}`)])];
  // "spring" inside "spring boot" is one skill, not two.
  const wanted = raw.filter((k) => !raw.some((o) => o !== k && o.split(" ").includes(k)));
  const text = resumeToText(p.resume).toLowerCase();
  const have = new Set(extractKeywords(text));
  const matched = wanted.filter((k) => have.has(k) || text.includes(k));
  const missing = wanted.filter((k) => !matched.includes(k));
  if (wanted.length === 0) {
    parts.skills = 20;
  } else {
    parts.skills = Math.round((matched.length / wanted.length) * 40 * 10) / 10;
    reasons.push(`Matches ${matched.length} of ${wanted.length} skills`);
  }

  // ── Title (20)
  const roles = p.targetRoles?.length ? p.targetRoles : [p.resume?.headline, ...(p.resume?.experience ?? []).slice(0, 2).map((e) => e.title)].filter((x): x is string => Boolean(x));
  const jt = titleTokens(job.title);
  let best = 0;
  let bestRole = "";
  for (const r of roles) {
    const s = jaccard(jt, titleTokens(r));
    if (s > best) { best = s; bestRole = r; }
  }
  const sameFamily = roles.some((r) => jobFunction(r) !== "other" && jobFunction(r) === jobFunction(job.title));
  parts.title = Math.round(Math.max(best * 20, sameFamily ? 9 : 0) * 10) / 10;
  if (best >= 0.5 && p.targetRoles?.length) reasons.push(`Close to “${bestRole}”, a role you want`);
  else if (sameFamily && p.targetRoles?.length) reasons.push("Same field as the roles you want");
  else if (roles.length && best < 0.2 && !sameFamily) reasons.push("Different from the roles you want");

  // ── Experience (15)
  const yrs = p.years;
  const lo = job.experienceMin;
  const hi = job.experienceMax ?? (lo !== null ? lo + 3 : null);
  const band = lo === null ? null : hi === null || hi === lo ? `${lo}+ years` : `${lo} to ${hi} years`;
  if (lo === null || yrs === undefined) {
    parts.experience = 10;
  } else if (yrs >= lo && yrs <= (hi ?? lo) + 1) {
    parts.experience = 15;
    reasons.push(`Asks for ${band}, you have ${fmtYears(yrs)}`);
  } else if (yrs < lo) {
    const gap = lo - yrs;
    parts.experience = gap <= 1 ? 9 : gap <= 2 ? 4 : 0;
    reasons.push(`Asks for ${band}, you have ${fmtYears(yrs)}`);
  } else {
    parts.experience = yrs - (hi ?? lo) <= 3 ? 10 : 6;
    reasons.push(`Asks for ${band}; you have more (${fmtYears(yrs)})`);
  }

  // ── Location and work mode (15)
  const modes = p.workModes ?? [];
  const cities = (p.cities ?? []).map((c) => c.toLowerCase());
  const loc = job.location.toLowerCase();
  const cityOk = job.workMode === "REMOTE" || cities.some((c) => loc.includes(c) || (c === "bangalore" && loc.includes("bengaluru")) || (c === "bengaluru" && loc.includes("bangalore")) || (c === "gurgaon" && loc.includes("gurugram")) || (c === "gurugram" && loc.includes("gurgaon")));
  const modeOk = modes.includes(job.workMode);
  if (!modes.length && !cities.length) {
    parts.location = 10;
  } else {
    parts.location = (modes.length ? (modeOk ? 7 : 0) : 4) + (cities.length ? (cityOk ? 8 : p.openToRelocation ? 4 : 0) : 4);
    const where = job.workMode === "REMOTE" ? "Remote" : `${MODE_WORD[job.workMode]} in ${job.location.split(",")[0]}`;
    if ((modeOk || !modes.length) && (cityOk || !cities.length)) reasons.push(`${where}, as you prefer`);
    else if (!cityOk && cities.length) reasons.push(`${where}, outside your cities${p.openToRelocation ? " (you are open to relocating)" : ""}`);
    else if (!modeOk && modes.length) reasons.push(`${where}, not your preferred work mode`);
  }

  // ── Salary (5)
  const pay = jobSalaryLpa(job);
  if (pay !== null && p.expectedSalaryLpa) {
    parts.salary = pay >= p.expectedSalaryLpa ? 5 : pay >= p.expectedSalaryLpa * 0.85 ? 3 : 0;
    reasons.push(pay >= p.expectedSalaryLpa ? `Pays up to ${pay.toFixed(0)} LPA, above your ${p.expectedSalaryLpa} LPA` : `Pays up to ${pay.toFixed(0)} LPA, below your ${p.expectedSalaryLpa} LPA`);
  } else {
    parts.salary = 3;
  }

  // ── Freshness (5)
  const days = (now.getTime() - new Date(job.postedAt).getTime()) / 86_400_000;
  parts.freshness = days <= 3 ? 5 : days <= 7 ? 4 : days <= 14 ? 3 : days <= 30 ? 1 : 0;
  if (days <= 3) reasons.push("Posted in the last 3 days");

  const score = Math.max(0, Math.min(100, Math.round(Object.values(parts).reduce((a, b) => a + b, 0))));
  return { score, reasons: reasons.slice(0, 5), missing: missing.slice(0, 8).map(prettySkill), parts };
}

function fmtYears(y: number) {
  return y === 1 ? "1 year" : `${Number.isInteger(y) ? y : y.toFixed(1)} years`;
}
