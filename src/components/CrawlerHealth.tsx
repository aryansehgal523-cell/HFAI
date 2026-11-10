import { AlertTriangle, Loader2 } from "lucide-react";
import { SOURCE_NAME, type SourceDrop } from "@/lib/ingest/monitor";
import { timeAgo } from "@/lib/utils";

type Run = {
  id: string; startedAt: Date; finishedAt: Date | null; companies: number; jobsSeen: number; jobsNew: number; jobsClosed: number;
  duplicatesRemoved: number; errors: { company: string; error: string }[] | null;
};

const name = (s: string) => SOURCE_NAME[s] ?? s;
const n = (v: number) => v.toLocaleString("en-IN");
const minutes = (r: Run) => (r.finishedAt ? Math.max(1, Math.round((r.finishedAt.getTime() - r.startedAt.getTime()) / 60_000)) : null);

/** Crawler monitoring for the admin page: live jobs by source, recent runs, failing sources and alerts. */
export function CrawlerHealth({ live, previous, runs, failing, drops, running }: {
  live: Record<string, number>;
  previous: Record<string, number> | null;
  runs: Run[];
  failing: { source: string; companies: number; sample: string | null }[];
  drops: SourceDrop[];
  running: { owner: string; expiresAt: string } | null;
}) {
  const sources = Object.entries(live).sort((a, b) => b[1] - a[1]);
  const total = sources.reduce((a, [, v]) => a + v, 0);
  return (
    <div className="space-y-6">
      {running && (
        <p className="flex items-center gap-2 rounded-xl bg-cobalt-tint px-4 py-3 text-sm text-ink">
          <Loader2 className="h-4 w-4 animate-spin text-cobalt" /> A crawl is running now ({running.owner}).
        </p>
      )}
      {drops.map((d) => (
        <p key={d.source} role="alert" className="flex items-start gap-2 rounded-xl bg-rose-tint px-4 py-3 text-sm text-rose">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span><strong>{name(d.source)}</strong> dropped {d.dropPct}% between the last two crawls ({n(d.before)} → {n(d.after)} open jobs). Check its failing companies below.</span>
        </p>
      ))}

      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <h3 className="font-semibold">Live jobs by source</h3>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-slate"><tr><th className="py-1.5 font-medium">Source</th><th className="py-1.5 text-right font-medium">Open jobs</th><th className="py-1.5 text-right font-medium">Since last crawl</th></tr></thead>
              <tbody>
                {sources.map(([s, v]) => {
                  const before = previous?.[s];
                  const delta = before === undefined ? null : v - before;
                  return (
                    <tr key={s} className="border-t border-line">
                      <td className="py-1.5">{name(s)}</td>
                      <td className="py-1.5 text-right tabular-nums">{n(v)}</td>
                      <td className={`py-1.5 text-right tabular-nums ${delta && delta < 0 ? "text-rose" : "text-slate"}`}>{delta === null ? "" : `${delta > 0 ? "+" : ""}${n(delta)}`}</td>
                    </tr>
                  );
                })}
                <tr className="border-t border-line font-medium"><td className="py-1.5">Total</td><td className="py-1.5 text-right tabular-nums">{n(total)}</td><td /></tr>
              </tbody>
            </table>
          </div>
        </div>
        <div>
          <h3 className="font-semibold">Failing sources</h3>
          {failing.length === 0 ? (
            <p className="mt-3 text-sm text-slate">No company is failing.</p>
          ) : (
            <ul className="mt-3 space-y-2 text-sm">
              {failing.map((f) => (
                <li key={f.source} className="rounded-lg bg-paper px-3 py-2">
                  <span className="font-medium">{name(f.source)}</span>: {f.companies} {f.companies === 1 ? "company" : "companies"} failing
                  {f.sample && <span className="block truncate text-xs text-slate" title={f.sample}>e.g. {f.sample}</span>}
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-xs text-slate">Use the Failing filter below to see and fix each company.</p>
        </div>
      </div>

      <div>
        <h3 className="font-semibold">Recent crawls</h3>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="text-slate">
              <tr>
                <th className="py-1.5 font-medium">Started</th><th className="py-1.5 text-right font-medium">Minutes</th><th className="py-1.5 text-right font-medium">Companies</th>
                <th className="py-1.5 text-right font-medium">Jobs seen</th><th className="py-1.5 text-right font-medium">New</th><th className="py-1.5 text-right font-medium">Closed</th>
                <th className="py-1.5 text-right font-medium">Duplicates removed</th><th className="py-1.5 text-right font-medium">Errors</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id} className="border-t border-line">
                  <td className="py-1.5">{timeAgo(r.startedAt)}{!r.finishedAt && <span className="ml-1 text-cobalt">(running)</span>}</td>
                  <td className="py-1.5 text-right tabular-nums">{minutes(r) ?? ""}</td>
                  <td className="py-1.5 text-right tabular-nums">{n(r.companies)}</td>
                  <td className="py-1.5 text-right tabular-nums">{n(r.jobsSeen)}</td>
                  <td className="py-1.5 text-right tabular-nums text-mint-ink">{n(r.jobsNew)}</td>
                  <td className="py-1.5 text-right tabular-nums">{n(r.jobsClosed)}</td>
                  <td className="py-1.5 text-right tabular-nums">{n(r.duplicatesRemoved)}</td>
                  <td className={`py-1.5 text-right tabular-nums ${r.errors?.length ? "text-rose" : ""}`}>{r.errors?.length ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
