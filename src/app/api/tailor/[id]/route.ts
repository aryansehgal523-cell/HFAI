import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { tailorings, type ResumeData } from "@/db/schema";
import { apiUser, error, json } from "@/lib/api";
import { getJob } from "@/lib/jobs-query";
import { scoreResume, type ResumeScore } from "@/lib/resumeScore";
import { recordTailoringScore } from "@/lib/score-store";
import { profiles } from "@/db/schema";

const schema = z.object({
  resume: z.looseObject({}).optional(),
  coverLetter: z.string().max(10000).optional(),
});

/** Save the user's manual edits to a tailored resume or cover letter (free). */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { user, res } = await apiUser();
  if (!user) return res;
  const { id } = await ctx.params;
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return error("Invalid request");
  const set: Partial<{ resume: ResumeData; coverLetter: string; scoreAfter: number; breakdownAfter: ResumeScore }> = {};
  let score: ResumeScore | null = null;
  if (parsed.data.resume) {
    set.resume = parsed.data.resume as unknown as ResumeData;
    const [t] = await db.select({ jobId: tailorings.jobId }).from(tailorings).where(and(eq(tailorings.id, id), eq(tailorings.userId, user.id))).limit(1);
    const found = t ? await getJob(t.jobId) : null;
    if (found) {
      const [p] = await db.select({ details: profiles.applicationDetails, prefs: profiles.preferences }).from(profiles).where(eq(profiles.userId, user.id)).limit(1);
      score = scoreResume(set.resume, {
        job: { title: found.job.title, description: found.job.description, skills: found.job.skills },
        experienceYears: p?.details?.totalExperienceYears ?? p?.prefs?.experienceYears ?? 0,
      });
      set.scoreAfter = score.total;
      set.breakdownAfter = score;
    }
  }
  if (parsed.data.coverLetter !== undefined) set.coverLetter = parsed.data.coverLetter;
  const [row] = await db
    .update(tailorings)
    .set(set)
    .where(and(eq(tailorings.id, id), eq(tailorings.userId, user.id)))
    .returning({ id: tailorings.id });
  if (!row) return error("Not found", 404);
  if (score) await recordTailoringScore(user.id, row.id, score);
  return json({ ok: true, score });
}
