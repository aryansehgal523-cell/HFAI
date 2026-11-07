"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Check, Loader2, Wand2 } from "lucide-react";
import type { ResumeData } from "@/db/schema";
import type { ApplicationDetails, JobPreferences } from "@/lib/profile-fields";
import { ProfileEditor } from "./ProfileEditor";
import { PreferencesForm } from "./PreferencesForm";
import { ResumeUploader, type UploadResult } from "./ResumeUploader";
import { useToast } from "./Toast";
import { cn } from "@/lib/utils";

export type OnboardingStep = "upload" | "review" | "prefs";
const STEPS: { key: OnboardingStep; label: string }[] = [
  { key: "upload", label: "Upload your resume" },
  { key: "review", label: "Check what we found" },
  { key: "prefs", label: "Job preferences" },
];

export function OnboardingFlow({
  firstName,
  start,
  initialData,
  initialDetails,
  initialPreferences,
  aiReady,
  replacing,
  scorePanel,
}: {
  firstName: string;
  start: OnboardingStep;
  initialData: ResumeData | null;
  initialDetails: ApplicationDetails | null;
  initialPreferences: JobPreferences | null;
  aiReady: boolean;
  /** Returning user replacing their resume: finish on the profile page, skip preferences. */
  replacing: boolean;
  /** Rendered above the review step once a resume is parsed (resume score, Phase 3). */
  scorePanel?: (data: ResumeData) => React.ReactNode;
}) {
  const router = useRouter();
  const reduce = useReducedMotion();
  const [step, setStep] = useState<OnboardingStep>(start);
  const [data, setData] = useState<ResumeData | null>(initialData);
  const [details, setDetails] = useState<ApplicationDetails | null>(initialDetails);
  const [paste, setPaste] = useState(false);
  const [fresh, setFresh] = useState(false); // true right after a parse, to highlight gaps
  const [version, setVersion] = useState(0); // remounts the editor with newly parsed data
  const current = STEPS.findIndex((s) => s.key === step);
  const steps = replacing ? STEPS.slice(0, 2) : STEPS;

  function parsed(r: UploadResult) {
    setData(r.data);
    setDetails(r.applicationDetails);
    setFresh(true);
    setVersion((v) => v + 1);
    setPaste(false);
    setStep("review");
    window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
  }

  return (
    <div>
      <h1 className="text-4xl font-semibold sm:text-5xl">
        {replacing ? "Replace your resume" : `Welcome, ${firstName}`}
      </h1>
      <p className="mt-3 max-w-2xl text-lg text-slate">
        {replacing
          ? "Upload your latest resume. We will refill your master profile and keep your application details unless the new file has them."
          : "Three quick steps and your job feed is ready. Your master resume is the source every tailored resume is built from."}
      </p>

      <nav aria-label="Onboarding progress" className="mt-8">
        <ol className="flex flex-wrap items-center gap-x-3 gap-y-2">
          {steps.map((s, i) => {
            const done = i < current;
            const now = i === current;
            return (
              <li key={s.key} className="flex items-center gap-3" aria-current={now ? "step" : undefined}>
                <span
                  className={cn(
                    "grid h-8 w-8 place-items-center rounded-full text-sm font-semibold transition-colors",
                    done ? "bg-mint text-white" : now ? "bg-ink text-white" : "border border-line bg-white text-slate",
                  )}
                  aria-hidden
                >
                  {done ? <Check className="h-4 w-4" /> : i + 1}
                </span>
                <span className={cn("text-sm", now ? "font-medium text-ink" : "text-slate")}>
                  {s.label}
                  <span className="sr-only">{done ? " (done)" : now ? " (current step)" : ""}</span>
                </span>
                {i < steps.length - 1 && <span className="hidden h-px w-8 bg-line sm:block" aria-hidden />}
              </li>
            );
          })}
        </ol>
      </nav>

      <AnimatePresence mode="wait">
        <motion.div
          key={step + (paste ? "-paste" : "")}
          initial={reduce ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduce ? undefined : { opacity: 0, y: -8 }}
          transition={{ duration: 0.25 }}
          className="mt-8"
        >
          {step === "upload" &&
            (paste ? (
              <PasteBox aiReady={aiReady} onDone={parsed} onBack={() => setPaste(false)} />
            ) : (
              <ResumeUploader
                onDone={parsed}
                onPasteInstead={() => setPaste(true)}
                footer={
                  replacing ? (
                    <Link href="/profile" className="text-slate underline-offset-2 hover:underline">Cancel</Link>
                  ) : (
                    <>
                      <button type="button" onClick={() => { setFresh(false); setStep("review"); }} className="text-slate underline-offset-2 hover:underline">
                        Fill it in by hand
                      </button>
                      <Link href="/jobs" className="text-slate underline-offset-2 hover:underline">Skip for now</Link>
                    </>
                  )
                }
              />
            ))}

          {step === "review" && (
            <div className="space-y-6">
              {data && fresh && scorePanel?.(data)}
              {fresh && (
                <p className="rounded-xl bg-cobalt-tint px-4 py-3 text-sm text-ink">
                  Here is what we found. Fields marked in yellow came back empty; add them if you have them, then continue.
                </p>
              )}
              <ProfileEditor
                key={version}
                initial={data ?? { experience: [], projects: [], education: [], skills: [], achievements: [] }}
                initialDetails={details}
                aiReady={aiReady}
                highlightEmpty={fresh}
                saveLabel={replacing ? "Save master resume" : "Looks good, continue"}
                onImportAgain={() => setStep("upload")}
                onSaved={(d) => {
                  setData(d);
                  if (replacing) {
                    router.push("/profile");
                    router.refresh();
                  } else setStep("prefs");
                }}
              />
            </div>
          )}

          {step === "prefs" && (
            <div className="panel p-6 sm:p-8">
              <h2 className="text-2xl font-semibold">What are you looking for?</h2>
              <p className="mt-1 text-slate">We use this to rank jobs for you. You can change it any time in your profile.</p>
              <div className="mt-6">
                <PreferencesForm
                  initial={initialPreferences}
                  suggestedYears={details?.totalExperienceYears}
                  submitLabel="Show my jobs"
                  onSaved={() => {
                    router.push("/jobs");
                    router.refresh();
                  }}
                  secondary={<Link href="/jobs" className="text-sm text-slate underline-offset-2 hover:underline">Skip for now</Link>}
                />
              </div>
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

function PasteBox({ aiReady, onDone, onBack }: { aiReady: boolean; onDone: (r: UploadResult) => void; onBack: () => void }) {
  const toast = useToast();
  const [raw, setRaw] = useState("");
  const [busy, setBusy] = useState(false);

  async function read() {
    setBusy(true);
    const res = await fetch("/api/profile/parse", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: raw }) });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return toast(json.error ?? "We could not read that resume. Check the text and try again.", "error");
    onDone(json as UploadResult);
  }

  return (
    <div className="panel p-6 sm:p-8">
      <label htmlFor="paste-resume" className="text-xl font-semibold">Paste your resume text</label>
      <p className="mt-1 text-sm text-slate">Open your resume, select all, copy, and paste it here.</p>
      <textarea id="paste-resume" value={raw} onChange={(e) => setRaw(e.target.value)} rows={14} className="field mt-4 font-mono text-[13px] leading-relaxed" />
      <p className="mt-2 text-xs text-slate">{raw.length < 200 ? `Paste at least a few lines (${raw.length} of 200 characters).` : "Ready to read."}</p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button onClick={read} disabled={busy || raw.length < 200 || !aiReady} className="btn-primary">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
          {busy ? "Reading your resume…" : "Read my resume"}
        </button>
        <button onClick={onBack} className="btn-ghost">Upload a file instead</button>
      </div>
    </div>
  );
}
