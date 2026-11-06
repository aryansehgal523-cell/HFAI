"use client";
import { AnimatePresence, animate, motion, useMotionValue, useReducedMotion, useTransform } from "framer-motion";
import { useEffect, useState } from "react";
import { MapPin, Building2 } from "lucide-react";

const BEFORE = "Worked on a chatbot project using Python and LangChain.";
const SEGMENTS = [
  { k: "x", text: "Automated first line support for 4,000 monthly users", label: "X  what you achieved" },
  { k: "y", text: "resolving 32% of tickets with no agent", label: "Y  how it was measured" },
  { k: "z", text: "by building a RAG chatbot on LangChain and FastAPI", label: "Z  how you did it" },
] as const;
const KEYWORDS = ["Python", "RAG", "LangChain", "FastAPI", "AWS"];
const MATCHED_BEFORE = ["Python", "LangChain"];

/**
 * The one orchestrated moment on the landing page: a weak bullet is rewritten
 * into Google's XYZ format while the ATS score climbs. Loops every 9 seconds.
 */
export function HeroDemo() {
  const reduce = useReducedMotion();
  const [phase, setPhase] = useState<0 | 1 | 2 | 3 | 4>(reduce ? 4 : 0);
  const score = useMotionValue(reduce ? 91 : 41);
  const scoreText = useTransform(score, (v) => Math.round(v).toString());
  const ring = useTransform(score, (v) => 2 * Math.PI * 26 * (1 - v / 100));

  useEffect(() => {
    if (reduce) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const cycle = () => {
      setPhase(0);
      score.set(41);
      timers.push(setTimeout(() => setPhase(1), 1800));
      timers.push(setTimeout(() => setPhase(2), 2700));
      timers.push(setTimeout(() => setPhase(3), 3500));
      timers.push(setTimeout(() => {
        setPhase(4);
        animate(score, 91, { duration: 1.3, ease: [0.2, 0.8, 0.2, 1] });
      }, 4300));
    };
    cycle();
    const loop = setInterval(cycle, 9500);
    return () => {
      clearInterval(loop);
      timers.forEach(clearTimeout);
    };
  }, [reduce, score]);

  const rewritten = phase >= 1;
  const done = phase >= 4;

  return (
    <div className="relative mx-auto w-full max-w-[520px]" aria-label="Example: a resume bullet rewritten in XYZ format for a job">
      {/* Job the resume is being tailored to */}
      <div className="relative z-10 ml-auto w-[88%] rounded-2xl border border-line bg-white p-4 shadow-[0_1px_0_rgba(15,26,46,0.04),0_12px_32px_-16px_rgba(0,0,0,0.3)]">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-cobalt-tint font-display text-lg font-semibold text-cobalt">N</span>
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-[17px] font-semibold leading-tight">AI Engineer, LLM Applications</p>
            <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-slate">
              <span className="inline-flex items-center gap-1"><Building2 className="h-3.5 w-3.5" />Northwind Labs</span>
              <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />Bengaluru, hybrid</span>
              <span className="font-medium text-ink">₹14 to 22 LPA</span>
            </p>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {KEYWORDS.map((k) => {
            const hit = done ? k !== "AWS" : MATCHED_BEFORE.includes(k);
            return (
              <span
                key={k}
                className={`rounded-md px-2 py-0.5 text-xs font-medium transition-colors duration-500 ${hit ? "bg-mint-tint text-mint-ink" : "bg-paper text-slate"}`}
              >
                {hit ? "✓ " : ""}{k}
              </span>
            );
          })}
        </div>
      </div>

      {/* Resume sheet */}
      <div className="relative -mt-3 w-[94%] rounded-2xl border border-line bg-white p-5 pt-7 shadow-[0_24px_60px_-28px_rgba(15,26,46,0.35)]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-display text-[15px] font-semibold">Aarav Mehta</p>
            <p className="text-xs text-slate">Associate AI Engineer, Delhi NCR</p>
          </div>
          {/* ATS score ring */}
          <div className="relative grid h-16 w-16 shrink-0 place-items-center">
            <svg viewBox="0 0 64 64" className="absolute inset-0 -rotate-90">
              <circle cx="32" cy="32" r="26" fill="none" style={{ stroke: "rgb(var(--c-line))" }} strokeWidth="6" />
              <motion.circle
                cx="32" cy="32" r="26" fill="none" strokeWidth="6" strokeLinecap="round"
                strokeDasharray={2 * Math.PI * 26}
                style={{ strokeDashoffset: ring, stroke: done ? "rgb(var(--c-mint))" : "rgb(var(--c-marigold))", transition: "stroke .4s" }}
              />
            </svg>
            <div className="text-center leading-none">
              <motion.span className="font-display text-lg font-semibold tabular-nums">{scoreText}</motion.span>
              <span className="block text-[10px] text-slate">ATS</span>
            </div>
          </div>
        </div>

        <p className="mt-4 text-[11px] font-medium text-slate">Experience</p>
        <div className="mt-1.5 min-h-[92px] text-[14.5px] leading-[1.65] text-ink">
          <AnimatePresence mode="wait">
            {!rewritten ? (
              <motion.p
                key="before"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, filter: "blur(4px)", y: -6 }}
                transition={{ duration: 0.35 }}
                className="text-slate"
              >
                <span className="mr-1.5 text-slate-light">•</span>
                {BEFORE}
              </motion.p>
            ) : (
              <motion.p key="after">
                <span className="mr-1.5 text-slate-light">•</span>
                {SEGMENTS.map((s, i) => (
                  <motion.span
                    key={s.k}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: phase >= i + 1 ? 1 : 0, y: phase >= i + 1 ? 0 : 6 }}
                    transition={{ duration: 0.45, ease: "easeOut" }}
                    className={`seg-${s.k}`}
                  >
                    {s.text}
                    {i === 0 ? ", " : i === 1 ? ", " : "."}
                  </motion.span>
                ))}
              </motion.p>
            )}
          </AnimatePresence>
        </div>

        {/* Legend appears with the rewrite */}
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 border-t border-line pt-3">
          {SEGMENTS.map((s, i) => (
            <motion.span
              key={s.k}
              animate={{ opacity: phase >= i + 1 ? 1 : 0.35 }}
              className="inline-flex items-center gap-1.5 text-xs text-slate"
            >
              <span className={`h-2.5 w-2.5 rounded-full ${s.k === "x" ? "bg-cobalt" : s.k === "y" ? "bg-marigold" : "bg-mint"}`} />
              {s.label.replace("  ", ": ")}
            </motion.span>
          ))}
        </div>
      </div>
    </div>
  );
}
