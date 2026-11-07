"use client";
import { useEffect, useId, useRef, useState } from "react";
import { X } from "lucide-react";
import type { Suggestion } from "@/app/api/jobs/suggest/route";
import { cn } from "@/lib/utils";

/**
 * A list of short values ("Data Analyst", "Bengaluru") typed or picked from suggestions.
 * Combobox keyboard pattern: arrows move, Enter or comma adds, Backspace on empty removes the last tag.
 */
export function TagInput({
  label,
  values,
  onChange,
  max,
  suggest,
  placeholder,
  hint,
}: {
  label: string;
  values: string[];
  onChange: (v: string[]) => void;
  max: number;
  suggest?: "title" | "location";
  placeholder?: string;
  hint?: string;
}) {
  const id = useId();
  const [text, setText] = useState("");
  const [items, setItems] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const cache = useRef(new Map<string, string[]>());
  const full = values.length >= max;

  useEffect(() => {
    const q = text.trim();
    if (!suggest || q.length < 2) return setItems([]);
    const key = `${suggest}:${q.toLowerCase()}`;
    if (cache.current.has(key)) return setItems(cache.current.get(key)!);
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const field = suggest === "location" ? "location" : "q";
        const res = await fetch(`/api/jobs/suggest?field=${field}&q=${encodeURIComponent(q)}`, { signal: ctrl.signal });
        if (!res.ok) return;
        const { suggestions } = (await res.json()) as { suggestions: Suggestion[] };
        const labels = suggestions.filter((s) => s.type === suggest).map((s) => s.label).slice(0, 6);
        cache.current.set(key, labels);
        setItems(labels);
        setActive(-1);
      } catch {}
    }, 150);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [text, suggest]);

  function add(v: string) {
    const clean = v.trim().replace(/,$/, "").slice(0, 80);
    if (!clean || full || values.some((x) => x.toLowerCase() === clean.toLowerCase())) return setText("");
    onChange([...values, clean]);
    setText("");
    setOpen(false);
  }

  const shown = open && items.length > 0 && !full;

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" && shown) { e.preventDefault(); setActive((a) => (a + 1) % items.length); }
    else if (e.key === "ArrowUp" && shown) { e.preventDefault(); setActive((a) => (a <= 0 ? items.length - 1 : a - 1)); }
    else if (e.key === "Enter" || e.key === ",") {
      if (shown && active >= 0) { e.preventDefault(); add(items[active]); }
      else if (text.trim()) { e.preventDefault(); add(text); }
    } else if (e.key === "Backspace" && !text && values.length) onChange(values.slice(0, -1));
    else if (e.key === "Escape") setOpen(false);
  }

  return (
    <div>
      <label htmlFor={`${id}-input`} className="label">{label}</label>
      <div className="relative">
        <div className="field flex min-h-[46px] flex-wrap items-center gap-1.5 py-1.5 focus-within:border-cobalt focus-within:ring-4 focus-within:ring-cobalt/10">
          {values.map((v) => (
            <span key={v} className="inline-flex items-center gap-1 rounded-full bg-cobalt-tint py-1 pl-3 pr-1 text-sm text-ink">
              {v}
              <button type="button" onClick={() => onChange(values.filter((x) => x !== v))} className="grid h-6 w-6 place-items-center rounded-full text-slate hover:bg-white hover:text-ink" aria-label={`Remove ${v}`}>
                <X className="h-3.5 w-3.5" />
              </button>
            </span>
          ))}
          <input
            id={`${id}-input`}
            role="combobox"
            aria-expanded={shown}
            aria-controls={`${id}-list`}
            aria-autocomplete="list"
            aria-activedescendant={active >= 0 ? `${id}-opt-${active}` : undefined}
            aria-describedby={`${id}-hint`}
            autoComplete="off"
            disabled={full}
            value={text}
            placeholder={full ? "" : placeholder}
            onChange={(e) => { setText(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => { setOpen(false); if (text.trim()) add(text); }, 120)}
            onKeyDown={onKeyDown}
            className="min-w-[8rem] flex-1 bg-transparent py-1 text-[15px] text-ink outline-none placeholder:text-slate-light disabled:cursor-not-allowed"
          />
        </div>
        {shown && (
          <ul id={`${id}-list`} role="listbox" className="absolute left-0 right-0 top-full z-50 mt-2 overflow-hidden rounded-xl border border-line bg-white p-1.5 shadow-xl shadow-black/10">
            {items.map((s, i) => (
              <li
                key={s}
                id={`${id}-opt-${i}`}
                role="option"
                aria-selected={i === active}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => add(s)}
                onMouseEnter={() => setActive(i)}
                className={cn("cursor-pointer rounded-lg px-3 py-2 text-sm text-ink", i === active && "bg-paper")}
              >
                {s}
              </li>
            ))}
          </ul>
        )}
      </div>
      <p id={`${id}-hint`} className="mt-1.5 text-xs text-slate">
        {full ? `That's the maximum of ${max}. Remove one to add another.` : hint ?? `Press Enter after each one. Up to ${max}.`}
      </p>
    </div>
  );
}
