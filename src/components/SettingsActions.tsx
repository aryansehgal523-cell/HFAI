"use client";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2 } from "lucide-react";
import { useToast } from "./Toast";
import { openCheckout } from "@/lib/razorpay-client";

export function CancelPlan({ endsAt }: { endsAt: string | null }) {
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const toast = useToast();
  const router = useRouter();
  async function cancel() {
    setBusy(true);
    const res = await fetch("/api/billing/cancel", { method: "POST" });
    setBusy(false);
    if (!res.ok) return toast("Could not cancel. Contact support.", "error");
    toast("Your plan will end at the close of this billing period");
    router.refresh();
  }
  return confirm ? (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm text-slate">Premium stays active until {endsAt ? new Date(endsAt).toLocaleDateString("en-IN", { day: "numeric", month: "long" }) : "the end of this period"}.</span>
      <button onClick={cancel} disabled={busy} className="btn btn-sm bg-rose text-white hover:bg-rose/90">{busy && <Loader2 className="h-4 w-4 animate-spin" />}Cancel plan</button>
      <button onClick={() => setConfirm(false)} className="btn-ghost btn-sm">Keep Premium</button>
    </div>
  ) : (
    <button onClick={() => setConfirm(true)} className="btn-ghost btn-sm">Cancel plan</button>
  );
}

export function TopUp() {
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const router = useRouter();
  async function buy() {
    setBusy(true);
    try {
      const res = await fetch("/api/billing/topup", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      const result = await openCheckout({ key: data.key, order_id: data.orderId, amount: data.amount, currency: "INR", name: "HireFlow AI", description: "10 extra credits", prefill: { email: data.email, name: data.name } });
      if (result) {
        const v = await fetch("/api/billing/topup/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(result) });
        if (!v.ok) throw new Error("Payment received but not yet confirmed. Credits will appear shortly.");
        toast("10 credits added");
        router.refresh();
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : "Payment failed", "error");
    }
    setBusy(false);
  }
  return (
    <button onClick={buy} disabled={busy} className="btn-ghost btn-sm">
      {busy && <Loader2 className="h-4 w-4 animate-spin" />}Buy 10 credits for ₹199
    </button>
  );
}

export function DeleteAccount() {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  async function del() {
    setBusy(true);
    const res = await fetch("/api/account/delete", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirm: text }) });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return toast(data.error ?? "Could not delete account", "error");
    await signOut({ callbackUrl: "/?deleted=1" });
  }
  return (
    <div>
      <button onClick={() => setOpen((o) => !o)} className="btn btn-sm border border-rose/30 text-rose hover:bg-rose-tint">Delete my account</button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="mt-4 rounded-xl bg-rose-tint p-4">
              <p className="text-sm text-ink">This permanently deletes your profile, resumes, tracker and account, and cancels any subscription. It cannot be undone. Type <strong>DELETE</strong> to confirm.</p>
              <div className="mt-3 flex gap-2">
                <input value={text} onChange={(e) => setText(e.target.value)} className="field max-w-[200px] bg-white" aria-label="Type DELETE to confirm" />
                <button onClick={del} disabled={text !== "DELETE" || busy} className="btn btn-sm bg-rose text-white">{busy && <Loader2 className="h-4 w-4 animate-spin" />}Delete forever</button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
