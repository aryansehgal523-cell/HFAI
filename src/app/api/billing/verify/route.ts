import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { subscriptions } from "@/db/schema";
import { apiUser, error, json } from "@/lib/api";
import { verifySubscriptionSignature } from "@/lib/razorpay";
import { activateSubscription } from "@/lib/billing";

const schema = z.object({
  razorpay_payment_id: z.string(),
  razorpay_subscription_id: z.string(),
  razorpay_signature: z.string(),
});

/**
 * Called by the browser right after Checkout succeeds, so Premium unlocks instantly.
 * The webhook remains the source of truth for renewals, failures and cancellations.
 */
export async function POST(req: Request) {
  const { user, res } = await apiUser();
  if (!user) return res;
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return error("Invalid payment response");
  const p = parsed.data;

  if (!verifySubscriptionSignature(p.razorpay_payment_id, p.razorpay_subscription_id, p.razorpay_signature)) {
    return error("Payment signature did not match", 400);
  }
  const [sub] = await db
    .select()
    .from(subscriptions)
    .where(and(eq(subscriptions.razorpaySubId, p.razorpay_subscription_id), eq(subscriptions.userId, user.id)))
    .limit(1);
  if (!sub) return error("Subscription not found", 404);

  await activateSubscription(sub.razorpaySubId);
  return json({ ok: true });
}
