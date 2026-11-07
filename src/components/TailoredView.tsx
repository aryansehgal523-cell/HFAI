"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Copy, Download, ExternalLink, FileDown, Lock, Pencil, Check, Loader2, HelpCircle } from "lucide-react";
import type { ResumeData } from "@/db/schema";
import { ResumeSheet } from "./ResumeSheet";
import { useToast } from "./Toast";
import { downloadLetterDocx, downloadResumeDocx } from "@/lib/docx-export";
import { cn } from "@/lib/utils";
import { biggestGains, scoreResume, topTips, type ResumeScore, type ScoreJob } from "@/lib/resumeScore";
import { ScoreBars, ScoreRing, TipList, useDebounced } from "./ResumeScoreUI";

type Props = {
  tailoringId: string;
  jobId: string;
  jobTitle: string;
  company: string;
  applyUrl: string;
  resume: ResumeData;
  coverLetter: string;
  scoreJob: ScoreJob;
  experienceYears: number;
  breakdownBefore: ResumeScore;
  breakdownAfter: ResumeScore;
  missing: string[];
  premium: boolean;
  applied: boolean;
};

const pts = (n: number) => `${n} ${n === 1 ? "point" : "points"}`;

function BeforeAfter({ before, after }: { before: ResumeScore; after: ResumeScore }) {
  const gains = biggestGains(before, after);
  return (
    <div>
      <p className="text-sm font-semibold text-ink">Resume score for this job</p>
      <div className="mt-4 flex items-start justify-around gap-2">
        <ScoreRing value={before.total} size={96} label="Your master resume" animateIn={false} />
        <ScoreRing value={after.total} from={before.total} size={96} label="Tailored" />
      </div>
      <p className="mt-4 text-sm text-ink-soft" aria-live="polite">
        {after.total > before.total
          ? `Up ${pts(after.total - before.total)}${gains.length ? `, mostly from ${gains.map((g) => `${g.label.toLowerCase()} (+${g.delta})`).join(" and ")}` : ""}.`
          : after.total === before.total
            ? "Same score as your master resume, now ordered for this job."
            : `Down ${pts(before.total - after.total)} from your master resume. Check the tips below.`}
      </p>
      <div className="mt-5"><ScoreBars score={after} before={before} compact /></div>
    </div>
  );
}

