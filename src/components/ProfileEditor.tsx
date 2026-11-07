"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { FileText, Loader2, Plus, Trash2, Wand2 } from "lucide-react";
import type { ResumeData } from "@/db/schema";
import type { ResumeScore } from "@/lib/resumeScore";
import { useToast } from "./Toast";
import {
  EMPTY_DETAILS, GENDER_OPTIONS, NOTICE_LABEL, NOTICE_PERIODS, YES_NO_PREFER, type ApplicationDetails,
} from "@/lib/profile-fields";
import { cn } from "@/lib/utils";

const EMPTY: ResumeData = { experience: [], projects: [], education: [], skills: [], achievements: [] };

const lines = (s: string) => s.split("\n").map((l) => l.replace(/^[•\-*]\s*/, "").trim()).filter(Boolean);

export function ProfileEditor({
  initial,
  initialDetails,
  aiReady,
  next,
  highlightEmpty = false,
  onSaved,
  saveLabel = "Save master resume",
  onImportAgain,
  onDataChange,
  onSavedScore,
}: {
  initial: ResumeData | null;
  initialDetails?: ApplicationDetails | null;
  aiReady: boolean;
  next?: string;
  /** Mark empty fields so the user knows what to add (used right after an upload). */
  highlightEmpty?: boolean;
  onSaved?: (data: ResumeData) => void;
  saveLabel?: string;
  /** Replace the built in paste box, e.g. to go back to the uploader. */
  onImportAgain?: () => void;
  /** Called on every edit (for the live resume score). */
  onDataChange?: (data: ResumeData) => void;
  /** Called with the server's recorded score after a successful save. */
  onSavedScore?: (score: ResumeScore) => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [data, setData] = useState<ResumeData>(initial ?? EMPTY);
  const [details, setDetails] = useState<ApplicationDetails>({ ...EMPTY_DETAILS, ...(initialDetails ?? {}) });
  const [mode, setMode] = useState<"import" | "edit">(initial ? "edit" : "import");
  const setDetail = <K extends keyof ApplicationDetails>(k: K, v: ApplicationDetails[K]) => {
    setDetails((d) => ({ ...d, [k]: v }));
    setDirty(true);
  };
  const miss = (v: unknown) =>
    highlightEmpty && (v === undefined || v === null || (typeof v === "string" && !v.trim()) || (Array.isArray(v) && v.length === 0));
  const [raw, setRaw] = useState("");
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);

  const update = (fn: (d: ResumeData) => ResumeData) => {
    setData((d) => fn(structuredClone(d)));
    setDirty(true);
  };
  useEffect(() => { onDataChange?.(data); }, [data, onDataChange]);

  async function importResume() {
    setBusy(true);
    const res = await fetch("/api/profile/parse", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: raw }) });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return toast(json.error ?? "Could not read that resume", "error");
    setData({ ...EMPTY, ...json.data });
    setMode("edit");
    setDirty(false);
    toast("Resume imported. Check every section, then save.");
    router.refresh();
  }

  async function save() {
    setBusy(true);
    const res = await fetch("/api/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ headline: data.headline, location: data.contact?.location, phone: data.contact?.phone, data, applicationDetails: cleanDetails(details) }),
    });
    setBusy(false);
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      return toast(json.error ?? "Could not save. Try again.", "error");
    }
    setDirty(false);
    const saved = await res.json().catch(() => ({}));
    if (saved.score) onSavedScore?.(saved.score);
    toast("Master resume saved");
    if (onSaved) onSaved(data);
    else if (next) router.push(next);
    else router.refresh();
  }

  if (mode === "import") {
    return (
      <div className="panel p-6 sm:p-8">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-cobalt-tint text-cobalt"><FileText className="h-5 w-5" /></span>
          <div>
            <h2 className="text-xl font-semibold">Paste your current resume</h2>
            <p className="text-sm text-slate">Open your PDF or Word file, select all, copy, and paste it here. We only keep what you approve.</p>
          </div>
        </div>
        <textarea
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          rows={14}
          className="field mt-6 font-mono text-[13px] leading-relaxed"
          placeholder={"Aarav Mehta\nAssociate AI Engineer, New Delhi\n\nEXPERIENCE\nAcme Corp, AI Engineer, Jun 2025 to present\n• Built a RAG chatbot ..."}
        />
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button onClick={importResume} disabled={busy || raw.length < 200 || !aiReady} className="btn-primary">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
            {busy ? "Reading your resume…" : "Read my resume"}
          </button>
          <button onClick={() => setMode("edit")} className="btn-ghost">Fill it in by hand</button>
          {!aiReady && <span className="text-sm text-rose">AI import needs ANTHROPIC_API_KEY on the server.</span>}
        </div>
        <p className="mt-4 text-xs text-slate">Importing is free and does not use a credit.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Section title="Basics">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name" missing={miss(data.name)} value={data.name ?? ""} onChange={(v) => update((d) => ({ ...d, name: v }))} />
          <Field label="Headline" missing={miss(data.headline)} value={data.headline ?? ""} onChange={(v) => update((d) => ({ ...d, headline: v }))} placeholder="AI Engineer with 1 year of GenAI experience" />
          <Field label="Email" missing={miss(data.contact?.email)} value={data.contact?.email ?? ""} onChange={(v) => update((d) => ({ ...d, contact: { ...d.contact, email: v } }))} />
          <Field label="Phone" missing={miss(data.contact?.phone)} value={data.contact?.phone ?? ""} onChange={(v) => update((d) => ({ ...d, contact: { ...d.contact, phone: v } }))} />
          <Field label="Location" missing={miss(data.contact?.location)} value={data.contact?.location ?? ""} onChange={(v) => update((d) => ({ ...d, contact: { ...d.contact, location: v } }))} />
          <Field label="Links (comma separated)" missing={miss(data.contact?.links)} value={(data.contact?.links ?? []).join(", ")} onChange={(v) => update((d) => ({ ...d, contact: { ...d.contact, links: v.split(",").map((s) => s.trim()).filter(Boolean) } }))} placeholder="linkedin.com/in/you, github.com/you" />
        </div>
        <Area label="Summary" missing={miss(data.summary)} value={data.summary ?? ""} rows={3} onChange={(v) => update((d) => ({ ...d, summary: v }))} />
      </Section>

      <Section
        title="Experience"
        missing={miss(data.experience) && miss(data.projects)}
        emptyHint="Add at least one role or project. Internships and freelance work count."
        onAdd={() => update((d) => ({ ...d, experience: [...d.experience, { company: "", title: "", start: "", end: "", bullets: [] }] }))}
      >
        <AnimatePresence initial={false}>
          {data.experience.map((e, i) => (
            <Item key={i} onRemove={() => update((d) => ({ ...d, experience: d.experience.filter((_, n) => n !== i) }))}>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Job title" value={e.title} onChange={(v) => update((d) => { d.experience[i].title = v; return d; })} />
                <Field label="Company" value={e.company} onChange={(v) => update((d) => { d.experience[i].company = v; return d; })} />
                <Field label="Start" value={e.start ?? ""} onChange={(v) => update((d) => { d.experience[i].start = v; return d; })} placeholder="Jun 2025" />
                <Field label="End" value={e.end ?? ""} onChange={(v) => update((d) => { d.experience[i].end = v; return d; })} placeholder="Present" />
              </div>
              <Area label="What you did (one point per line, include numbers where you have them)" rows={4} value={e.bullets.join("\n")} onChange={(v) => update((d) => { d.experience[i].bullets = lines(v); return d; })} />
            </Item>
          ))}
        </AnimatePresence>
      </Section>

      <Section title="Projects" onAdd={() => update((d) => ({ ...d, projects: [...d.projects, { name: "", tech: [], bullets: [] }] }))}>
        <AnimatePresence initial={false}>
          {data.projects.map((p, i) => (
            <Item key={i} onRemove={() => update((d) => ({ ...d, projects: d.projects.filter((_, n) => n !== i) }))}>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Project name" value={p.name} onChange={(v) => update((d) => { d.projects[i].name = v; return d; })} />
                <Field label="Tech used (comma separated)" value={(p.tech ?? []).join(", ")} onChange={(v) => update((d) => { d.projects[i].tech = v.split(",").map((s) => s.trim()).filter(Boolean); return d; })} />
              </div>
              <Area label="Details (one point per line)" rows={3} value={p.bullets.join("\n")} onChange={(v) => update((d) => { d.projects[i].bullets = lines(v); return d; })} />
            </Item>
          ))}
        </AnimatePresence>
      </Section>

      <Section title="Education" missing={miss(data.education)} emptyHint="Add your degree or diploma." onAdd={() => update((d) => ({ ...d, education: [...d.education, { school: "", degree: "" }] }))}>
        <AnimatePresence initial={false}>
          {data.education.map((ed, i) => (
            <Item key={i} onRemove={() => update((d) => ({ ...d, education: d.education.filter((_, n) => n !== i) }))}>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="School" value={ed.school} onChange={(v) => update((d) => { d.education[i].school = v; return d; })} />
                <Field label="Degree" value={ed.degree} onChange={(v) => update((d) => { d.education[i].degree = v; return d; })} />
                <Field label="Years" value={[ed.start, ed.end].filter(Boolean).join(" to ")} onChange={(v) => update((d) => { const [s, e] = v.split(/\s+to\s+/); d.education[i].start = s; d.education[i].end = e; return d; })} placeholder="2022 to 2026" />
                <Field label="Score" value={ed.score ?? ""} onChange={(v) => update((d) => { d.education[i].score = v; return d; })} placeholder="CGPA 8.66" />
              </div>
            </Item>
          ))}
        </AnimatePresence>
      </Section>

      <Section title="Skills" missing={miss(data.skills)} emptyHint="Add your tools and skills so we can match you to jobs." onAdd={() => update((d) => ({ ...d, skills: [...d.skills, { group: "", items: [] }] }))}>
        {data.skills.map((s, i) => (
          <Item key={i} onRemove={() => update((d) => ({ ...d, skills: d.skills.filter((_, n) => n !== i) }))}>
            <div className="grid gap-3 sm:grid-cols-[200px_1fr]">
              <Field label="Group" value={s.group} onChange={(v) => update((d) => { d.skills[i].group = v; return d; })} placeholder="Languages" />
              <Field label="Skills (comma separated)" value={s.items.join(", ")} onChange={(v) => update((d) => { d.skills[i].items = v.split(",").map((x) => x.trim()).filter(Boolean); return d; })} />
            </div>
          </Item>
        ))}
      </Section>

      <Section title="Achievements">
        <Area label="One per line" rows={4} value={data.achievements.join("\n")} onChange={(v) => update((d) => ({ ...d, achievements: lines(v) }))} />
      </Section>

      <Section title="Application details">
        <p className="-mt-2 text-sm text-slate">Job forms ask for these. We use them for one click autofill and never show them to anyone else.</p>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Phone for applications" missing={miss(details.phone)} value={details.phone ?? ""} onChange={(v) => setDetail("phone", v)} inputMode="tel" />
          <Field label="City" missing={miss(details.city)} value={details.city ?? ""} onChange={(v) => setDetail("city", v)} />
          <Field label="State" value={details.state ?? ""} onChange={(v) => setDetail("state", v)} />
          <Field label="PIN code" value={details.pinCode ?? ""} onChange={(v) => setDetail("pinCode", v.replace(/[^0-9]/g, "").slice(0, 6))} inputMode="numeric" />
          <Field label="LinkedIn URL" missing={miss(details.linkedinUrl)} value={details.linkedinUrl ?? ""} onChange={(v) => setDetail("linkedinUrl", v)} placeholder="linkedin.com/in/you" />
          <Field label="GitHub URL" value={details.githubUrl ?? ""} onChange={(v) => setDetail("githubUrl", v)} placeholder="github.com/you" />
          <Field label="Portfolio URL" value={details.portfolioUrl ?? ""} onChange={(v) => setDetail("portfolioUrl", v)} />
          <NumberField label="Total experience (years)" missing={miss(details.totalExperienceYears)} value={details.totalExperienceYears} onChange={(v) => setDetail("totalExperienceYears", v)} step={0.5} />
          <NumberField label="Current CTC (LPA)" value={details.currentCtcLpa} onChange={(v) => setDetail("currentCtcLpa", v)} step={0.1} />
          <NumberField label="Expected CTC (LPA)" missing={miss(details.expectedCtcLpa)} value={details.expectedCtcLpa} onChange={(v) => setDetail("expectedCtcLpa", v)} step={0.1} />
          <Select label="Notice period" missing={miss(details.noticePeriod)} value={details.noticePeriod ?? ""} onChange={(v) => setDetail("noticePeriod", (v || undefined) as ApplicationDetails["noticePeriod"])} options={[["", "Choose"], ...NOTICE_PERIODS.map((n) => [n, NOTICE_LABEL[n]] as [string, string])]} />
          <Field label="Earliest start date" value={details.earliestStartDate ?? ""} onChange={(v) => setDetail("earliestStartDate", v)} type="date" />
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <YesNo label="Authorised to work in India" value={details.authorisedToWorkInIndia} onChange={(v) => setDetail("authorisedToWorkInIndia", v)} />
          <YesNo label="Need visa sponsorship abroad" value={details.needsVisaSponsorship} onChange={(v) => setDetail("needsVisaSponsorship", v)} />
          <YesNo label="Willing to relocate" value={details.willingToRelocate} onChange={(v) => setDetail("willingToRelocate", v)} />
        </div>
        <details className="rounded-xl bg-paper p-4">
          <summary className="cursor-pointer text-sm font-medium text-ink">Optional: diversity questions</summary>
          <p className="mt-2 text-sm text-slate">Some employers ask these. Leave them as &ldquo;Prefer not to say&rdquo; if you like; we only fill what you choose.</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <Select label="Gender" value={details.gender} onChange={(v) => setDetail("gender", v as ApplicationDetails["gender"])} options={GENDER_OPTIONS.map((g) => [g, g] as [string, string])} />
            <Select label="Disability" value={details.disability} onChange={(v) => setDetail("disability", v as ApplicationDetails["disability"])} options={YES_NO_PREFER.map((g) => [g, g] as [string, string])} />
            <Select label="Veteran status" value={details.veteran} onChange={(v) => setDetail("veteran", v as ApplicationDetails["veteran"])} options={YES_NO_PREFER.map((g) => [g, g] as [string, string])} />
          </div>
        </details>
      </Section>

      <div className="sticky bottom-4 z-10 flex items-center justify-between gap-3 rounded-2xl border border-line bg-white/95 p-3 pl-5 shadow-lg backdrop-blur">
        <p className="text-sm text-slate">{dirty ? "You have unsaved changes" : "All changes saved"}</p>
        <div className="flex gap-2">
          <button onClick={() => (onImportAgain ? onImportAgain() : setMode("import"))} className="btn-ghost btn-sm">Import again</button>
          <button onClick={save} disabled={busy} className="btn-primary btn-sm">
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}{saveLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function Section({ title, onAdd, children, missing, emptyHint }: {
  title: string; onAdd?: () => void; children: React.ReactNode; missing?: boolean; emptyHint?: string;
}) {
  return (
    <section className={cn("panel p-6", missing && "ring-2 ring-marigold/60")}>
      {missing && emptyHint && <p className="mb-3 rounded-lg bg-marigold-tint px-3 py-2 text-sm text-ink">{emptyHint}</p>}
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-semibold">{title}</h2>
        {onAdd && (
          <button onClick={onAdd} className="btn-ghost btn-sm"><Plus className="h-4 w-4" />Add</button>
        )}
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function Item({ children, onRemove }: { children: React.ReactNode; onRemove: () => void }) {
  return (
    <motion.div layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }} className="relative rounded-xl bg-paper p-4 pr-12">
      <button onClick={onRemove} className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-lg text-slate hover:bg-white hover:text-rose" aria-label="Remove">
        <Trash2 className="h-4 w-4" />
      </button>
      <div className="space-y-3">{children}</div>
    </motion.div>
  );
}

const missingCls = "border-marigold ring-2 ring-marigold/30";
function MissingNote({ show }: { show?: boolean }) {
  return show ? <span className="mt-1 block text-xs text-marigold-deep">We could not find this. Add it if you have it.</span> : null;
}

function Field({ label, value, onChange, placeholder, missing, type = "text", inputMode }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; missing?: boolean;
  type?: string; inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
}) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      <input className={cn("field", missing && !value && missingCls)} type={type} inputMode={inputMode} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      <MissingNote show={missing && !value} />
    </label>
  );
}

