import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { applications, profiles, tailorings } from "@/db/schema";
import { apiUser, error, json, rateLimit } from "@/lib/api";
import { aiEnabled, tailorForJob } from "@/lib/ai";
import { atsScore, resumeToText } from "@/lib/ats";
import { refundCredit, spendCredit } from "@/lib/credits";
import { getJob } from "@/lib/jobs-query";
import { PLANS, rupees } from "@/lib/plans";
import { recordTailoringScore, tailoringScores } from "@/lib/score-store";

export const maxDuration = 60;

const schema = z.object({ jobId: z.string().min(1), regenerate: z.boolean().optional() });

/**
 * Spend one credit to create a tailored resume and cover letter for a job.
 * Re-opening an existing tailoring is free; regenerating spends a credit.
 */
export async function POST(req: Request) {
  const { user, res } = await apiUser();
  if (!user) return res;
  if (!rateLimit(`tailor:${user.id}`, 20, 60 * 60 * 1000)) return error("Slow down a little. Try again in a few minutes.", 429);
  if (!aiEnabled()) return error("AI is not configured on this server (missing ANTHROPIC_API_KEY)", 503);

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return error("Invalid request");

  const found = await getJob(parsed.data.jobId);
  if (!found) return error("Job not found", 404);

  const [existing] = await db
    .select({ id: tailorings.id })
    .from(tailorings)
    .where(and(eq(tailorings.userId, user.id), eq(tailorings.jobId, found.job.id)))
    .limit(1);
  if (existing && !parsed.data.regenerate) return json({ id: existing.id, reused: true });

  const [profile] = await db.select().from(profiles).where(eq(profiles.userId, user.id)).limit(1);
  if (!profile?.data) return error("Add your master resume first, then tailor it to jobs.", 412);

  if (!(await spendCredit(user.id))) {
    return error(user.plan === "PREMIUM" ? `You have used all ${PLANS.monthly.monthlyCredits} credits this month. Buy a top up pack to keep going.` : `You have used your free credits. Upgrade to Premium for ${PLANS.monthly.monthlyCredits} a month at ${rupees(PLANS.monthly.price)}.`, 402);
  }

  try {
    const jobText = `${found.job.title}\n${found.job.description}`;
    const before = atsScore(resumeToText(profile.data), jobText, found.job.skills);
    const result = await tailorForJob({
      profile: profile.data,
      job: {
        title: found.job.title,
        company: found.company.name,
        location: found.job.location,
        description: found.job.description,
        skills: found.job.skills,
      },
    });
    const after = atsScore(resumeToText(result.resume), jobText, found.job.skills);
    const scoreJob = { title: found.job.title, description: found.job.description, skills: found.job.skills };
    const years = profile.applicationDetails?.totalExperienceYears ?? profile.preferences?.experienceYears ?? 0;
    const scores = tailoringScores(profile.data, result.resume, scoreJob, years);

    const values = {
      userId: user.id,
      jobId: found.job.id,
      resume: result.resume,
      coverLetter: result.coverLetter,
      atsBefore: before.score,
      atsAfter: after.score,
      scoreBefore: scores.before.total,
      scoreAfter: scores.after.total,
      breakdownBefore: scores.before,
      breakdownAfter: scores.after,
      missing: result.missing,
      model: result.model,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
    };
    const [row] = await db
      .insert(tailorings)
      .values(values)
      .onConflictDoUpdate({ target: [tailorings.userId, tailorings.jobId], set: values })
      .returning({ id: tailorings.id });
    await recordTailoringScore(user.id, row.id, scores.after);

    await db
      .insert(applications)
      .values({ userId: user.id, jobId: found.job.id, status: "SAVED" })
      .onConflictDoNothing();

    return json({ id: row.id });
  } catch (e) {
    console.error("tailor failed", e);
    await refundCredit(user.id);
    return error("Generation failed and your credit was refunded. Try again in a minute.", 502);
  }
}
