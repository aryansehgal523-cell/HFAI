import { and, eq, gt, sql } from "drizzle-orm";
import { db } from "@/db";
import { users, type User } from "@/db/schema";
import { PLANS } from "./plans";

const MONTH_MS = 30 * 24 * 60 * 60 * 1000;

/** Credits reset every 30 days to the plan allowance. Unused credits do not roll over. */
export async function refreshCreditsIfDue(user: User): Promise<User> {
  if (Date.now() - new Date(user.creditsResetAt).getTime() < MONTH_MS) return user;
  const allowance = user.plan === "PREMIUM" ? PLANS.monthly.monthlyCredits : PLANS.free.monthlyCredits;
  const [updated] = await db
    .update(users)
    .set({ credits: allowance, creditsResetAt: new Date() })
    .where(eq(users.id, user.id))
    .returning();
  return updated ?? user;
}

/** Atomically spend one credit. Returns false when the user has none left. */
export async function spendCredit(userId: string) {
  const rows = await db
    .update(users)
    .set({ credits: sql`${users.credits} - 1` })
    .where(and(eq(users.id, userId), gt(users.credits, 0)))
    .returning({ credits: users.credits });
  return rows.length > 0;
}

export async function refundCredit(userId: string) {
  await db.update(users).set({ credits: sql`${users.credits} + 1` }).where(eq(users.id, userId));
}

export async function grantPremium(userId: string) {
  await db
    .update(users)
    .set({ plan: "PREMIUM", credits: PLANS.monthly.monthlyCredits, creditsResetAt: new Date() })
    .where(eq(users.id, userId));
}

export async function addCredits(userId: string, n: number) {
  await db.update(users).set({ credits: sql`${users.credits} + ${n}` }).where(eq(users.id, userId));
}

export async function downgradeToFree(userId: string) {
  await db
    .update(users)
    .set({ plan: "FREE", credits: sql`LEAST(${users.credits}, ${PLANS.free.monthlyCredits})` })
    .where(eq(users.id, userId));
}
