"use client";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { TagInput } from "./TagInput";
import { useToast } from "./Toast";
import {
  EMPTY_PREFERENCES, NOTICE_LABEL, NOTICE_PERIODS, PREF_COMPANY_TYPES, PREF_COMPANY_TYPE_LABEL, WORK_MODES, WORK_MODE_LABEL, type JobPreferences,
} from "@/lib/profile-fields";

const num = (v: string) => (v.trim() === "" || Number.isNaN(Number(v)) ? undefined : Number(v));

/** Target roles, cities, work mode, experience, salary and notice period. */
export function PreferencesForm({
  initial,
  suggestedYears,
  onSaved,
  submitLabel = "Save preferences",
  secondary,
}: {
  initial: JobPreferences | null;
  suggestedYears?: number;
  onSaved?: (p: JobPreferences) => void;
  submitLabel?: string;
  secondary?: React.ReactNode;
}) {
  const toast = useToast();
  const [p, setP] = useState<JobPreferences>({ ...EMPTY_PREFERENCES, experienceYears: suggestedYears, ...(initial ?? {}) });
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof JobPreferences>(k: K, v: JobPreferences[K]) => setP((x) => ({ ...x, [k]: v }));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (p.targetRoles.length === 0) return toast("Add at least one role you want, like “Data Analyst”.", "error");
    setBusy(true);
    const res = await fetch("/api/profile/preferences", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(p) });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return toast(json.error ?? "Could not save your preferences. Try again.", "error");
    toast("Preferences saved");
    onSaved?.(json.preferences);
  }

  return (
    <form onSubmit={save} className="space-y-6">
      <TagInput label="Roles you want" values={p.targetRoles} onChange={(v) => set("targetRoles", v)} max={5} suggest="title" placeholder="Data Analyst, Backend Engineer…" />
      <TagInput label="Preferred cities" values={p.cities} onChange={(v) => set("cities", v)} max={10} suggest="location" placeholder="Bengaluru, Pune, Remote…" hint="Leave empty if any city works." />

      <fieldset>
        <legend className="label">Work mode</legend>
        <div className="flex flex-wrap gap-2">
          {WORK_MODES.map((m) => {
            const on = p.workModes.includes(m);
            return (
              <button
                key={m}
                type="button"
                className="chip"
                data-on={on}
                aria-pressed={on}
                onClick={() => set("workModes", on ? p.workModes.filter((x) => x !== m) : [...p.workModes, m])}
              >
                {WORK_MODE_LABEL[m]}
              </button>
            );
          })}
        </div>
        <p className="mt-1.5 text-xs text-slate">Pick all that suit you.</p>
      </fieldset>

      <fieldset>
        <legend className="label">Kind of company</legend>
        <label className="mb-3 flex cursor-pointer items-center gap-2.5 text-sm text-ink">
          <input type="checkbox" className="h-4 w-4 accent-[#3346F2]" checked={Boolean(p.mncOnly)} onChange={(e) => set("mncOnly", e.target.checked)} />
          Only MNCs (multinationals with 5,000+ people)
        </label>
        <div className="flex flex-wrap gap-2">
          {PREF_COMPANY_TYPES.map((t) => {
            const types = p.companyTypes ?? [];
            const on = types.includes(t);
            return (
              <button
                key={t}
                type="button"
                className="chip"
                data-on={on}
                aria-pressed={on}
                onClick={() => set("companyTypes", on ? types.filter((x) => x !== t) : [...types, t])}
              >
                {PREF_COMPANY_TYPE_LABEL[t]}
              </button>
            );
          })}
        </div>
        <p className="mt-1.5 text-xs text-slate">Leave empty to match jobs at any company.</p>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-3">
        <label className="block">
          <span className="label">Years of experience</span>
          <input className="field" type="number" inputMode="decimal" min={0} max={60} step={0.5} value={p.experienceYears ?? ""} onChange={(e) => set("experienceYears", num(e.target.value))} />
        </label>
        <label className="block">
          <span className="label">Expected salary (LPA)</span>
          <input className="field" type="number" inputMode="decimal" min={0} max={1000} step={0.5} value={p.expectedSalaryLpa ?? ""} onChange={(e) => set("expectedSalaryLpa", num(e.target.value))} placeholder="12" />
        </label>
        <label className="block">
          <span className="label">Notice period</span>
          <select className="field" value={p.noticePeriod ?? ""} onChange={(e) => set("noticePeriod", (e.target.value || undefined) as JobPreferences["noticePeriod"])}>
            <option value="">Choose</option>
            {NOTICE_PERIODS.map((n) => <option key={n} value={n}>{NOTICE_LABEL[n]}</option>)}
          </select>
        </label>
      </div>

      <fieldset>
        <legend className="label">Open to relocating?</legend>
        <div className="flex gap-2">
          {[["Yes", true], ["No", false]].map(([l, v]) => (
            <button key={String(l)} type="button" className="chip" data-on={p.openToRelocation === v} aria-pressed={p.openToRelocation === v} onClick={() => set("openToRelocation", v as boolean)}>
              {l as string}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="flex flex-wrap items-center gap-3 pt-2">
        <button type="submit" disabled={busy} className="btn-primary">
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}{submitLabel}
        </button>
        {secondary}
      </div>
    </form>
  );
}
