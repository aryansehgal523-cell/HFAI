"use client";
import { useEffect, useId, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Briefcase, Building2, MapPin, Sparkles } from "lucide-react";
import type { Suggestion } from "@/app/api/jobs/suggest/route";
import { cn } from "@/lib/utils";

const ICON = { title: Briefcase, company: Building2, skill: Sparkles, location: MapPin };
const KIND = { title: "Role", company: "Company", skill: "Skill", location: "Location" };

/**
 * Accessible combobox (WAI-ARIA 1.2 pattern): arrow keys move through suggestions,
 * Enter picks one, Escape closes. Suggestions are debounced and cached per query.
 */
export function AutocompleteInput({
  value,
  onChange,
  onPick,
  field,
  placeholder,
  label,
  icon,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  onPick: (v: string) => void;
  field: "q" | "location";
  placeholder: string;
  label: string;
  icon: React.ReactNode;
  className?: string;
}) {
  const id = useId();
  const [items, setItems] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const cache = useRef(new Map<string, Suggestion[]>());
  const typed = useRef(false);

  useEffect(() => {
    if (!typed.current) return;
    const q = value.trim();
    if (q.length < 2) {
      setItems([]);
      return;
    }
    const key = `${field}:${q.toLowerCase()}`;
    if (cache.current.has(key)) {
      setItems(cache.current.get(key)!);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/jobs/suggest?field=${field}&q=${encodeURIComponent(q)}`, { signal: ctrl.signal });
        if (!res.ok) return;
        const { suggestions } = (await res.json()) as { suggestions: Suggestion[] };
        cache.current.set(key, suggestions);
        setItems(suggestions);
        setActive(-1);
      } catch {}
    }, 150);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [value, field]);

  const show = open && items.length > 0;

  function pick(s: Suggestion) {
    typed.current = false;
    onChange(s.label);
    setOpen(false);
    onPick(s.label);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!show) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => (a + 1) % items.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => (a <= 0 ? items.length - 1 : a - 1));
    } else if (e.key === "Enter" && active >= 0) {
      e.preventDefault();
      pick(items[active]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div className={cn("relative", className)}>
      <label className="flex items-center gap-2 px-3">
        {icon}
        <span className="sr-only">{label}</span>
        <input
          role="combobox"
          aria-expanded={show}
          aria-controls={`${id}-list`}
          aria-autocomplete="list"
          aria-activedescendant={active >= 0 ? `${id}-opt-${active}` : undefined}
          autoComplete="off"
          value={value}
          placeholder={placeholder}
          onChange={(e) => {
            typed.current = true;
            onChange(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={onKeyDown}
          className="w-full bg-transparent py-2.5 text-[15px] text-ink outline-none placeholder:text-slate-light"
        />
      </label>
      <AnimatePresence>
        {show && (
          <motion.ul
            id={`${id}-list`}
            role="listbox"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.12 }}
            className="absolute left-0 right-0 top-full z-50 mt-3 min-w-[260px] overflow-hidden rounded-xl border border-line bg-white p-1.5 shadow-xl shadow-black/10"
          >
            {items.map((s, i) => {
              const Icon = ICON[s.type];
              return (
                <li
                  key={`${s.type}-${s.label}`}
                  id={`${id}-opt-${i}`}
                  role="option"
                  aria-selected={i === active}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(s)}
                  onMouseEnter={() => setActive(i)}
                  className={cn("flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm", i === active ? "bg-paper" : "")}
                >
                  <Icon className="h-4 w-4 shrink-0 text-slate" aria-hidden />
                  <span className="min-w-0 flex-1 truncate text-ink">{s.label}</span>
                  <span className="shrink-0 text-xs text-slate">{s.count ? `${s.count} ${s.count === 1 ? "job" : "jobs"}` : KIND[s.type]}</span>
                </li>
              );
            })}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}
