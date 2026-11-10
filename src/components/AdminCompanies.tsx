"use client";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { useToast } from "./Toast";

type Row = {
  id: string; name: string; ats: string; atsToken: string; active: boolean; lastCrawledAt: string | null; openJobs: number;
  lastCrawlStatus: string | null; lastCrawlJobs: number | null; lastCrawlError: string | null; consecutiveFailures: number; careersUrl: string | null;
  companyType: string | null; isMnc: boolean; classifiedBy: string | null;
};

const TYPE_OPTIONS = [["MNC", "MNC"], ["GCC", "GCC"], ["INDIAN_LARGE", "Indian large"], ["UNICORN", "Unicorn"], ["STARTUP", "Startup"], ["GOVERNMENT", "Government"], ["OTHER", "Other"]] as const;
type Filter = "all" | "failing" | "nojobs" | "inactive";

const PAGE = 100;
const SOURCES = ["GREENHOUSE", "LEVER", "ASHBY", "WORKDAY", "SMARTRECRUITERS", "WORKABLE", "RECRUITEE", "KEKA", "ORACLE", "JSONLD"] as const;
const SOURCE_LABEL: Record<string, string> = {
  GREENHOUSE: "Greenhouse", LEVER: "Lever", ASHBY: "Ashby", WORKDAY: "Workday", SMARTRECRUITERS: "SmartRecruiters",
  WORKABLE: "Workable", RECRUITEE: "Recruitee", KEKA: "Keka", ORACLE: "Oracle", JSONLD: "JSON-LD", MANUAL: "Demo", AGGREGATOR: "Aggregator",
};
const TOKEN_HINT: Record<string, string> = {
  GREENHOUSE: "Board token, e.g. stripe", LEVER: "Board token, e.g. palantir", ASHBY: "Board token, e.g. notion",
  WORKDAY: "tenant.wdN/Site, e.g. nvidia.wd5/NVIDIAExternalCareerSite", SMARTRECRUITERS: "Company id, e.g. Experian",
  WORKABLE: "Account, e.g. remofirst", RECRUITEE: "Subdomain, e.g. bunq", KEKA: "Subdomain, e.g. jupiter", ORACLE: "host/Site, e.g. fa-etvl-saasfaprod1.fa.ocs.oraclecloud.com/CX_1", JSONLD: "Careers host, e.g. careers.unilever.com",
};

const failing = (r: Row) => r.lastCrawlStatus === "error" || r.lastCrawlStatus === "blocked";
const noJobs = (r: Row) => r.lastCrawlStatus === "empty" || (r.lastCrawlStatus === "ok" && r.openJobs === 0);

function Status({ r }: { r: Row }) {
  if (!r.lastCrawlStatus) return <span className="text-slate">Not crawled</span>;
  if (failing(r))
    return (
      <span className="text-rose" title={r.lastCrawlError ?? ""}>
        {r.lastCrawlStatus === "blocked" ? "Blocked" : "Error"}
        {r.consecutiveFailures > 1 ? ` ×${r.consecutiveFailures}` : ""}
      </span>
    );
  if (r.lastCrawlStatus === "empty") return <span className="text-marigold-deep">No jobs</span>;
  return <span className="text-mint-ink">OK, {r.lastCrawlJobs ?? 0} listed</span>;
}

