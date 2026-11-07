"use client";
import { useEffect, useState } from "react";
import { animate, motion, useMotionValue, useReducedMotion, useTransform } from "framer-motion";
import { Lightbulb } from "lucide-react";
import type { ResumeScore } from "@/lib/resumeScore";
import { cn } from "@/lib/utils";

/** Colour band for a score: token classes only, so light and dark themes both work. */
export function scoreTone(n: number) {
  return n >= 75 ? "text-mint" : n >= 50 ? "text-marigold" : "text-rose";
}
export function scoreWord(n: number) {
  return n >= 85 ? "Excellent" : n >= 75 ? "Strong" : n >= 60 ? "Good start" : n >= 40 ? "Needs work" : "Weak";
}

/** Ring with the total counting up from `from` to `value`. The one orchestrated animation on a screen. */
export function ScoreRing({ value, from = 0, size = 120, label, animateIn = true }: {
  value: number; from?: number; size?: number; label: string; animateIn?: boolean;
}) {
  const reduce = useReducedMotion();
  const mv = useMotionValue(animateIn && !reduce ? from : value);
  const text = useTransform(mv, (n) => Math.round(n).toString());
  const stroke = 10;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const dash = useTransform(mv, (n) => `${(Math.max(0, Math.min(100, n)) / 100) * c} ${c}`);
  useEffect(() => {
    if (reduce || !animateIn) { mv.set(value); return; }
    const ctl = animate(mv, value, { duration: 1.1, ease: [0.2, 0.8, 0.2, 1] });
    return () => ctl.stop();
  }, [value, mv, reduce, animateIn]);

  return (
    <figure className="flex flex-col items-center" aria-label={`${label}: ${value} out of 100, ${scoreWord(value)}`}>
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90" aria-hidden>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="stroke-line" />
          <motion.circle
            cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} strokeLinecap="round"
            className={cn("stroke-current", scoreTone(value))}
            style={{ strokeDasharray: dash }}
          />
        </svg>
        <div className="absolute inset-0 grid place-items-center text-center">
          <div>
            <motion.span className="block font-display text-4xl font-semibold tabular-nums text-ink" aria-hidden>{text}</motion.span>
            <span className="text-[11px] text-slate" aria-hidden>of 100</span>
          </div>
        </div>
      </div>
      <figcaption className="mt-2 text-center text-sm">
        <span className="block font-medium text-ink">{label}</span>
        <span className={cn("text-xs", scoreTone(value))}>{scoreWord(value)}</span>
      </figcaption>
    </figure>
  );
}

/** One bar per category, optionally against a "before" score with the change. */
export function ScoreBars({ score, before, compact }: { score: ResumeScore; before?: ResumeScore | null; compact?: boolean }) {
  return (
    <ul className={cn("space-y-3", compact && "space-y-2")}>
      {score.categories.map((c) => {
        const b = before?.categories.find((x) => x.key === c.key);
        const delta = b ? Math.round((c.score - b.score) * 10) / 10 : 0;
        return (
          <li key={c.key}>
            <div className="flex items-baseline justify-between gap-2 text-sm">
              <span className="text-ink">{c.label}</span>
              <span className="tabular-nums text-slate">
                {fmt(c.score)}<span className="text-slate-light">/{c.max}</span>
                {b && delta !== 0 && (
                  <span className={cn("ml-1.5 rounded px-1 text-xs font-medium", delta > 0 ? "bg-mint-tint text-mint-ink" : "bg-rose-tint text-rose")}>
                    {delta > 0 ? `+${fmt(delta)}` : fmt(delta)}
                  </span>
                )}
              </span>
            </div>
            <div className="relative mt-1 h-2 overflow-hidden rounded-full bg-paper" role="presentation">
              {b && <div className="absolute inset-y-0 left-0 rounded-full bg-slate/25" style={{ width: `${(b.score / c.max) * 100}%` }} />}
              <div
                className={cn("absolute inset-y-0 left-0 rounded-full transition-[width] duration-500 motion-reduce:transition-none", c.score / c.max >= 0.75 ? "bg-mint" : c.score / c.max >= 0.5 ? "bg-marigold" : "bg-rose")}
                style={{ width: `${(c.score / c.max) * 100}%` }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function TipList({ tips, title = "Top fixes" }: { tips: string[]; title?: string }) {
  if (tips.length === 0) return <p className="text-sm text-mint-ink">Nothing big to fix. Nice work.</p>;
  return (
    <div>
      <p className="flex items-center gap-1.5 text-sm font-semibold text-ink"><Lightbulb className="h-4 w-4 text-marigold-deep" aria-hidden />{title}</p>
      <ol className="mt-2 list-decimal space-y-2 pl-5 text-sm text-ink-soft">
        {tips.map((t) => <li key={t}>{t}</li>)}
      </ol>
    </div>
  );
}

/** Tiny trend line of past master scores. */
export function ScoreTrend({ points }: { points: { total: number; at: string | Date }[] }) {
  const [w, h] = [220, 44];
  if (points.length < 2) return <p className="text-xs text-slate">Your score history appears here after you save a few changes.</p>;
  const xs = points.map((_, i) => (i / (points.length - 1)) * (w - 8) + 4);
  const ys = points.map((p) => h - 4 - (p.total / 100) * (h - 8));
  const d = xs.map((x, i) => `${i ? "L" : "M"}${x.toFixed(1)},${ys[i].toFixed(1)}`).join(" ");
  const first = points[0].total;
  const last = points[points.length - 1].total;
  return (
    <figure>
      <svg viewBox={`0 0 ${w} ${h}`} className="h-11 w-full" role="img" aria-label={`Score went from ${first} to ${last} over your last ${points.length} saves`}>
        <path d={d} fill="none" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" className="stroke-cobalt" />
        <circle cx={xs[xs.length - 1]} cy={ys[ys.length - 1]} r={3.5} className="fill-cobalt" />
      </svg>
      <figcaption className="text-xs text-slate">
        {last > first ? `Up ${last - first} ${last - first === 1 ? "point" : "points"}` : last < first ? `Down ${first - last} ${first - last === 1 ? "point" : "points"}` : "Steady"} over your last {points.length} saves
      </figcaption>
    </figure>
  );
}

/** Debounce a value; used to rescore while typing without doing it on every key. */
export function useDebounced<T>(value: T, ms = 250) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
