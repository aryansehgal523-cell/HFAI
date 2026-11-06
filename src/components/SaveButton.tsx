"use client";
import { Bookmark } from "lucide-react";
import { motion } from "framer-motion";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useToast } from "./Toast";
import { cn } from "@/lib/utils";

export function SaveButton({ jobId, initial, withLabel }: { jobId: string; initial?: boolean; withLabel?: boolean }) {
  const [saved, setSaved] = useState(Boolean(initial));
  const [busy, setBusy] = useState(false);
  const { status } = useSession();
  const router = useRouter();
  const toast = useToast();

  async function toggle() {
    if (status !== "authenticated") {
      router.push(`/login?callbackUrl=${encodeURIComponent(`/jobs/${jobId}`)}`);
      return;
    }
    setBusy(true);
    const next = !saved;
    setSaved(next);
    const res = await fetch("/api/applications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobId, status: next ? "SAVED" : "HIDDEN" }),
    });
    setBusy(false);
    if (!res.ok) {
      setSaved(!next);
      toast("Could not update your tracker. Try again.", "error");
    } else {
      toast(next ? "Saved to your tracker" : "Removed from saved jobs");
      router.refresh();
    }
  }

  return (
    <button
      onClick={toggle}
      disabled={busy}
      aria-pressed={saved}
      aria-label={saved ? "Remove from saved jobs" : "Save job"}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition",
        saved ? "border-ink bg-ink text-white" : "border-line bg-white text-ink hover:border-ink/30",
      )}
    >
      <motion.span animate={saved ? { scale: [1, 1.35, 1] } : { scale: 1 }} transition={{ duration: 0.3 }}>
        <Bookmark className={cn("h-4 w-4", saved && "fill-current")} />
      </motion.span>
      {withLabel ? (saved ? "Saved" : "Save") : <span className="sr-only">{saved ? "Saved" : "Save"}</span>}
    </button>
  );
}
