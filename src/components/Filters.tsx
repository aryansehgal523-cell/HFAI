"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Search, MapPin, SlidersHorizontal, X, Loader2 } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { AutocompleteInput } from "./AutocompleteInput";
import { cn } from "@/lib/utils";

const MODES = [["REMOTE", "Remote"], ["HYBRID", "Hybrid"], ["ONSITE", "On site"]] as const;
const EXP = [["0-1", "Fresher"], ["1-3", "1 to 3 yrs"], ["3-5", "3 to 5 yrs"], ["5-8", "5 to 8 yrs"], ["8+", "8+ yrs"]] as const;
const POSTED = [["1", "24 hours"], ["3", "3 days"], ["7", "Week"], ["30", "Month"]] as const;

/**
 * Job search box with autocomplete on both fields. On the jobs page it keeps the
 * current filters; elsewhere (hero) pass target="/jobs".
 */
export function SearchBar({ target, hero }: { target?: string; hero?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [q, setQ] = useState(sp.get("q") ?? "");
  const [loc, setLoc] = useState(sp.get("location") ?? "");
  const [pending, start] = useTransition();

  function go(nextQ = q, nextLoc = loc) {
    const next = new URLSearchParams(target ? "" : sp.toString());
    nextQ ? next.set("q", nextQ) : next.delete("q");
    nextLoc ? next.set("location", nextLoc) : next.delete("location");
    next.delete("page");
    start(() => router.push(`${target ?? pathname}?${next.toString()}`));
  }

  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        go();
      }}
      className={cn(
        "flex flex-col gap-2 rounded-2xl border border-line bg-white p-2 sm:flex-row sm:items-center",
        hero && "max-w-xl shadow-[0_16px_40px_-24px_rgba(0,0,0,0.35)]",
      )}
    >
      <AutocompleteInput
        className="flex-1"
        field="q"
        label="Role, skill or company"
        placeholder={hero ? "Role or skill" : "Role, skill or company"}
        value={q}
        onChange={setQ}
        onPick={(v) => go(v, loc)}
        icon={<Search className="h-4 w-4 shrink-0 text-slate" aria-hidden />}
      />
      <span className="hidden h-6 w-px bg-line sm:block" />
      <AutocompleteInput
        className={hero ? "sm:w-48" : "sm:w-56"}
        field="location"
        label="Location"
        placeholder={hero ? "City or remote" : "City"}
        value={loc}
        onChange={setLoc}
        onPick={(v) => go(q, v)}
        icon={<MapPin className="h-4 w-4 shrink-0 text-slate" aria-hidden />}
      />
      <button className="btn-primary min-w-28" aria-label="Search jobs">
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : hero ? "Search jobs" : "Search"}
      </button>
    </form>
  );
}

export function Filters() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [open, setOpen] = useState(false);
  const [, start] = useTransition();

  useEffect(() => setOpen(false), [sp]);

  const modes = (sp.get("mode") ?? "").split(",").filter(Boolean);

  function set(key: string, value: string | null) {
    const next = new URLSearchParams(sp.toString());
    value ? next.set(key, value) : next.delete(key);
    next.delete("page");
    start(() => router.push(`${pathname}?${next.toString()}`, { scroll: false }));
  }
  const toggleMode = (m: string) => {
    const nextModes = modes.includes(m) ? modes.filter((x) => x !== m) : [...modes, m];
    set("mode", nextModes.length ? nextModes.join(",") : null);
  };
  const activeCount = ["mode", "exp", "posted", "salary", "ghost"].filter((k) => sp.get(k)).length;

  const body = (
    <div className="space-y-7">
      <Group title="Work setting">
        {MODES.map(([v, l]) => (
          <button key={v} data-on={modes.includes(v)} onClick={() => toggleMode(v)} className="chip">{l}</button>
        ))}
      </Group>
      <Group title="Experience">
        {EXP.map(([v, l]) => (
          <button key={v} data-on={sp.get("exp") === v} onClick={() => set("exp", sp.get("exp") === v ? null : v)} className="chip">{l}</button>
        ))}
      </Group>
      <Group title="Posted in the last">
        {POSTED.map(([v, l]) => (
          <button key={v} data-on={sp.get("posted") === v} onClick={() => set("posted", sp.get("posted") === v ? null : v)} className="chip">{l}</button>
        ))}
      </Group>
      <div className="space-y-3">
        <Toggle label="Only jobs that show salary" on={sp.get("salary") === "with"} onChange={(on) => set("salary", on ? "with" : null)} />
        <Toggle label="Include possible ghost jobs" on={sp.get("ghost") === "1"} onChange={(on) => set("ghost", on ? "1" : null)} />
      </div>
      {activeCount > 0 && (
        <button onClick={() => start(() => router.push(`${pathname}${sp.get("q") ? `?q=${encodeURIComponent(sp.get("q")!)}` : ""}`))} className="text-sm font-medium text-cobalt hover:underline">
          Clear filters
        </button>
      )}
    </div>
  );

  return (
    <>
      <button onClick={() => setOpen(true)} className="btn-ghost btn-sm lg:hidden">
        <SlidersHorizontal className="h-4 w-4" /> Filters{activeCount ? ` (${activeCount})` : ""}
      </button>
      <aside className="hidden lg:block">{body}</aside>
      <AnimatePresence>
        {open && (
          <motion.div className="fixed inset-0 z-50 lg:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="absolute inset-0 bg-ink/40" onClick={() => setOpen(false)} />
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", stiffness: 380, damping: 38 }}
              className="absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto rounded-t-3xl bg-paper p-6"
            >
              <div className="mb-6 flex items-center justify-between">
                <h2 className="text-xl font-semibold">Filters</h2>
                <button onClick={() => setOpen(false)} aria-label="Close filters" className="grid h-9 w-9 place-items-center rounded-full border border-line bg-white"><X className="h-4 w-4" /></button>
              </div>
              {body}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset>
      <legend className="mb-3 text-sm font-semibold text-ink">{title}</legend>
      <div className="flex flex-wrap gap-2">{children}</div>
    </fieldset>
  );
}

function Toggle({ label, on, onChange }: { label: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 text-sm text-ink">
      {label}
      <button
        type="button"
        role="switch"
        aria-checked={on}
        onClick={() => onChange(!on)}
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${on ? "bg-cobalt" : "bg-line"}`}
      >
        <motion.span layout transition={{ type: "spring", stiffness: 600, damping: 35 }} className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow ${on ? "right-1" : "left-1"}`} />
      </button>
    </label>
  );
}
