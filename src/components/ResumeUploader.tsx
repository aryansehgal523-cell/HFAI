"use client";
import { useEffect, useId, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { CheckCircle2, FileUp, Loader2, ShieldCheck } from "lucide-react";
import type { ResumeData } from "@/db/schema";
import type { ApplicationDetails } from "@/lib/profile-fields";
import { cn } from "@/lib/utils";

const MAX_MB = 4;
const STEPS = ["Reading your resume", "Finding your experience", "Checking skills"];
const STEP_AT = [0, 5000, 11000]; // ms; the request usually takes 8 to 20 seconds

export type UploadResult = { data: ResumeData; applicationDetails: ApplicationDetails };

/** Drag and drop (or browse) a PDF or Word resume; parsed on the server. */
export function ResumeUploader({
  onDone,
  onPasteInstead,
  footer,
}: {
  onDone: (r: UploadResult) => void;
  onPasteInstead: () => void;
  footer?: React.ReactNode;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const reduce = useReducedMotion();
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState(0);
  const [fileName, setFileName] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!busy) return;
    const timers = STEP_AT.slice(1).map((ms, i) => setTimeout(() => setStep(i + 1), ms));
    return () => timers.forEach(clearTimeout);
  }, [busy]);

  async function upload(file: File) {
    setErr("");
    const ext = file.name.toLowerCase().split(".").pop();
    if (ext !== "pdf" && ext !== "docx") return setErr("Choose a PDF or Word (.docx) file. For other formats, paste the text instead.");
    if (file.size > MAX_MB * 1024 * 1024) return setErr(`That file is over ${MAX_MB} MB. Save a smaller PDF or paste the text instead.`);
    setFileName(file.name);
    setStep(0);
    setBusy(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/profile/upload", { method: "POST", body });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "We could not read that resume. Try again, or paste the text instead.");
      onDone(json as UploadResult);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Something went wrong. Try again.");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  if (busy) {
    return (
      <div className="panel p-8 sm:p-10" role="status" aria-live="polite">
        <p className="text-sm text-slate">{fileName}</p>
        <ol className="mt-5 space-y-4">
          {STEPS.map((s, i) => (
            <li key={s} className="flex items-center gap-3">
              {i < step ? (
                <CheckCircle2 className="h-5 w-5 text-mint" aria-hidden />
              ) : i === step ? (
                <Loader2 className="h-5 w-5 animate-spin text-cobalt" aria-hidden />
              ) : (
                <span className="h-5 w-5 rounded-full border-2 border-line" aria-hidden />
              )}
              <span className={cn("text-[15px]", i <= step ? "text-ink" : "text-slate")}>
                {s}{i === step ? "…" : ""}
                <span className="sr-only">{i < step ? " done" : i === step ? " in progress" : " waiting"}</span>
              </span>
            </li>
          ))}
        </ol>
        <p className="mt-6 text-sm text-slate">This usually takes 10 to 20 seconds.</p>
      </div>
    );
  }

  return (
    <div>
      <div
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          const f = e.dataTransfer.files?.[0];
          if (f) upload(f);
        }}
        className={cn(
          "relative rounded-2xl border-2 border-dashed bg-white px-6 py-12 text-center transition-colors",
          drag ? "border-cobalt bg-cobalt-tint" : "border-line",
        )}
      >
        <motion.span
          animate={drag && !reduce ? { y: -4, scale: 1.05 } : { y: 0, scale: 1 }}
          className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-cobalt-tint text-cobalt"
          aria-hidden
        >
          <FileUp className="h-6 w-6" />
        </motion.span>
        <p className="mt-4 font-display text-xl font-semibold">Drop your resume here</p>
        <p className="mt-1 text-sm text-slate">PDF or Word (.docx), up to {MAX_MB} MB</p>
        <input
          ref={input}
          id={`${id}-file`}
          type="file"
          accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          className="sr-only"
          tabIndex={-1}
          aria-label="Resume file"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); }}
        />
        <button type="button" onClick={() => input.current?.click()} className="btn-primary mt-5">
          Choose a file
        </button>
      </div>

      <AnimatePresence>
        {err && (
          <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} role="alert" className="mt-3 rounded-xl bg-rose-tint px-4 py-3 text-sm text-rose">
            {err}
          </motion.p>
        )}
      </AnimatePresence>

      <p className="mt-4 flex items-start gap-2 text-sm text-slate">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-mint" aria-hidden />
        We read your file, keep the details you approve, and delete the file.
      </p>
      <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
        <button type="button" onClick={onPasteInstead} className="font-medium text-cobalt underline-offset-2 hover:underline">Paste text instead</button>
        {footer}
      </div>
    </div>
  );
}
