"use client";
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, Loader2 } from "lucide-react";
import { useSession } from "next-auth/react";
import { FormField, validators } from "./FormField";

const TOPICS = [
  ["support", "Help with my account"],
  ["billing", "Billing or refund"],
  ["grievance", "Complaint or grievance"],
  ["employer", "I'm an employer"],
  ["removal", "Remove my company's jobs"],
  ["other", "Something else"],
] as const;

export function ContactForm() {
  const { data } = useSession();
  const [form, setForm] = useState({ name: data?.user?.name ?? "", email: data?.user?.email ?? "", topic: "support", message: "" });
  const [state, setState] = useState<"idle" | "busy" | "sent">("idle");
  const [error, setError] = useState("");
  const [tried, setTried] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setTried(true);
    if (validators.name(form.name) || validators.email(form.email) || validators.message(form.message)) return;
    setState("busy");
    setError("");
    const res = await fetch("/api/contact", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setState("idle");
      return setError(json.error ?? "Could not send your message");
    }
    setState("sent");
  }

  return (
    <AnimatePresence mode="wait">
      {state === "sent" ? (
        <motion.div key="sent" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className="panel p-8 text-center">
          <CheckCircle2 className="mx-auto h-10 w-10 text-mint" />
          <p className="mt-4 font-display text-2xl font-semibold">Message sent</p>
          <p className="mt-2 text-slate">We reply within 2 working days, usually sooner.</p>
        </motion.div>
      ) : (
        <motion.form key="form" noValidate onSubmit={submit} className="panel space-y-4 p-6 sm:p-8" exit={{ opacity: 0 }}>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Name" autoComplete="name" value={form.name} onChange={(v) => setForm({ ...form, name: v })} validate={validators.name} showErrors={tried} />
            <FormField label="Email" type="email" autoComplete="email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} validate={validators.email} showErrors={tried} />
          </div>
          <label className="block">
            <span className="label">Topic</span>
            <select className="field" value={form.topic} onChange={(e) => setForm({ ...form, topic: e.target.value })}>
              {TOPICS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
          <FormField label="Message" multiline value={form.message} onChange={(v) => setForm({ ...form, message: v })} validate={validators.message} showErrors={tried} />
          {error && <p className="rounded-lg bg-rose-tint px-3 py-2 text-sm text-rose" role="alert">{error}</p>}
          <button className="btn-primary" disabled={state === "busy"}>{state === "busy" && <Loader2 className="h-4 w-4 animate-spin" />}Send message</button>
        </motion.form>
      )}
    </AnimatePresence>
  );
}
