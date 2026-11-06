import { eq } from "drizzle-orm";
import { db } from "@/db";
import { subscriptions } from "@/db/schema";
import { apiUser, error, json } from "@/lib/api";
import { razorpay } from "@/lib/razorpay";

/** Cancel at the end of the current billing period. Premium stays until then. */
export async function POST() {
  const { user, res } = await apiUser();
  if (!user) return res;
  const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.userId, user.id)).limit(1);
  if (!sub || !["active", "authenticated"].includes(sub.status)) return error("No active subscription", 404);

  await razorpay().subscriptions.cancel(sub.razorpaySubId, true);
  await db.update(subscriptions).set({ cancelAtPeriodEnd: true }).where(eq(subscriptions.id, sub.id));
  return json({ ok: true, endsAt: sub.currentPeriodEnd });
}
