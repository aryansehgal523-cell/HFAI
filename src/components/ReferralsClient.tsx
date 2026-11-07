"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, ExternalLink, FileUp, Loader2, Plus, Trash2, UserPlus } from "lucide-react";
import { useToast } from "./Toast";
import { CompanyAvatar } from "./CompanyAvatar";
import { cn, timeAgo } from "@/lib/utils";

const REL_OPTIONS = [["", "LinkedIn contact"], ["alumni", "Alumni"], ["ex_colleague", "Ex colleague"], ["friend", "Friend"], ["family", "Family"], ["other", "Other"]] as const;

// ─── Connect your network ────────────────────────────────────

export function ConnectNetwork({ hasNetwork }: { hasNetwork: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const linkedin = useRef<HTMLInputElement>(null);
  const alumni = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<null | "linkedin" | "alumni">(null);

  async function upload(file: File, kind: "linkedin" | "alumni") {
    setBusy(kind);
    const body = new FormData();
    body.append("file", file);
    body.append("kind", kind);
    const res = await fetch("/api/referrals/connections/import", { method: "POST", body });
    const json = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) return toast(json.error ?? "Could not read that file", "error");
    toast(`Imported ${json.imported.toLocaleString("en-IN")} ${json.imported === 1 ? "person" : "people"}${json.skipped ? `, skipped ${json.skipped} without a company` : ""}${json.truncated ? ". Only the first 30,000 rows were imported" : ""}.`);
    router.refresh();
  }

  const picker = (ref: React.RefObject<HTMLInputElement | null>, kind: "linkedin" | "alumni") => (
    <input ref={ref} type="file" accept=".csv,text/csv" className="sr-only" tabIndex={-1} aria-label={kind === "linkedin" ? "LinkedIn Connections.csv" : "Alumni sheet"}
      onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f, kind); e.target.value = ""; }} />
  );

  return (
    <section aria-labelledby="connect-title" className="panel p-6 sm:p-8">
      <h2 id="connect-title" className="text-2xl font-semibold">{hasNetwork ? "Update your network" : "Connect your network"}</h2>
      <p className="mt-1 max-w-2xl text-slate">LinkedIn lets you download your connections as a file. Upload it here and HireFlow shows who you know at every company you apply to. Your contacts stay private to you.</p>
      <ol className="mt-6 grid gap-3 text-[15px] sm:grid-cols-2 lg:grid-cols-3">
        {[
          <>On LinkedIn, open <strong>Me</strong>, then <strong>Settings and Privacy</strong>.</>,
          <>Go to <strong>Data privacy</strong>, then <strong>Get a copy of your data</strong>.</>,
          <>Choose <strong>Connections</strong> only and press <strong>Request archive</strong>.</>,
          <>LinkedIn emails you a link, usually within about 10 minutes.</>,
          <>Download the archive and open it. Find <strong>Connections.csv</strong>.</>,
          <>Upload that file below. You can upload a newer one any time.</>,
        ].map((step, i) => (
          <li key={i} className="flex gap-3 rounded-xl bg-paper p-4">
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-ink text-sm font-semibold text-white" aria-hidden>{i + 1}</span>
            <span className="text-ink-soft">{step}</span>
          </li>
        ))}
      </ol>
      <div className="mt-6 flex flex-wrap items-center gap-3">
        {picker(linkedin, "linkedin")}
        {picker(alumni, "alumni")}
        <button onClick={() => linkedin.current?.click()} disabled={busy !== null} className="btn-primary">
          {busy === "linkedin" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}Upload Connections.csv
        </button>
        <button onClick={() => alumni.current?.click()} disabled={busy !== null} className="btn-ghost">
          {busy === "alumni" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}Upload an alumni sheet
        </button>
      </div>
      <p className="mt-3 text-xs text-slate">Alumni sheets from your placement cell or alumni group need the columns name and company; position, linkedin and batch are optional. We never scrape LinkedIn or look up emails you did not give us.</p>
    </section>
  );
}

// ─── Add someone by hand ─────────────────────────────────────