export function TailoredView(p: Props) {
  const router = useRouter();
  const toast = useToast();
  const [tab, setTab] = useState<"resume" | "letter">("resume");
  const [resume, setResume] = useState(p.resume);
  const [letter, setLetter] = useState(p.coverLetter);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [applied, setApplied] = useState(p.applied);
  // Re-score live while editing, against the same job and with the same function as the server.
  const debounced = useDebounced(resume, 250);
  const liveAfter = useMemo(
    () => (debounced === p.resume ? p.breakdownAfter : scoreResume(debounced, { job: p.scoreJob, experienceYears: p.experienceYears })),
    [debounced, p.resume, p.breakdownAfter, p.scoreJob, p.experienceYears],
  );

  async function saveEdits() {
    setSaving(true);
    const res = await fetch(`/api/tailor/${p.tailoringId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(tab === "resume" ? { resume } : { coverLetter: letter }),
    });
    setSaving(false);
    if (!res.ok) return toast("Could not save your edits", "error");
    setEditing(false);
    toast("Edits saved");
  }

  async function markApplied() {
    const res = await fetch("/api/applications", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jobId: p.jobId, status: "APPLIED" }) });
    if (res.ok) {
      setApplied(true);
      toast("Marked as applied. Good luck!");
      router.refresh();
    }
  }

  const premiumOnly = (fn: () => void) => () => (p.premium ? fn() : router.push("/pricing"));

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
      <div>
        <div className="no-print flex flex-wrap items-center justify-between gap-3">
          <div className="relative inline-flex rounded-full border border-line bg-white p-1 text-sm" role="tablist">
            {(["resume", "letter"] as const).map((k) => (
              <button key={k} role="tab" aria-selected={tab === k} onClick={() => { setTab(k); setEditing(false); }} className={cn("relative z-10 rounded-full px-4 py-1.5", tab === k ? "text-white" : "text-slate")}>
                {tab === k && <motion.span layoutId="tab-pill" className="absolute inset-0 -z-10 rounded-full bg-ink" transition={{ type: "spring", stiffness: 500, damping: 40 }} />}
                {k === "resume" ? "Resume" : "Cover letter"}
              </button>
            ))}
          </div>
          <button onClick={editing ? saveEdits : () => setEditing(true)} className={editing ? "btn-primary btn-sm" : "btn-ghost btn-sm"} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : editing ? <Check className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
            {editing ? "Save edits" : "Edit"}
          </button>
        </div>

        <AnimatePresence mode="wait">
          <motion.div key={`${tab}-${editing}`} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} className="mt-5">
            {tab === "resume" ? (
              editing ? (
                <BulletEditor resume={resume} onChange={setResume} />
              ) : (
                <div className="overflow-x-auto rounded-2xl border border-line shadow-[0_24px_60px_-30px_rgba(15,26,46,0.35)]">
                  <ResumeSheet data={resume} />
                </div>
              )
            ) : editing ? (
              <textarea value={letter} onChange={(e) => setLetter(e.target.value)} rows={18} className="field text-[15px] leading-relaxed" />
            ) : (
              <div className="whitespace-pre-line rounded-2xl border border-line bg-white p-8 text-[15.5px] leading-[1.8] text-ink-soft sm:p-10">{letter}</div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      <aside className="no-print space-y-5 lg:sticky lg:top-24 lg:self-start">
        <div className="panel p-6">
          <BeforeAfter before={p.breakdownBefore} after={liveAfter} />
        </div>

        <div className="panel space-y-2.5 p-6">
          <p className="mb-1 text-sm font-semibold">Download</p>
          {tab === "resume" ? (
            <>
              <a href={`/api/resume/pdf?jobId=${p.jobId}`} download className="btn-ink w-full"><FileDown className="h-4 w-4" />Resume as PDF</a>
              <a href={`/print/${p.jobId}`} target="_blank" className="block text-center text-xs text-slate underline-offset-2 hover:underline">Or print it from your browser</a>
              <button onClick={premiumOnly(() => downloadResumeDocx(resume, p.company, p.jobTitle))} className="btn-ghost w-full">
                {p.premium ? <Download className="h-4 w-4" /> : <Lock className="h-4 w-4" />}Resume as Word
              </button>
            </>
          ) : (
            <>
              <button onClick={() => { navigator.clipboard.writeText(letter); toast("Cover letter copied"); }} className="btn-ink w-full"><Copy className="h-4 w-4" />Copy cover letter</button>
              <button onClick={premiumOnly(() => downloadLetterDocx(letter, resume.name ?? "Cover", p.company))} className="btn-ghost w-full">
                {p.premium ? <Download className="h-4 w-4" /> : <Lock className="h-4 w-4" />}Letter as Word
              </button>
            </>
          )}
          {!p.premium && <p className="pt-1 text-xs text-slate">Word downloads come with Premium.</p>}
        </div>

        <div className="panel space-y-2.5 p-6">
          <a href={p.applyUrl} target="_blank" rel="noopener noreferrer nofollow" className="btn-primary w-full">Apply at {p.company} <ExternalLink className="h-4 w-4" /></a>
          <button onClick={markApplied} disabled={applied} className="btn-ghost w-full">{applied ? <><Check className="h-4 w-4 text-mint" />Marked as applied</> : "I've applied"}</button>
        </div>

        {topTips(liveAfter).length > 0 && (
          <div className="panel p-6"><TipList tips={topTips(liveAfter)} title="Raise it further" /></div>
        )}

        {p.missing.length > 0 && (
          <div className="rounded-2xl bg-marigold-tint p-6">
            <p className="flex items-center gap-2 text-sm font-semibold"><HelpCircle className="h-4 w-4 text-marigold-deep" />Add these numbers to make it stronger</p>
            <ul className="mt-3 space-y-2 text-sm text-ink-soft">
              {p.missing.slice(0, 6).map((m) => <li key={m}>{m}</li>)}
            </ul>
            <p className="mt-3 text-xs text-slate">Add them to your master resume and regenerate, or edit the bullets here.</p>
          </div>
        )}
      </aside>
    </div>
  );
}

function BulletEditor({ resume, onChange }: { resume: ResumeData; onChange: (r: ResumeData) => void }) {
  const set = (fn: (r: ResumeData) => void) => {
    const next = structuredClone(resume);
    fn(next);
    onChange(next);
  };
  return (
    <div className="space-y-5">
      <label className="block">
        <span className="label">Summary</span>
        <textarea className="field" rows={3} value={resume.summary ?? ""} onChange={(e) => set((r) => { r.summary = e.target.value; })} />
      </label>
      {resume.experience.map((e, i) => (
        <div key={i} className="panel p-5">
          <p className="font-semibold">{e.title}, {e.company}</p>
          <div className="mt-3 space-y-2">
            {e.bullets.map((b, n) => (
              <textarea key={n} className="field text-sm" rows={2} value={b} onChange={(ev) => set((r) => { r.experience[i].bullets[n] = ev.target.value; })} />
            ))}
          </div>
        </div>
      ))}
      {resume.projects.map((pr, i) => (
        <div key={`p${i}`} className="panel p-5">
          <p className="font-semibold">{pr.name}</p>
          <div className="mt-3 space-y-2">
            {pr.bullets.map((b, n) => (
              <textarea key={n} className="field text-sm" rows={2} value={b} onChange={(ev) => set((r) => { r.projects[i].bullets[n] = ev.target.value; })} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