function NumberField({ label, value, onChange, step = 1, missing }: {
  label: string; value?: number; onChange: (v: number | undefined) => void; step?: number; missing?: boolean;
}) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      <input
        className={cn("field", missing && value === undefined && missingCls)}
        type="number" inputMode="decimal" min={0} step={step}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value === "" || Number.isNaN(Number(e.target.value)) ? undefined : Number(e.target.value))}
      />
      <MissingNote show={missing && value === undefined} />
    </label>
  );
}

function Select({ label, value, onChange, options, missing }: {
  label: string; value: string; onChange: (v: string) => void; options: [string, string][]; missing?: boolean;
}) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      <select className={cn("field", missing && !value && missingCls)} value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
      <MissingNote show={missing && !value} />
    </label>
  );
}

function YesNo({ label, value, onChange }: { label: string; value?: boolean; onChange: (v: boolean | undefined) => void }) {
  return (
    <fieldset>
      <legend className="label">{label}</legend>
      <div className="flex gap-2">
        {([["Yes", true], ["No", false]] as const).map(([l, v]) => (
          <button key={l} type="button" className="chip" data-on={value === v} aria-pressed={value === v} onClick={() => onChange(value === v ? undefined : v)}>{l}</button>
        ))}
      </div>
    </fieldset>
  );
}

function Area({ label, value, onChange, rows = 3, missing }: {
  label: string; value: string; onChange: (v: string) => void; rows?: number; missing?: boolean;
}) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      <textarea className={cn("field", missing && !value && missingCls)} rows={rows} value={value} onChange={(e) => onChange(e.target.value)} />
      <MissingNote show={missing && !value} />
    </label>
  );
}

/** Drop empty strings so optional URL and PIN validators do not reject blank fields. */
function cleanDetails(d: ApplicationDetails): ApplicationDetails {
  return Object.fromEntries(Object.entries(d).filter(([, v]) => v !== "" && v !== null)) as ApplicationDetails;
}