export function AddContact() {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({ firstName: "", lastName: "", company: "", position: "", profileUrl: "", email: "", relationship: "other" });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF((x) => ({ ...x, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const res = await fetch("/api/referrals/connections", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f) });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return toast(json.error ?? "Could not add them", "error");
    toast(`${f.firstName} added`);
    setF({ firstName: "", lastName: "", company: "", position: "", profileUrl: "", email: "", relationship: "other" });
    setOpen(false);
    router.refresh();
  }

  if (!open) return <button onClick={() => setOpen(true)} className="btn-ghost btn-sm"><UserPlus className="h-4 w-4" />Add someone</button>;
  return (
    <form onSubmit={submit} className="panel mt-4 grid gap-3 p-5 sm:grid-cols-2">
      <label className="block"><span className="label">First name</span><input required className="field" value={f.firstName} onChange={set("firstName")} /></label>
      <label className="block"><span className="label">Last name</span><input className="field" value={f.lastName} onChange={set("lastName")} /></label>
      <label className="block"><span className="label">Company</span><input required className="field" value={f.company} onChange={set("company")} /></label>
      <label className="block"><span className="label">Position</span><input className="field" value={f.position} onChange={set("position")} /></label>
      <label className="block"><span className="label">LinkedIn profile (optional)</span><input className="field" value={f.profileUrl} onChange={set("profileUrl")} placeholder="linkedin.com/in/name" /></label>
      <label className="block"><span className="label">Email (optional)</span><input type="email" className="field" value={f.email} onChange={set("email")} /></label>
      <label className="block"><span className="label">How you know them</span>
        <select className="field" value={f.relationship} onChange={set("relationship")}>
          {REL_OPTIONS.slice(1).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </label>
      <div className="flex items-end gap-2">
        <button type="submit" disabled={busy} className="btn-primary">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}Add</button>
        <button type="button" onClick={() => setOpen(false)} className="btn-ghost">Cancel</button>
      </div>
    </form>
  );
}

// ─── Connections list ────────────────────────────────────────

export type ConnRow = { id: string; name: string; company: string; position: string | null; relationship: string | null; profileUrl: string | null };

