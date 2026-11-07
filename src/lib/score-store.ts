import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { profiles, resumeScores, type ResumeData } from "@/db/schema";
import { masterScoreOptions, scoreResume, type ResumeScore, type ScoreJob } from "./resumeScore";

/** Score the master resume with the user's saved preferences and record it if it changed. */
export async function recordMasterScore(userId: string, data: ResumeData): Promise<ResumeScore> {
  const [profile] = await db
    .select({ preferences: profiles.preferences, details: profiles.applicationDetails })
    .from(profiles)
    .where(eq(profiles.userId, userId))
    .limit(1);
  const score = scoreResume(data, masterScoreOptions(profile?.preferences, profile?.details));
  const [last] = await db
    .select({ total: resumeScores.total, breakdown: resumeScores.breakdown })
    .from(resumeScores)
    .where(and(eq(resumeScores.userId, userId), eq(resumeScores.source, "master")))
    .orderBy(desc(resumeScores.createdAt))
    .limit(1);
  // Only record real changes, so the trend line shows progress rather than every save.
  if (!last || last.total !== score.total || JSON.stringify(last.breakdown) !== JSON.stringify(score)) {
    await db.insert(resumeScores).values({ userId, source: "master", total: score.total, breakdown: score });
  }
  return score;
}

/** Before (master vs job) and after (tailored vs job) for a tailoring. */
export function tailoringScores(master: ResumeData, tailored: ResumeData, job: ScoreJob, experienceYears = 0) {
  return {
    before: scoreResume(master, { job, experienceYears }),
    after: scoreResume(tailored, { job, experienceYears }),
  };
}

export async function recordTailoringScore(userId: string, tailoringId: string, score: ResumeScore) {
  await db.insert(resumeScores).values({ userId, source: "tailoring", refId: tailoringId, total: score.total, breakdown: score });
}

/** Last 20 master scores, oldest first, for the trend line. */
export async function masterScoreHistory(userId: string) {
  const rows = await db
    .select({ total: resumeScores.total, at: resumeScores.createdAt })
    .from(resumeScores)
    .where(and(eq(resumeScores.userId, userId), eq(resumeScores.source, "master")))
    .orderBy(desc(resumeScores.createdAt))
    .limit(20);
  return rows.reverse();
}
