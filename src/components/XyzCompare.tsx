"use client";
import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import { cn } from "@/lib/utils";

const EXAMPLES = [
  {
    role: "Data analyst",
    before: "Responsible for creating dashboards for the sales team.",
    after: [
      ["Cut weekly reporting time for 14 sales managers from 6 hours to 40 minutes", "x"],
      [", ", ""],
      ["saving about 70 hours a month", "y"],
      [", ", ""],
      ["by building automated Power BI dashboards on a SQL Server warehouse.", "z"],
    ],
  },
  {
    role: "Backend engineer",
    before: "Worked on improving the performance of the payments API.",
    after: [
      ["Reduced p95 latency of the payments API serving 2M daily requests", "x"],
      [" ", ""],
      ["from 820 ms to 190 ms", "y"],
      [", ", ""],
      ["by adding Redis caching and rewriting three N+1 queries in Spring Boot.", "z"],
    ],
  },
  {
    role: "Student project",
    before: "Made a sign language translation app as a team project.",
    after: [
      ["Built a real time sign language translator recognising 26 gestures", "x"],
      [" ", ""],
      ["at 94% accuracy on a 6,000 image test set", "y"],
      [", ", ""],
      ["by training a MediaPipe and LSTM pipeline in PyTorch.", "z"],
    ],
  },
] as const;

export function XyzCompare() {
  const [i, setI] = useState(0);
  const [after, setAfter] = useState(true);
  const ex = EXAMPLES[i];
  return (
    <div className="panel p-5 sm:p-7">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Example role">
          {EXAMPLES.map((e, n) => (
            <button key={e.role} role="tab" aria-selected={n === i} data-on={n === i} onClick={() => setI(n)} className="chip">
              {e.role}
            </button>
          ))}
        </div>
        <div className="relative inline-flex rounded-full bg-paper p-1 text-sm" role="group" aria-label="Show before or after">
          {(["Before", "After"] as const).map((label) => {
            const on = (label === "After") === after;
            return (
              <button key={label} onClick={() => setAfter(label === "After")} className={cn("relative z-10 rounded-full px-4 py-1.5 transition-colors", on ? "text-white" : "text-slate")}>
                {on && <motion.span layoutId="xyz-pill" className="absolute inset-0 -z-10 rounded-full bg-ink" transition={{ type: "spring", stiffness: 500, damping: 40 }} />}
                {label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-6 min-h-[132px] font-display text-[22px] leading-[1.45] sm:text-[26px]">
        <AnimatePresence mode="wait">
          <motion.p
            key={`${i}-${after}`}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25 }}
            className={after ? "text-ink" : "text-slate"}
          >
            {after ? ex.after.map(([t, k], n) => <span key={n} className={k ? `seg-${k}` : undefined}>{t}</span>) : ex.before}
          </motion.p>
        </AnimatePresence>
      </div>
      <p className="mt-5 text-sm text-slate">
        {after
          ? "HireFlow only uses facts from your own resume. When a number is missing, it asks you instead of making one up."
          : "A duty, not a result. Recruiters skim past lines like this in seconds."}
      </p>
    </div>
  );
}
