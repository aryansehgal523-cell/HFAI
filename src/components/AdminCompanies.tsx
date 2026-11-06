"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { useToast } from "./Toast";

type Row = { id: string; name: string; ats: string; atsToken: string; active: boolean; lastCrawledAt: string | null; openJobs: number };

export function AdminCompanies({ rows }: { rows: Row[] }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", ats: "GREENHOUSE", token: "", industry: "" });

  async function call(body: object, key: string) {
    setBusy(key);
    const res = await fetch("/api/admin/companies", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) return toast(data.error ?? "Failed", "error");
    const crawl = data.crawl ?? data;
    if (crawl?.jobsSeen !== undefined) toast(crawl.errors?.length ? `Crawl error: ${crawl.errors[0].error}` : `Crawled: ${crawl.jobsSeen} jobs, ${crawl.jobsNew} new`, crawl.errors?.length ? "error" : "ok");
    router.refresh();
    return data;
  }

  return (
    <div>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const ok = await call({ action: "add", ...form }, "add");
          if (ok) setForm({ name: "", ats: "GREENHOUSE", token: "", industry: "" });
        }}
        className="grid gap-3 rounded-2xl bg-paper p-4 sm:grid-cols-[1.2fr_150px_1fr_1fr_auto]"
      >
        <input required placeholder="Company name" className="field" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <select className="field" value={form.ats} onChange={(e) => setForm({ ...form, ats: e.target.value })}>
          <option value="GREENHOUSE">Greenhouse</option>
          <option value="LEVER">Lever</option>
          <option value="ASHBY">Ashby</option>
        </select>
        <input required placeholder="Board token, e.g. stripe" className="field" value={form.token} onChange={(e) => setForm({ ...form, token: e.target.value })} />
        <input placeholder="Industry" className="field" value={form.industry} onChange={(e) => setForm({ ...form, industry: e.target.value })} />
        <button className="btn-primary" disabled={busy === "add"}>{busy === "add" && <Loader2 className="h-4 w-4 animate-spin" />}Add and crawl</button>
      </form>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-slate">
            <tr><th className="py-2 font-medium">Company</th><th className="py-2 font-medium">Source</th><th className="py-2 text-right font-medium">Open jobs</th><th className="py-2 font-medium">Last crawl</th><th className="py-2 font-medium">Active</th><th /></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-line">
                <td className="py-2.5 font-medium">{r.name}</td>
                <td className="py-2.5 text-slate">{r.ats.toLowerCase()} / {r.atsToken}</td>
                <td className="py-2.5 text-right tabular-nums">{r.openJobs}</td>
                <td className="py-2.5 text-slate">{r.lastCrawledAt ? new Date(r.lastCrawledAt).toLocaleString("en-IN") : "Never"}</td>
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
          </tbody>
        </table>
      </div>
    </div>
  );
}
