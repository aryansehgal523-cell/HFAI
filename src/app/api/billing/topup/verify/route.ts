import { z } from "zod";
import { apiUser, error, json } from "@/lib/api";
import { razorpay, verifyOrderSignature } from "@/lib/razorpay";
import { applyTopup, recordPayment } from "@/lib/billing";
import { PLANS } from "@/lib/plans";

const schema = z.object({
  razorpay_payment_id: z.string(),
  razorpay_order_id: z.string(),
  razorpay_signature: z.string(),
});

export async function POST(req: Request) {
  const { user, res } = await apiUser();
  if (!user) return res;
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return error("Invalid payment response");
  const p = parsed.data;
  if (!verifyOrderSignature(p.razorpay_order_id, p.razorpay_payment_id, p.razorpay_signature)) {
    return error("Payment signature did not match");
  }
  // Confirm the order belongs to this user and was for the top up amount.
  const order = await razorpay().orders.fetch(p.razorpay_order_id);
  if (order.notes?.userId !== user.id || Number(order.amount) !== PLANS.topup.price) return error("Order mismatch", 400);

  const first = await recordPayment({ userId: user.id, paymentId: p.razorpay_payment_id, orderId: p.razorpay_order_id, amount: PLANS.topup.price, kind: "topup" });
  if (first) await applyTopup(user.id);
  return json({ ok: true });
}
