import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { payments, subscriptions } from "@/db/schema";
import { invoiceNumber } from "./razorpay";
import { addCredits, downgradeToFree, grantPremium } from "./credits";
import { PLANS } from "./plans";

/** Record a captured payment once (idempotent on the Razorpay payment id). */
export async function recordPayment(input: {
  userId: string;
  paymentId: string;
  amount: number;
  kind: "subscription" | "topup";
  subId?: string | null;
  orderId?: string | null;
  status?: string;
}) {
  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(payments);
  const inserted = await db
    .insert(payments)
    .values({
      userId: input.userId,
      razorpayPaymentId: input.paymentId,
      razorpaySubId: input.subId ?? null,
      razorpayOrderId: input.orderId ?? null,
      amount: input.amount,
      kind: input.kind,
      status: input.status ?? "captured",
      invoiceNumber: invoiceNumber(count + 1),
    })
    .onConflictDoNothing({ target: payments.razorpayPaymentId })
    .returning({ id: payments.id });
  return inserted.length > 0; // true only the first time
}

export async function activateSubscription(subId: string, periodEndUnix?: number | null) {
  const [sub] = await db
    .update(subscriptions)
    .set({ status: "active", currentPeriodEnd: periodEndUnix ? new Date(periodEndUnix * 1000) : null })
    .where(eq(subscriptions.razorpaySubId, subId))
    .returning();
  if (sub) await grantPremium(sub.userId);
  return sub;
}

export async function endSubscription(subId: string, status: string) {
  const [sub] = await db
    .update(subscriptions)
    .set({ status })
    .where(eq(subscriptions.razorpaySubId, subId))
    .returning();
  if (sub) await downgradeToFree(sub.userId);
  return sub;
}

export async function applyTopup(userId: string) {
  await addCredits(userId, PLANS.topup.credits);
}
