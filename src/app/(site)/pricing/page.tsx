import type { Metadata } from "next";
import { PricingPlans } from "@/components/PricingPlans";
import { Faq } from "@/components/Faq";
import { getCurrentUser } from "@/lib/session";
import { razorpayEnabled } from "@/lib/razorpay";
import { PLANS, rupees, yearlySavingsPercent } from "@/lib/plans";

const MONTHLY = rupees(PLANS.monthly.price);
const YEARLY = rupees(PLANS.yearly.price);
const CREDITS = PLANS.monthly.monthlyCredits;

export const metadata: Metadata = {
  title: "Pricing",
  description: `Free job search forever. Premium is ${MONTHLY} a month or ${YEARLY} a year for ${CREDITS} tailored resumes, the referral engine, one click autofill, AI job matching and an AI coach.`,
};

const FAQ = [
  { q: "What counts as one application?", a: "One credit covers a resume and cover letter tailored to a single job, including unlimited edits and downloads for that job. Regenerating from scratch uses another credit." },
  { q: "Do unused credits roll over?", a: `No. Credits refill to ${CREDITS} every 30 days on Premium and to ${PLANS.free.monthlyCredits} on Free. Top up packs add ${PLANS.topup.credits} extra credits for ${rupees(PLANS.topup.price)} whenever you need them.` },
  { q: "How do I pay?", a: "UPI AutoPay, debit or credit card, through Razorpay. Your plan renews automatically and you get a GST invoice for every payment." },
  { q: "Is GST included?", a: `Yes. ${MONTHLY} a month and ${YEARLY} a year both include 18% GST. The invoice shows the split.` },
  { q: "How much do I save on yearly?", a: `${YEARLY} a year works out to about ${yearlySavingsPercent()}% less than paying ${MONTHLY} every month for 12 months.` },
  { q: "What else does Premium include?", a: "The referral engine (who you know at each company and a drafted request), your resume score before and after every tailoring, one click autofill with the Chrome extension, AI job matching with a daily top 10, and an AI coach for interviews and offers." },
  { q: "How do I cancel?", a: "Go to Account and billing and press Cancel. You keep Premium until the end of the period you've already paid for, and you won't be charged again." },
  { q: "Can I get a refund?", a: "If you were charged and haven't used any Premium credits, write to us within 7 days for a full refund. See the refund policy for details." },
];

export default async function PricingPage() {
  const user = await getCurrentUser();
  return (
    <div className="container-x py-16">
      <div className="mx-auto max-w-2xl text-center">
        <h1 className="text-5xl font-semibold sm:text-6xl">Pay for the applications, not the search</h1>
        <p className="mt-4 text-lg text-slate">Searching, filtering and tracking are free forever. Premium is for when you&apos;re applying every week.</p>
      </div>
      <div className="mt-12">
        <PricingPlans loggedIn={Boolean(user)} plan={user?.plan ?? null} paymentsReady={razorpayEnabled()} />
      </div>
      <div className="mx-auto mt-24 max-w-3xl">
        <h2 className="text-3xl font-semibold">Billing questions</h2>
        <div className="mt-8"><Faq items={FAQ} /></div>
      </div>
    </div>
  );
}