export function ConnectionsList({ rows }: { rows: ConnRow[] }) {
  const toast = useToast();
  const [items, setItems] = useState(rows);
  async function setRel(id: string, relationship: string) {
    const res = await fetch(`/api/referrals/connections/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ relationship: relationship || null }) });
    if (!res.ok) return toast("Could not save", "error");
    setItems((xs) => xs.map((x) => (x.id === id ? { ...x, relationship: relationship || null } : x)));
  }
  async function remove(id: string) {
    const res = await fetch(`/api/referrals/connections/${id}`, { method: "DELETE" });
    if (!res.ok) return toast("Could not remove", "error");
    setItems((xs) => xs.filter((x) => x.id !== id));
  }
  if (items.length === 0) return <p className="py-6 text-sm text-slate">No one matches that search.</p>;
  return (
    <ul className="divide-y divide-line">
      {items.map((c) => (
        <li key={c.id} className="flex flex-wrap items-center gap-3 py-3">
          <div className="min-w-0 flex-1">
            <p className="font-medium text-ink">
              {c.profileUrl ? <a href={c.profileUrl} target="_blank" rel="noopener noreferrer" className="hover:text-cobalt">{c.name}</a> : c.name}
            </p>
            <p className="truncate text-sm text-slate">{[c.position, c.company].filter(Boolean).join(" · ")}</p>
          </div>
          <select aria-label={`How you know ${c.name}`} value={c.relationship ?? ""} onChange={(e) => setRel(c.id, e.target.value)} className="rounded-lg border border-line bg-paper px-2 py-1.5 text-sm">
            {REL_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <button onClick={() => remove(c.id)} className="grid h-8 w-8 place-items-center rounded-lg text-slate hover:bg-rose-tint hover:text-rose" aria-label={`Remove ${c.name}`}><Trash2 className="h-4 w-4" /></button>
        </li>
      ))}
    </ul>
  );
}

// ─── Requests board and follow ups ───────────────────────────

export type RequestRow = {
  id: string; jobId: string; jobTitle: string; company: string; personName: string; personPosition: string | null;
  personUrl: string | null; channel: string; status: Status; sentAt: string | null; followUpAt: string | null;
  followUpMessage: string | null; updatedAt: string;
};
type Status = "drafted" | "sent" | "replied" | "referred" | "declined" | "no_response";
const COLUMNS: { key: Status; label: string; dot: string }[] = [
  { key: "drafted", label: "Drafted", dot: "bg-slate-light" },
  { key: "sent", label: "Sent", dot: "bg-cobalt" },
  { key: "replied", label: "Replied", dot: "bg-marigold" },
  { key: "referred", label: "Referred", dot: "bg-mint" },
  { key: "declined", label: "Declined", dot: "bg-rose" },
  { key: "no_response", label: "No response", dot: "bg-line" },
];

async function patch(id: string, body: object, asOf?: string) {
  return fetch(`/api/referrals/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json", ...(asOf ? { "x-hf-as-of": asOf } : {}) }, body: JSON.stringify(body) });
}

export function FollowUps({ due, asOf }: { due: RequestRow[]; asOf?: string }) {
  const router = useRouter();
  const toast = useToast();
  if (due.length === 0) return null;
  async function move(id: string, status: Status) {
    const res = await patch(id, { status }, asOf);
    if (!res.ok) return toast("Could not update", "error");
    router.refresh();
  }
  async function snooze(id: string) {
    const base = asOf ? new Date(asOf) : new Date();
    const res = await patch(id, { followUpAt: new Date(base.getTime() + 3 * 86_400_000).toISOString() }, asOf);
    if (res.ok) { toast("We will remind you again in 3 days"); router.refresh(); }
  }
  return (
    <section aria-labelledby="followups-title" className="rounded-2xl bg-marigold-tint p-6">
      <h2 id="followups-title" className="text-xl font-semibold">Follow ups due ({due.length})</h2>
      <p className="mt-1 text-sm text-ink-soft">No reply yet. A short, polite nudge doubles your chances.</p>
      <ul className="mt-4 space-y-3">
        {due.map((r) => (
          <li key={r.id} className="rounded-xl bg-white p-4">
            <p className="font-medium text-ink">{r.personName} <span className="font-normal text-slate">· {r.jobTitle} at {r.company}</span></p>
            <p className="text-xs text-slate">Sent {r.sentAt ? timeAgo(r.sentAt) : ""}</p>
            {r.followUpMessage && <p className="mt-2 whitespace-pre-line rounded-lg bg-paper p-3 text-sm text-ink-soft">{r.followUpMessage}</p>}
            <div className="mt-3 flex flex-wrap gap-2">
              {r.followUpMessage && <button onClick={async () => { await navigator.clipboard.writeText(r.followUpMessage!); toast("Follow up copied"); }} className="btn-ghost btn-sm"><Copy className="h-4 w-4" />Copy follow up</button>}
              {r.personUrl && <a href={r.personUrl} target="_blank" rel="noopener noreferrer" className="btn-ghost btn-sm"><ExternalLink className="h-4 w-4" />Open LinkedIn</a>}
              <button onClick={() => snooze(r.id)} className="btn-ghost btn-sm">Sent it, remind me in 3 days</button>
              <button onClick={() => move(r.id, "replied")} className="btn-ghost btn-sm"><Check className="h-4 w-4" />They replied</button>
              <button onClick={() => move(r.id, "no_response")} className="btn-ghost btn-sm">Give up</button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function RequestsBoard({ initial, asOf }: { initial: RequestRow[]; asOf?: string }) {
  const toast = useToast();
  const [items, setItems] = useState(initial);
  async function move(id: string, status: Status) {
    const prev = items;
    setItems((xs) => xs.map((x) => (x.id === id ? { ...x, status } : x)));
    const res = await patch(id, { status }, asOf);
    if (!res.ok) { setItems(prev); toast("Could not move it", "error"); }
  }
  async function remove(id: string) {
    const prev = items;
    setItems((xs) => xs.filter((x) => x.id !== id));
    const res = await fetch(`/api/referrals/${id}`, { method: "DELETE" });
    if (!res.ok) setItems(prev);
  }
  if (items.length === 0) {
    return (
      <div className="panel p-8 text-center">
        <p className="font-display text-xl font-semibold">No referral requests yet</p>
        <p className="mt-2 text-slate">Open a job at a company where you know someone and press “Ask for a referral”.</p>
        <Link href="/jobs?network=1" className="btn-primary mt-5">Jobs where you know someone</Link>
      </div>
    );
  }
  return (
    <div className="-mx-4 flex snap-x gap-4 overflow-x-auto px-4 pb-4 xl:mx-0 xl:grid xl:grid-cols-6 xl:overflow-visible xl:px-0">
      {COLUMNS.map((col) => {
        const list = items.filter((i) => i.status === col.key);
        return (
          <section key={col.key} className="w-[78vw] max-w-xs shrink-0 snap-start sm:w-64 xl:w-auto">
            <h3 className="mb-3 flex items-center gap-2 font-sans text-sm font-semibold tracking-normal">
              <span className={cn("h-2 w-2 rounded-full", col.dot)} aria-hidden />{col.label}<span className="font-normal text-slate">{list.length}</span>
            </h3>
            <div className="min-h-24 space-y-3 rounded-2xl bg-white/50 p-2 ring-1 ring-line">
              {list.map((r) => (
                <article key={r.id} className="rounded-xl border border-line bg-white p-3.5">
                  <div className="flex gap-3">
                    <CompanyAvatar name={r.company} className="h-8 w-8 text-sm" />
                    <div className="min-w-0">
                      <p className="truncate text-[14.5px] font-medium">{r.personName}</p>
                      <Link href={`/jobs/${r.jobId}`} className="line-clamp-2 text-xs text-slate hover:text-cobalt">{r.jobTitle}, {r.company}</Link>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center gap-1.5">
                    <select aria-label={`Status of the request to ${r.personName}`} value={r.status} onChange={(e) => move(r.id, e.target.value as Status)} className="min-w-0 flex-1 rounded-lg border border-line bg-paper px-2 py-1 text-xs">
                      {COLUMNS.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
                    </select>
                    <button onClick={() => remove(r.id)} className="grid h-7 w-7 place-items-center rounded-lg bg-paper text-slate hover:text-rose" aria-label="Delete request"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                  <p className="mt-2 text-[11px] text-slate-light">{r.followUpAt && r.status === "sent" ? `Follow up ${new Date(r.followUpAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}` : `Updated ${timeAgo(r.updatedAt)}`}</p>
                </article>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
