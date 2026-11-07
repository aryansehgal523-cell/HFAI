// Single source of truth for pricing. Amounts are in paise and GST inclusive.
// Every price, "per application" figure and "save X%" label on the site is derived from here.
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
    price: 99900,
    interval: "monthly" as const,
    razorpayPlanEnv: "RAZORPAY_PLAN_MONTHLY",
  },
  yearly: {
    name: "Premium yearly",
    monthlyCredits: 30,
    price: 799900,
    interval: "yearly" as const,
    razorpayPlanEnv: "RAZORPAY_PLAN_YEARLY",
  },
  topup: {
    name: "Top up pack",
    credits: 10,
    price: 19900,
  },
} as const;

/** What Free and Premium include, shown on the pricing page and home page. */
export const FREE_FEATURES = [
  "Unlimited job search with every filter",
  "Ghost job filter",
  "Application tracker",
  `${PLANS.free.monthlyCredits} tailored resumes and cover letters a month`,
  "Resume score with your top fixes",
  "Match score and reasons on every job",
  "PDF download",
] as const;

export const PREMIUM_FEATURES = [
  "Everything in Free",
  `${PLANS.monthly.monthlyCredits} tailored resumes and cover letters a month`,
  "Referral engine: see who you know at each company and draft the ask",
  "Resume score before and after every tailoring",
  "One click application autofill (Chrome extension)",
  "AI job matching with a daily top 10 for you",
  "AI coach for interviews, mock rounds and offers",
  "PDF and Word downloads",
  `Top up packs: ${PLANS.topup.credits} more for ${rupees(PLANS.topup.price)}`,
] as const;

export function splitGst(paiseInclusive: number) {
  const base = Math.round(paiseInclusive / (1 + GST_RATE));
  return { base, gst: paiseInclusive - base };
}

/** Whole rupees from paise, rounded. */
export function rupeesNumber(paise: number) {
  return Math.round(paise / 100);
}

/** "₹7,999" style label from paise (Indian digit grouping). */
export function rupees(paise: number) {
  return `₹${rupeesNumber(paise).toLocaleString("en-IN")}`;
}

/** Monthly Premium price spread over its credits, e.g. ₹999 / 30 → 33. */
export function perApplicationRupees() {
  return Math.round(PLANS.monthly.price / 100 / PLANS.monthly.monthlyCredits);
}

/** The yearly plan expressed per month, e.g. ₹7,999 / 12 → 667. */
export function yearlyMonthlyEquivalentRupees() {
  return Math.round(PLANS.yearly.price / 100 / 12);
}

/** Percentage saved by paying yearly instead of 12 monthly payments, rounded down so we never overstate it. */
export function yearlySavingsPercent() {
  return Math.floor((1 - PLANS.yearly.price / (PLANS.monthly.price * 12)) * 100);
}
