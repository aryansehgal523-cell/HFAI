import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { applications, profiles, resumeScores, tailorings } from "@/db/schema";
import { getJob } from "./jobs-query";
import { ESTIMATE_NOTE, estimateInHand } from "./tax";

export const COACH_KINDS = {
  chat: { title: "New conversation", prompt: null },
  interview: { title: "Interview prep", prompt: "Prepare me for this interview. List the questions I am most likely to get for this job, and for each one give a model answer in STAR format built only from my real experience." },
  mock: { title: "Mock interview", prompt: "Mock interview me for this job. Ask me one question at a time, wait for my answer, then give specific feedback and a stronger version before asking the next question." },
  calls: { title: "Why no calls?", prompt: "Why am I not getting calls? Look at my resume score, my tracker numbers and my target roles, and tell me the three changes that would make the biggest difference." },
  week: { title: "Plan my week", prompt: "Plan my job search for this week: how many applications, which kinds of roles, referral requests, practice and follow ups, day by day." },
  negotiate: { title: "Negotiate an offer", prompt: "Help me negotiate this offer. Ask me for the CTC and its breakup if you need them, estimate the in hand pay under both tax regimes, and give me a script for the conversation." },
} as const;
export type CoachKind = keyof typeof COACH_KINDS;

export const COACH_SYSTEM = `You are the HireFlow AI coach, a practical career coach for job seekers in India.

Rules:
- Be specific and honest. Use only facts from the CONTEXT below and what the user tells you. If something is not in the context, ask instead of assuming.
- Never invent experience, numbers, companies or skills for the user.
- Never promise a job, an interview or a salary. Give realistic ranges and say they are estimates.
- For take home pay, call the estimate_in_hand tool instead of calculating yourself, and say it is an estimate.
- Say clearly when something needs a human expert, for example legal questions about an employment bond, notice period buyouts, visas or tax filing.
- Write plainly and briefly. Use short paragraphs or lists. Use Indian conventions (LPA, lakh, notice period).
- In a mock interview, ask exactly one question per turn and wait for the answer.`;

export const IN_HAND_TOOL = {
  name: "estimate_in_hand",
  description: "Estimate yearly and monthly in hand salary in India from a CTC, under the new and old tax regimes. Use for any take home pay question.",
  input_schema: {
    type: "object" as const,
    properties: { ctc_lpa: { type: "number", description: "Cost to company in lakhs per annum, e.g. 18.5" } },
    required: ["ctc_lpa"],
    additionalProperties: false,
  },
};

export function runInHandTool(input: unknown) {
  const ctc = Number((input as { ctc_lpa?: unknown })?.ctc_lpa);
  if (!Number.isFinite(ctc) || ctc <= 0 || ctc > 500) return JSON.stringify({ error: "Give a CTC between 0 and 500 LPA." });
  const rupees = Math.round(ctc * 100_000);
  const n = estimateInHand(rupees, "new");
  const o = estimateInHand(rupees, "old");
  return JSON.stringify({
    ctc_lpa: ctc,
    new_regime: { in_hand_month: n.inHandMonth, in_hand_year: n.inHandYear, income_tax_year: n.tax, employee_pf_year: n.employeePf },
    old_regime: { in_hand_month: o.inHandMonth, in_hand_year: o.inHandYear, income_tax_year: o.tax, employee_pf_year: o.employeePf },
    note: ESTIMATE_NOTE,
  });
}

/** Everything the coach knows, assembled on the server for this user (never from the browser). */
export async function buildCoachContext(userId: string, jobId: string | null) {
  const [[profile], [score], stats, job, [tailored]] = await Promise.all([
    db.select().from(profiles).where(eq(profiles.userId, userId)).limit(1),
    db.select({ breakdown: resumeScores.breakdown }).from(resumeScores)
      .where(and(eq(resumeScores.userId, userId), eq(resumeScores.source, "master"))).orderBy(desc(resumeScores.createdAt)).limit(1),
    db.select({ status: applications.status, n: sql<number>`count(*)::int` }).from(applications).where(eq(applications.userId, userId)).groupBy(applications.status),
    jobId ? getJob(jobId) : Promise.resolve(null),
    jobId ? db.select({ resume: tailorings.resume, coverLetter: tailorings.coverLetter }).from(tailorings).where(and(eq(tailorings.userId, userId), eq(tailorings.jobId, jobId))).limit(1) : Promise.resolve([]),
  ]);
  const count = (s: string) => stats.find((x) => x.status === s)?.n ?? 0;
  const applied = count("APPLIED") + count("INTERVIEWING") + count("OFFER") + count("REJECTED");
  const r = profile?.data;
  const d = profile?.applicationDetails;
  const p = profile?.preferences;
  const parts = [
    "CONTEXT (from the user's HireFlow account; treat as facts)",
    r ? `Resume: ${JSON.stringify({ name: r.name, headline: r.headline, summary: r.summary, experience: r.experience, projects: r.projects.slice(0, 4), education: r.education, skills: r.skills })}` : "Resume: not added yet.",
    `Experience: ${d?.totalExperienceYears ?? p?.experienceYears ?? "unknown"} years. Current CTC: ${d?.currentCtcLpa ?? "unknown"} LPA. Expected: ${p?.expectedSalaryLpa ?? d?.expectedCtcLpa ?? "unknown"} LPA. Notice period: ${p?.noticePeriod ?? d?.noticePeriod ?? "unknown"}.`,
    `Wants: ${p?.targetRoles?.join(", ") || "not set"}. Cities: ${p?.cities?.join(", ") || "any"}. Work mode: ${p?.workModes?.join(", ") || "any"}.`,
    score ? `Resume score: ${score.breakdown.total}/100. ${score.breakdown.categories.map((c) => `${c.label} ${c.score}/${c.max}`).join(", ")}. Top issues: ${score.breakdown.categories.flatMap((c) => c.tips.slice(0, 1)).slice(0, 3).join(" ")}` : "Resume score: not computed yet.",
    `Tracker: ${count("SAVED")} saved, ${applied} applied, ${count("INTERVIEWING")} interviewing, ${count("OFFER")} offers, ${count("REJECTED")} closed. Response rate: ${applied ? Math.round(((count("INTERVIEWING") + count("OFFER")) / applied) * 100) : 0}%.`,
  ];
  if (job) {
    parts.push(`THIS JOB: ${job.job.title} at ${job.company.name}, ${job.job.location} (${job.job.workMode.toLowerCase()}). Experience asked: ${job.job.experienceMin ?? "?"} to ${job.job.experienceMax ?? "?"} years. Skills: ${job.job.skills.join(", ")}.\nDescription: ${job.job.description.slice(0, 6000)}`);
    if (tailored) parts.push(`Tailored resume for this job: ${JSON.stringify(tailored.resume)}`);
  }
  return { text: parts.join("\n\n"), jobTitle: job ? `${job.job.title}, ${job.company.name}` : null };
}
