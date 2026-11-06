import { eq } from "drizzle-orm";
import { db } from "@/db";
import { subscriptions, webhookEvents } from "@/db/schema";
import { verifyWebhookSignature } from "@/lib/razorpay";
import { activateSubscription, applyTopup, endSubscription, recordPayment } from "@/lib/billing";
import { grantPremium } from "@/lib/credits";

type Entity = Record<string, unknown> & { id: string; notes?: Record<string, string> };
type Payload = {
  event: string;
  payload: {
    subscription?: { entity: Entity & { status: string; current_end?: number } };
    payment?: { entity: Entity & { amount: number; status: string; order_id?: string } };
    order?: { entity: Entity };
  };
};

/**
 * Razorpay webhook. Configure in Dashboard > Settings > Webhooks with events:
 * subscription.activated, subscription.charged, subscription.cancelled,
 * subscription.halted, subscription.completed, order.paid, payment.failed.
 */
export async function POST(req: Request) {
  const raw = await req.text();
  const signature = req.headers.get("x-razorpay-signature") ?? "";
  if (!process.env.RAZORPAY_WEBHOOK_SECRET || !verifyWebhookSignature(raw, signature)) {
    return new Response("invalid signature", { status: 400 });
  }

  const eventId = req.headers.get("x-razorpay-event-id");
  const body = JSON.parse(raw) as Payload;
  if (eventId) {
    const fresh = await db.insert(webhookEvents).values({ id: eventId, type: body.event }).onConflictDoNothing().returning();
    if (fresh.length === 0) return new Response("duplicate", { status: 200 });
  }

  const sub = body.payload.subscription?.entity;
  const pay = body.payload.payment?.entity;

  async function userForSub(subId: string) {
    const [row] = await db.select().from(subscriptions).where(eq(subscriptions.razorpaySubId, subId)).limit(1);
    return row?.userId ?? sub?.notes?.userId ?? null;
  }

  switch (body.event) {
    case "subscription.activated":
      if (sub) await activateSubscription(sub.id, sub.current_end);
      break;

    case "subscription.charged": {
      // Each successful renewal: record the payment and reset credits to 30.
      if (!sub || !pay) break;
      const userId = await userForSub(sub.id);
      if (!userId) break;
      await db.update(subscriptions).set({ status: "active", currentPeriodEnd: sub.current_end ? new Date(sub.current_end * 1000) : null }).where(eq(subscriptions.razorpaySubId, sub.id));
      const first = await recordPayment({ userId, paymentId: pay.id, amount: pay.amount, kind: "subscription", subId: sub.id });
      if (first) await grantPremium(userId);
      break;
    }

    case "subscription.pending":
      if (sub) await db.update(subscriptions).set({ status: "pending" }).where(eq(subscriptions.razorpaySubId, sub.id));
      break;

    case "subscription.cancelled":
    case "subscription.halted":
    case "subscription.completed":
      if (sub) await endSubscription(sub.id, sub.status);
      break;

    case "order.paid": {
      // Top up packs (one time orders). Safe if /api/billing/topup/verify already ran.
      const order = body.payload.order?.entity;
      if (order?.notes?.kind === "topup" && order.notes.userId && pay) {
        const first = await recordPayment({ userId: order.notes.userId, paymentId: pay.id, orderId: order.id, amount: pay.amount, kind: "topup" });
        if (first) await applyTopup(order.notes.userId);
      }
      break;
    }

    default:
      break;
  }
  return new Response("ok", { status: 200 });
}
