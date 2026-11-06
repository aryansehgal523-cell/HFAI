// Single source of truth for pricing. Amounts are in paise and GST inclusive.
export const GST_RATE = 0.18;

export const PLANS = {
  free: {
    name: "Free",
    monthlyCredits: 3,
    price: 0,
  },
  monthly: {
    name: "Premium monthly",
    monthlyCredits: 30,
    price: 59900,
    interval: "monthly" as const,
    razorpayPlanEnv: "RAZORPAY_PLAN_MONTHLY",
  },
  yearly: {
    name: "Premium yearly",
    monthlyCredits: 30,
    price: 499900,
    interval: "yearly" as const,
    razorpayPlanEnv: "RAZORPAY_PLAN_YEARLY",
  },
  topup: {
    name: "Top up pack",
    credits: 10,
    price: 19900,
  },
} as const;

export function splitGst(paiseInclusive: number) {
  const base = Math.round(paiseInclusive / (1 + GST_RATE));
  return { base, gst: paiseInclusive - base };
}
