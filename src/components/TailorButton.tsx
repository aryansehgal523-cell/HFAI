"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2, Wand2 } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useToast } from "./Toast";

const STAGES = ["Reading the job description", "Matching your experience", "Rewriting bullets in XYZ format", "Drafting your cover letter", "Checking ATS keywords"];

export function TailorButton({
  jobId,
  loggedIn,
  hasProfile,
  credits,
  existing,
  regenerate,
  className,
}: {
  jobId: string;
  loggedIn: boolean;
  hasProfile: boolean;
  credits: number;
  existing?: boolean;
  regenerate?: boolean;
  className?: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState(0);

  async function go() {
    if (!loggedIn) return router.push(`/signup?callbackUrl=${encodeURIComponent(`/jobs/${jobId}`)}`);
    if (existing && !regenerate) return router.push(`/tailor/${jobId}`);
    if (!hasProfile) return router.push(`/profile?next=${encodeURIComponent(`/jobs/${jobId}`)}`);
    if (credits <= 0) return router.push("/pricing");

    setBusy(true);
    setStage(0);
    const timer = setInterval(() => setStage((s) => Math.min(s + 1, STAGES.length - 1)), 2600);
    const res = await fetch("/api/tailor", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobId, regenerate }),
    });
    clearInterval(timer);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setBusy(false);
      toast(data.error ?? "Something went wrong. Try again.", "error");
      if (res.status === 402) router.push("/pricing");
      return;
    }
    router.push(`/tailor/${jobId}`);
    router.refresh();
  }

  const label = !loggedIn
    ? "Sign up to tailor my resume"
    : existing && !regenerate
      ? "Open my tailored resume"
      : regenerate
        ? "Regenerate (1 credit)"
        : !hasProfile
          ? "Add my resume to start"
          : credits <= 0
            ? "Get more credits"
            : "Tailor my resume (1 credit)";

  return (
    <div className={className}>
      <button onClick={go} disabled={busy} className={regenerate ? "btn-ghost w-full" : "btn-primary w-full py-3 text-base"}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
        {busy ? "Tailoring…" : label}
      </button>
      <AnimatePresence>
        {busy && (
          <motion.p
            key={stage}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="mt-3 text-center text-sm text-slate"
            aria-live="polite"
          >
            {STAGES[stage]}…
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}
