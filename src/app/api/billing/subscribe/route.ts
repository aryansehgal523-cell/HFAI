import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { subscriptions } from "@/db/schema";
import { apiUser, error, json } from "@/lib/api";
import { razorpay, razorpayEnabled } from "@/lib/razorpay";
import { PLANS } from "@/lib/plans";

const schema = z.object({ interval: z.enum(["monthly", "yearly"]) });

/** Create a Razorpay subscription; the browser then opens Checkout with its id. */
export async function POST(req: Request) {
  const { user, res } = await apiUser();
  if (!user) return res;
  if (!razorpayEnabled()) return error("Payments are not configured yet", 503);

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return error("Choose monthly or yearly");
  const plan = PLANS[parsed.data.interval];
  const planId = process.env[plan.razorpayPlanEnv];
  if (!planId) return error(`Missing ${plan.razorpayPlanEnv}`, 503);

  const [current] = await db.select().from(subscriptions).where(eq(subscriptions.userId, user.id)).limit(1);
  if (current && ["active", "authenticated"].includes(current.status)) {
    return error("You already have an active Premium plan", 409);
  }

  const sub = await razorpay().subscriptions.create({
    plan_id: planId,
    total_count: parsed.data.interval === "monthly" ? 120 : 10,
    customer_notify: 1,
    notes: { userId: user.id, interval: parsed.data.interval },
  });

  const values = { userId: user.id, razorpaySubId: sub.id, planId, interval: parsed.data.interval, status: sub.status, cancelAtPeriodEnd: false };
  await db.insert(subscriptions).values(values).onConflictDoUpdate({ target: subscriptions.userId, set: values });

  return json({
    subscriptionId: sub.id,
    key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID ?? process.env.RAZORPAY_KEY_ID,
    name: user.name ?? "",
    email: user.email,
  });
}
