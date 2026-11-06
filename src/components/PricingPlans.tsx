"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { animate, motion, useMotionValue, useTransform } from "framer-motion";
import { Check, Loader2 } from "lucide-react";
import { openCheckout } from "@/lib/razorpay-client";
import { useToast } from "./Toast";
import { cn } from "@/lib/utils";

const FREE = [
  "Unlimited job search with every filter",
  "Ghost job filter",
  "Application tracker",
  "Job alerts by email",
  "3 tailored resumes and cover letters a month",
  "ATS match score on every job",
  "PDF download",
];
const PREMIUM = [
  "Everything in Free",
  "30 tailored resumes and cover letters a month",
  "Every bullet rewritten in XYZ format",
  "PDF and Word downloads",
  "Top up packs: 10 more for ₹199",
  "Priority support",
];

function Price({ value }: { value: number }) {
  const mv = useMotionValue(value);
  const text = useTransform(mv, (v) => Math.round(v).toLocaleString("en-IN"));
  useEffect(() => {
    const c = animate(mv, value, { duration: 0.5, ease: "easeOut" });
    return () => c.stop();
  }, [value, mv]);
  return <motion.span>{text}</motion.span>;
}

export function PricingPlans({ loggedIn, plan, paymentsReady }: { loggedIn: boolean; plan: "FREE" | "PREMIUM" | null; paymentsReady: boolean }) {
  const [interval, setPeriod] = useState<"monthly" | "yearly">("monthly");
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const toast = useToast();

  async function subscribe() {
    if (!loggedIn) return router.push("/signup?callbackUrl=/pricing");
    setBusy(true);
    try {
      const res = await fetch("/api/billing/subscribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ interval }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not start checkout");
      const result = await openCheckout({
        key: data.key,
        subscription_id: data.subscriptionId,
        name: "HireFlow AI",
        description: interval === "monthly" ? "Premium, monthly" : "Premium, yearly",
        prefill: { name: data.name, email: data.email },
        notes: { interval },
      });
      if (!result) {
        setBusy(false);
        return toast("Payment was not completed. You have not been charged.", "error");
      }
      const v = await fetch("/api/billing/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(result) });
      if (!v.ok) throw new Error("We could not confirm the payment. If money was deducted, it will be activated within minutes.");
      toast("Welcome to Premium. You have 30 credits.");
      router.push("/dashboard");
      router.refresh();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Something went wrong", "error");
    }
    setBusy(false);
  }

  const monthlyEquivalent = interval === "monthly" ? 599 : Math.round(4999 / 12);

  return (
    <div>
      <div className="flex justify-center">
        <div className="relative inline-flex rounded-full border border-line bg-white p-1 text-sm" role="group" aria-label="Billing period">
          {(["monthly", "yearly"] as const).map((k) => (
            <button key={k} onClick={() => setPeriod(k)} className={cn("relative z-10 rounded-full px-5 py-2 transition-colors", interval === k ? "text-white" : "text-slate")} aria-pressed={interval === k}>
              {interval === k && <motion.span layoutId="interval-pill" className="absolute inset-0 -z-10 rounded-full bg-ink" transition={{ type: "spring", stiffness: 500, damping: 40 }} />}
              {k === "monthly" ? "Monthly" : "Yearly, save 30%"}
            </button>
          ))}
        </div>
      </div>

      <div className="mx-auto mt-10 grid max-w-4xl items-stretch gap-6 md:grid-cols-[1fr_1.15fr]">
        {/* Free: deliberately quiet */}
        <div className="flex flex-col rounded-3xl border border-line bg-paper p-8">
          <h2 className="text-2xl font-semibold">Free</h2>
          <p className="mt-1 text-slate">For searching and trying it out</p>
          <p className="mt-6 font-display text-5xl font-semibold">₹0</p>
          <p className="mt-1 text-sm text-slate">Forever</p>
          <ul className="mt-8 flex-1 space-y-3 text-[15px]">
            {FREE.map((f) => <li key={f} className="flex gap-3"><Check className="mt-0.5 h-5 w-5 shrink-0 text-slate" />{f}</li>)}
          </ul>
          <Link href={loggedIn ? "/jobs" : "/signup"} className="btn-ghost mt-8 w-full">{loggedIn ? "Search jobs" : "Start free"}</Link>
        </div>

        {/* Premium: the one emphasised card */}
        <div className="light-scope relative flex flex-col overflow-hidden rounded-3xl bg-ink p-8 text-white shadow-[0_30px_80px_-30px_rgba(51,70,242,0.6)]">
          <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-cobalt/50 blur-3xl" />
          <div className="relative flex items-center justify-between">
            <h2 className="text-2xl font-semibold text-white">Premium</h2>
            <span className="rounded-full bg-marigold px-3 py-1 text-xs font-semibold text-ink">30 applications a month</span>
          </div>
          <p className="relative mt-1 text-white/60">For an active job search</p>
          <p className="relative mt-6 font-display text-5xl font-semibold">
            ₹<Price value={interval === "monthly" ? 599 : 4999} />
            <span className="text-xl font-normal text-white/60">{interval === "monthly" ? " / month" : " / year"}</span>
          </p>
          <p className="relative mt-1 text-sm text-white/60">
            {interval === "monthly" ? "About ₹20 per tailored application" : `Works out to ₹${monthlyEquivalent} a month`}. GST included.
          </p>
          <ul className="relative mt-8 flex-1 space-y-3 text-[15px]">
            {PREMIUM.map((f) => <li key={f} className="flex gap-3"><Check className="mt-0.5 h-5 w-5 shrink-0 text-mint" />{f}</li>)}
          </ul>
          {plan === "PREMIUM" ? (
            <Link href="/settings" className="btn relative mt-8 w-full bg-white/10 text-white hover:bg-white/15">Manage your plan</Link>
          ) : (
            <button onClick={subscribe} disabled={busy || (loggedIn && !paymentsReady)} className="btn relative mt-8 w-full bg-white py-3 text-base text-ink hover:bg-paper">
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {loggedIn ? (paymentsReady ? "Upgrade with UPI or card" : "Payments coming soon") : "Sign up to upgrade"}
            </button>
          )}
          <p className="relative mt-3 text-center text-xs text-white/50">Cancel any time from your account. Secured by Razorpay.</p>
        </div>
      </div>
    </div>
  );
}
