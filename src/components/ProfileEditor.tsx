"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { FileText, Loader2, Plus, Trash2, Wand2 } from "lucide-react";
import type { ResumeData } from "@/db/schema";
import { useToast } from "./Toast";

const EMPTY: ResumeData = { experience: [], projects: [], education: [], skills: [], achievements: [] };

const lines = (s: string) => s.split("\n").map((l) => l.replace(/^[•\-*]\s*/, "").trim()).filter(Boolean);

export function ProfileEditor({ initial, aiReady, next }: { initial: ResumeData | null; aiReady: boolean; next?: string }) {
  const router = useRouter();
  const toast = useToast();
  const [data, setData] = useState<ResumeData>(initial ?? EMPTY);
  const [mode, setMode] = useState<"import" | "edit">(initial ? "edit" : "import");
  const [raw, setRaw] = useState("");
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);

  const update = (fn: (d: ResumeData) => ResumeData) => {
    setData((d) => fn(structuredClone(d)));
    setDirty(true);
  };

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
      body: JSON.stringify({ headline: data.headline, location: data.contact?.location, phone: data.contact?.phone, data }),
    });
    setBusy(false);
    if (!res.ok) return toast("Could not save. Try again.", "error");
    setDirty(false);
    toast("Master resume saved");
    if (next) router.push(next);
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
          <Field label="Full name" value={data.name ?? ""} onChange={(v) => update((d) => ({ ...d, name: v }))} />
          <Field label="Headline" value={data.headline ?? ""} onChange={(v) => update((d) => ({ ...d, headline: v }))} placeholder="AI Engineer with 1 year of GenAI experience" />
          <Field label="Email" value={data.contact?.email ?? ""} onChange={(v) => update((d) => ({ ...d, contact: { ...d.contact, email: v } }))} />
          <Field label="Phone" value={data.contact?.phone ?? ""} onChange={(v) => update((d) => ({ ...d, contact: { ...d.contact, phone: v } }))} />
          <Field label="Location" value={data.contact?.location ?? ""} onChange={(v) => update((d) => ({ ...d, contact: { ...d.contact, location: v } }))} />
          <Field label="Links (comma separated)" value={(data.contact?.links ?? []).join(", ")} onChange={(v) => update((d) => ({ ...d, contact: { ...d.contact, links: v.split(",").map((s) => s.trim()).filter(Boolean) } }))} placeholder="linkedin.com/in/you, github.com/you" />
        </div>
        <Area label="Summary" value={data.summary ?? ""} rows={3} onChange={(v) => update((d) => ({ ...d, summary: v }))} />
      </Section>

      <Section
        title="Experience"
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

      <Section title="Education" onAdd={() => update((d) => ({ ...d, education: [...d.education, { school: "", degree: "" }] }))}>
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

      <Section title="Skills" onAdd={() => update((d) => ({ ...d, skills: [...d.skills, { group: "", items: [] }] }))}>
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

      <div className="sticky bottom-4 z-10 flex items-center justify-between gap-3 rounded-2xl border border-line bg-white/95 p-3 pl-5 shadow-lg backdrop-blur">
        <p className="text-sm text-slate">{dirty ? "You have unsaved changes" : "All changes saved"}</p>
        <div className="flex gap-2">
          <button onClick={() => setMode("import")} className="btn-ghost btn-sm">Import again</button>
          <button onClick={save} disabled={busy} className="btn-primary btn-sm">
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}Save master resume
          </button>
        </div>
      </div>
    </div>
  );
}

function Section({ title, onAdd, children }: { title: string; onAdd?: () => void; children: React.ReactNode }) {
  return (
    <section className="panel p-6">
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

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      <input className="field" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

function Area({ label, value, onChange, rows = 3 }: { label: string; value: string; onChange: (v: string) => void; rows?: number }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      <textarea className="field" rows={rows} value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}
