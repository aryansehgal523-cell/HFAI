"use client";
import Link from "next/link";
import { useState } from "react";
import { AnimatePresence, LayoutGroup, motion } from "framer-motion";
import { FileText, Trash2 } from "lucide-react";
import { CompanyAvatar } from "./CompanyAvatar";
import { useToast } from "./Toast";
import { timeAgo } from "@/lib/utils";

type Status = "SAVED" | "APPLIED" | "INTERVIEWING" | "OFFER" | "REJECTED";
export type TrackerItem = {
  id: string;
  jobId: string;
  status: Status;
  title: string;
  company: string;
  location: string;
  updatedAt: string;
  tailored: boolean;
  closed: boolean;
  /** Latest referral request status for this job, if any. */
  referral?: string | null;
};
const REFERRAL_LABEL: Record<string, string> = {
  drafted: "Referral drafted", sent: "Referral asked", replied: "Contact replied", referred: "Referred", declined: "Referral declined", no_response: "No reply to referral",
};

const COLUMNS: { key: Status; label: string; dot: string }[] = [
  { key: "SAVED", label: "Saved", dot: "bg-slate-light" },
  { key: "APPLIED", label: "Applied", dot: "bg-cobalt" },
  { key: "INTERVIEWING", label: "Interviewing", dot: "bg-marigold" },
  { key: "OFFER", label: "Offer", dot: "bg-mint" },
  { key: "REJECTED", label: "Closed", dot: "bg-rose" },
];

export function Tracker({ initial }: { initial: TrackerItem[] }) {
  const [items, setItems] = useState(initial);
  const toast = useToast();

  async function move(id: string, status: Status) {
    const prev = items;
    setItems((xs) => xs.map((x) => (x.id === id ? { ...x, status } : x)));
    const res = await fetch(`/api/applications/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
    if (!res.ok) {
      setItems(prev);
      toast("Could not move that job", "error");
    }
  }
  async function remove(id: string) {
    const prev = items;
    setItems((xs) => xs.filter((x) => x.id !== id));
    const res = await fetch(`/api/applications/${id}`, { method: "DELETE" });
    if (!res.ok) setItems(prev);
  }

  if (items.length === 0) {
    return (
      <div className="panel p-10 text-center">
        <p className="font-display text-2xl font-semibold">Nothing tracked yet</p>
        <p className="mt-2 text-slate">Save jobs while you search and they will show up here, ready to tailor and apply.</p>
        <Link href="/jobs" className="btn-primary mt-6">Find jobs</Link>
      </div>
    );
  }

  return (
    <LayoutGroup>
      <div className="-mx-4 flex snap-x gap-4 overflow-x-auto px-4 pb-4 lg:mx-0 lg:grid lg:grid-cols-5 lg:overflow-visible lg:px-0">
        {COLUMNS.map((col) => {
          const list = items.filter((i) => i.status === col.key);
          return (
            <section key={col.key} className="w-[78vw] max-w-xs shrink-0 snap-start sm:w-72 lg:w-auto">
              <h2 className="mb-3 flex items-center gap-2 font-sans text-sm font-semibold tracking-normal">
                <span className={`h-2 w-2 rounded-full ${col.dot}`} />
                {col.label}
                <span className="font-normal text-slate">{list.length}</span>
              </h2>
              <div className="min-h-24 space-y-3 rounded-2xl bg-white/50 p-2 ring-1 ring-line">
                <AnimatePresence>
                  {list.map((it) => (
                    <motion.div
                      key={it.id}
                      layoutId={it.id}
                      initial={{ opacity: 0, scale: 0.96 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.96 }}
                      transition={{ type: "spring", stiffness: 420, damping: 34 }}
                      className="rounded-xl border border-line bg-white p-3.5"
                    >
                      <div className="flex gap-3">
                        <CompanyAvatar name={it.company} className="h-9 w-9 text-base" />
                        <div className="min-w-0">
                          <Link href={`/jobs/${it.jobId}`} className="line-clamp-2 text-[14.5px] font-medium leading-snug hover:text-cobalt">{it.title}</Link>
                          <p className="truncate text-xs text-slate">{it.company}</p>
                        </div>
                      </div>
                      {it.closed && <p className="mt-2 text-xs text-rose">Listing removed by the company</p>}
                      {it.referral && (
                        <Link href="/referrals" className={`mt-2 inline-block rounded-md px-2 py-0.5 text-xs ${it.referral === "referred" ? "bg-mint-tint text-mint-ink" : "bg-cobalt-tint text-ink"}`}>
                          {REFERRAL_LABEL[it.referral] ?? it.referral}
                        </Link>
                      )}
                      <div className="mt-3 flex items-center gap-1.5">
                        <select
                          aria-label="Move to"
                          value={it.status}
                          onChange={(e) => move(it.id, e.target.value as Status)}
                          className="min-w-0 flex-1 rounded-lg border border-line bg-paper px-2 py-1 text-xs"
                        >
                          {COLUMNS.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
                        </select>
                        <Link href={`/tailor/${it.jobId}`} title={it.tailored ? "Open tailored resume" : "Tailor resume"} className={`grid h-7 w-7 place-items-center rounded-lg ${it.tailored ? "bg-mint-tint text-mint-ink" : "bg-paper text-slate hover:text-ink"}`}>
                          <FileText className="h-3.5 w-3.5" />
                        </Link>
                        <button onClick={() => remove(it.id)} className="grid h-7 w-7 place-items-center rounded-lg bg-paper text-slate hover:text-rose" aria-label="Remove from tracker">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <p className="mt-2 text-[11px] text-slate-light">Updated {timeAgo(it.updatedAt)}</p>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </section>
          );
        })}
      </div>
    </LayoutGroup>
  );
}
