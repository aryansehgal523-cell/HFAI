import { apiUser, error, json } from "@/lib/api";
import { razorpay, razorpayEnabled } from "@/lib/razorpay";
import { PLANS } from "@/lib/plans";

/** Create a one time Razorpay order for the 10 credit top up pack. */
export async function POST() {
  const { user, res } = await apiUser();
  if (!user) return res;
  if (!razorpayEnabled()) return error("Payments are not configured yet", 503);
  if (user.plan !== "PREMIUM") return error("Top ups are available on Premium", 403);

  const order = await razorpay().orders.create({
    amount: PLANS.topup.price,
    currency: "INR",
    receipt: `topup_${user.id.slice(0, 8)}_${Date.now()}`,
    notes: { userId: user.id, kind: "topup" },
  });
  return json({
    orderId: order.id,
    amount: order.amount,
    key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID ?? process.env.RAZORPAY_KEY_ID,
    email: user.email,
    name: user.name ?? "",
  });
}
