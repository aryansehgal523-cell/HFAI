import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db";
import { usageEvents } from "@/db/schema";

/** Metered actions and their fair use limits. */
export const QUOTAS = {
  resume_upload: { limit: 10, windowMs: 24 * 60 * 60 * 1000, message: "You have uploaded 10 resumes today. Try again tomorrow, or paste the text instead." },
  ext_answer: { limit: 50, windowMs: 24 * 60 * 60 * 1000, message: "You have written 50 answers with AI today, the fair use limit. Try again tomorrow." },
  ext_autofill_free: { limit: 3, windowMs: 30 * 24 * 60 * 60 * 1000, message: "Free accounts can autofill contact details on 3 applications a month. Upgrade to Premium for full autofill." },
  coach_message: { limit: 60, windowMs: 24 * 60 * 60 * 1000, message: "You have sent 60 messages to the coach today, the fair use limit. Pick up again tomorrow." },
  referral_draft: { limit: 100, windowMs: 30 * 24 * 60 * 60 * 1000, message: "You have drafted 100 referral requests in the last 30 days, the fair use limit. Edit an existing draft, or try again in a few days." },
} as const;
export type UsageKind = keyof typeof QUOTAS;

export async function usageSince(userId: string, kind: UsageKind, since: Date) {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(usageEvents)
    .where(and(eq(usageEvents.userId, userId), eq(usageEvents.kind, kind), gte(usageEvents.createdAt, since)));
  return row?.n ?? 0;
}

/**
 * Check the limit and record one use. Returns null when allowed, or the message to show.
 * Count then insert is not atomic; at worst a burst of parallel requests goes one or two
 * over a fair use limit, which is acceptable here (rateLimit() still caps bursts).
 */
export async function takeQuota(userId: string, kind: UsageKind): Promise<string | null> {
  const q = QUOTAS[kind];
  const used = await usageSince(userId, kind, new Date(Date.now() - q.windowMs));
  if (used >= q.limit) return q.message;
  await db.insert(usageEvents).values({ userId, kind });
  return null;
}

/** Give one use back, e.g. when the AI call failed for reasons that are not the user's fault. */
export async function releaseQuota(userId: string, kind: UsageKind) {
  await db.execute(sql`delete from ${usageEvents} where id = (
    select id from ${usageEvents} where user_id = ${userId} and kind = ${kind} order by created_at desc limit 1)`);
}