export function AdminCompanies({ rows }: { rows: Row[] }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", ats: "GREENHOUSE", token: "", industry: "" });
  const [byUrl, setByUrl] = useState({ name: "", careersUrl: "" });
  const [filter, setFilter] = useState<Filter>("all");
  const [source, setSource] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const counts = useMemo(
    () => ({ all: rows.length, failing: rows.filter(failing).length, nojobs: rows.filter(noJobs).length, inactive: rows.filter((r) => !r.active).length }),
    [rows],
  );
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter(
      (r) =>
        (filter === "all" || (filter === "failing" && failing(r)) || (filter === "nojobs" && noJobs(r)) || (filter === "inactive" && !r.active)) &&
        (!source || r.ats === source) &&
        (!needle || r.name.toLowerCase().includes(needle) || r.atsToken.toLowerCase().includes(needle)),
    );
  }, [rows, filter, source, q]);
  const pageRows = shown.slice(page * PAGE, page * PAGE + PAGE);
  const pages = Math.max(1, Math.ceil(shown.length / PAGE));

  async function call(body: object, key: string) {
    setBusy(key);
    const res = await fetch("/api/admin/companies", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) {
      toast(data.error ?? "Failed", "error");
      return null;
    }
    const crawl = data.crawl ?? data;
    if (crawl?.jobsSeen !== undefined) {
      const errs = crawl.errors?.length ?? 0;
      const pending = crawl.pending ? `, ${crawl.pending} still to crawl (run again)` : "";
      toast(
        errs ? `Crawled ${crawl.companies}: ${errs} failed, first error: ${crawl.errors[0].error}${pending}` : `Crawled ${crawl.companies}: ${crawl.jobsSeen} jobs, ${crawl.jobsNew} new${pending}`,
        errs ? "error" : "ok",
      );
    } else if (data.updated !== undefined) toast(`${data.updated} companies updated`, "ok");
    router.refresh();
    return data;
  }

  const toggleAll = (on: boolean) => setSelected(on ? new Set(pageRows.map((r) => r.id)) : new Set());
  const bulk = async (op: "crawl" | "deactivate" | "activate") => {
    if (!selected.size) return;
    const ok = await call({ action: "bulk", op, ids: [...selected] }, `bulk-${op}`);
    if (ok) setSelected(new Set());
  };

  return (
    <div>
      <div className="grid gap-3 lg:grid-cols-2">
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const ok = await call({ action: "add", ...form }, "add");
            if (ok) setForm({ name: "", ats: form.ats, token: "", industry: "" });
          }}
          className="grid gap-3 rounded-2xl bg-paper p-4 sm:grid-cols-2"
        >
          <p className="text-sm font-medium sm:col-span-2">Add by hiring system and token</p>
          <input required placeholder="Company name" className="field" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <select className="field" value={form.ats} onChange={(e) => setForm({ ...form, ats: e.target.value })} aria-label="Hiring system">
            {SOURCES.map((s) => <option key={s} value={s}>{SOURCE_LABEL[s]}</option>)}
          </select>
          <input required placeholder={TOKEN_HINT[form.ats]} className="field sm:col-span-2" value={form.token} onChange={(e) => setForm({ ...form, token: e.target.value })} />
          <input placeholder="Industry (optional)" className="field" value={form.industry} onChange={(e) => setForm({ ...form, industry: e.target.value })} />
          <button className="btn-primary" disabled={busy === "add"}>{busy === "add" && <Loader2 className="h-4 w-4 animate-spin" />}Add and crawl</button>
        </form>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const ok = await call({ action: "detect", ...byUrl }, "detect");
            if (ok) {
              setByUrl({ name: "", careersUrl: "" });
              toast(ok.company ? `Found ${SOURCE_LABEL[ok.company.ats] ?? ok.company.ats} (${ok.company.atsToken}), crawling` : "Added", "ok");
            }
          }}
          className="grid content-start gap-3 rounded-2xl bg-paper p-4 sm:grid-cols-2"
        >
          <p className="text-sm font-medium sm:col-span-2">Add by careers page (detects the hiring system)</p>
          <input required placeholder="Company name" className="field" value={byUrl.name} onChange={(e) => setByUrl({ ...byUrl, name: e.target.value })} />
          <input required type="url" placeholder="https://company.com/careers" className="field" value={byUrl.careersUrl} onChange={(e) => setByUrl({ ...byUrl, careersUrl: e.target.value })} />
          <button className="btn-primary sm:col-span-2 sm:justify-self-start" disabled={busy === "detect"}>
            {busy === "detect" && <Loader2 className="h-4 w-4 animate-spin" />}Detect and add
          </button>
        </form>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        {(["all", "failing", "nojobs", "inactive"] as Filter[]).map((f) => (
          <button key={f} type="button" className="chip" data-on={filter === f} onClick={() => { setFilter(f); setPage(0); }}>
            {{ all: "All", failing: "Failing", nojobs: "No jobs", inactive: "Inactive" }[f]} ({counts[f]})
          </button>
        ))}
        <select className="field w-auto py-1.5 text-sm" value={source} onChange={(e) => { setSource(e.target.value); setPage(0); }} aria-label="Source">
          <option value="">All sources</option>
          {[...SOURCES, "MANUAL"].map((s) => <option key={s} value={s}>{SOURCE_LABEL[s]}</option>)}
        </select>
        <input className="field w-full py-1.5 text-sm sm:w-56" placeholder="Search companies" value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} />
      </div>

      {selected.size > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-cobalt-tint px-3 py-2 text-sm">
          <span className="font-medium">{selected.size} selected</span>
          <button className="btn-ghost btn-sm" onClick={() => bulk("crawl")} disabled={!!busy}>{busy === "bulk-crawl" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}Crawl now</button>
          <button className="btn-ghost btn-sm" onClick={() => bulk("deactivate")} disabled={!!busy}>Deactivate</button>
          <button className="btn-ghost btn-sm" onClick={() => bulk("activate")} disabled={!!busy}>Activate</button>
          <button className="btn-ghost btn-sm" onClick={() => setSelected(new Set())}>Clear</button>
        </div>
      )}

      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="text-slate">
            <tr>
              <th className="w-8 py-2">
                <input type="checkbox" className="h-4 w-4 accent-[#3346F2]" aria-label="Select all on this page"
                  checked={pageRows.length > 0 && pageRows.every((r) => selected.has(r.id))} onChange={(e) => toggleAll(e.target.checked)} />
              </th>
              <th className="py-2 font-medium">Company</th>
              <th className="py-2 font-medium">Source</th>
              <th className="px-3 py-2 text-right font-medium">Open jobs</th>
              <th className="py-2 font-medium">Last crawl</th>
              <th className="py-2 font-medium">Type</th>
              <th className="py-2 font-medium">Active</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {pageRows.map((r) => (
              <tr key={r.id} className="border-t border-line align-top">
                <td className="py-2.5">
                  <input type="checkbox" className="h-4 w-4 accent-[#3346F2]" aria-label={`Select ${r.name}`} checked={selected.has(r.id)}
                    onChange={(e) => { const s = new Set(selected); e.target.checked ? s.add(r.id) : s.delete(r.id); setSelected(s); }} />
                </td>
                <td className="py-2.5 font-medium">
                  {r.careersUrl ? <a href={r.careersUrl} target="_blank" rel="noreferrer" className="hover:underline">{r.name}</a> : r.name}
                </td>
                <td className="max-w-[220px] py-2.5 text-slate">
                  <span className="text-ink">{SOURCE_LABEL[r.ats] ?? r.ats}</span> <span className="break-all">{r.atsToken}</span>
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">{r.openJobs}</td>
                <td className="max-w-[260px] py-2.5">
                  <Status r={r} />
                  <span className="block text-xs text-slate">{r.lastCrawledAt ? new Date(r.lastCrawledAt).toLocaleString("en-IN") : ""}</span>
                  {failing(r) && r.lastCrawlError && <span className="block truncate text-xs text-slate" title={r.lastCrawlError}>{r.lastCrawlError}</span>}
                </td>
                <td className="py-2.5">
                  <select
                    className="field w-36 py-1 text-xs"
                    aria-label={`${r.name} company type`}
                    value={r.classifiedBy === "admin" ? r.companyType ?? "AUTO" : "AUTO"}
                    onChange={(e) => call({ action: "classify", id: r.id, type: e.target.value }, `t${r.id}`)}
                    disabled={busy === `t${r.id}`}
                  >
                    <option value="AUTO">Auto: {TYPE_OPTIONS.find(([v]) => v === r.companyType)?.[1] ?? "not set"}{r.isMnc ? " (MNC)" : ""}</option>
                    {TYPE_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </td>
                <td className="py-2.5">
                  <input type="checkbox" checked={r.active} onChange={(e) => call({ action: "toggle", id: r.id, active: e.target.checked }, r.id)} className="h-4 w-4 accent-[#3346F2]" aria-label={`${r.name} active`} />
                </td>
                <td className="py-2.5 text-right">
                  {r.ats !== "MANUAL" && (
                    <button onClick={() => call({ action: "crawl", id: r.id }, `c${r.id}`)} className="btn-ghost btn-sm" disabled={busy === `c${r.id}`}>
                      {busy === `c${r.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}Crawl
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {pageRows.length === 0 && (
              <tr><td colSpan={8} className="py-6 text-center text-slate">No companies match.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {pages > 1 && (
        <div className="mt-3 flex items-center justify-between text-sm text-slate">
          <span>{shown.length} companies, page {page + 1} of {pages}</span>
          <span className="flex gap-2">
            <button className="btn-ghost btn-sm" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</button>
            <button className="btn-ghost btn-sm" disabled={page + 1 >= pages} onClick={() => setPage(page + 1)}>Next</button>
          </span>
        </div>
      )}
    </div>
  );
}
