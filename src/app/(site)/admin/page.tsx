import type { Metadata } from "next";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { companies, connections, contactMessages, crawlRuns, jobs, payments, referralRequests, tailorings, users } from "@/db/schema";
import { requireAdmin } from "@/lib/session";
import { formatINR, timeAgo } from "@/lib/utils";
import { AdminCompanies } from "@/components/AdminCompanies";
import { CrawlerHealth } from "@/components/CrawlerHealth";
import { liveJobsBySource } from "@/lib/ingest/run";
import { lockStatus } from "@/lib/ingest/lock";
import { sourceDropAlerts } from "@/lib/ingest/monitor";

export const metadata: Metadata = { title: "Admin" };
export const dynamic = "force-dynamic";

export default async function Admin() {
  await requireAdmin();
  const [[u], [j], [rev], [ai], companyRows, runs, messages, recentPays, [ref], live, failingRows, running] = await Promise.all([
    db.select({
      total: sql<number>`count(*)::int`,
      premium: sql<number>`count(*) filter (where ${users.plan} = 'PREMIUM')::int`,
      week: sql<number>`count(*) filter (where ${users.createdAt} > now() - interval '7 days')::int`,
    }).from(users),
    db.select({
      open: sql<number>`count(*) filter (where ${jobs.closedAt} is null)::int`,
      ghost: sql<number>`count(*) filter (where ${jobs.closedAt} is null and ${jobs.ghostScore} > 40)::int`,
    }).from(jobs),
    db.select({ month: sql<number>`coalesce(sum(${payments.amount}) filter (where ${payments.createdAt} > now() - interval '30 days'), 0)::int` }).from(payments),
    db.select({
      count: sql<number>`count(*) filter (where ${tailorings.createdAt} > now() - interval '30 days')::int`,
      tokensIn: sql<number>`coalesce(sum(${tailorings.inputTokens}) filter (where ${tailorings.createdAt} > now() - interval '30 days'), 0)::int`,
      tokensOut: sql<number>`coalesce(sum(${tailorings.outputTokens}) filter (where ${tailorings.createdAt} > now() - interval '30 days'), 0)::int`,
    }).from(tailorings),
    db.select({
      id: companies.id, name: companies.name, ats: companies.ats, atsToken: companies.atsToken, active: companies.active, lastCrawledAt: companies.lastCrawledAt,
      lastCrawlStatus: companies.lastCrawlStatus, lastCrawlJobs: companies.lastCrawlJobs, lastCrawlError: companies.lastCrawlError,
      consecutiveFailures: companies.consecutiveFailures, careersUrl: companies.careersUrl,
      companyType: companies.companyType, isMnc: companies.isMnc, classifiedBy: companies.classifiedBy,
      openJobs: sql<number>`coalesce(oj.n, 0)::int`,
    })
      .from(companies)
      .leftJoin(sql`(select company_id, count(*) as n from jobs where closed_at is null group by company_id) oj`, sql`oj.company_id = ${companies.id}`)
      .where(sql`${companies.ats} <> 'AGGREGATOR'`)
      .orderBy(companies.name),
    db.select().from(crawlRuns).orderBy(desc(crawlRuns.startedAt)).limit(10),
    db.select().from(contactMessages).orderBy(desc(contactMessages.createdAt)).limit(10),
    db.select({ amount: payments.amount, kind: payments.kind, createdAt: payments.createdAt, email: users.email }).from(payments).innerJoin(users, eq(users.id, payments.userId)).orderBy(desc(payments.createdAt)).limit(10),
    db.select({
      drafted: sql<number>`count(*) filter (where ${referralRequests.createdAt} > now() - interval '30 days')::int`,
      sent: sql<number>`count(*) filter (where ${referralRequests.sentAt} > now() - interval '30 days')::int`,
      referred: sql<number>`count(*) filter (where ${referralRequests.status} = 'referred')::int`,
      networks: sql<number>`(select count(distinct ${connections.userId})::int from ${connections})`,
    }).from(referralRequests),
    liveJobsBySource(),
    db.select({ source: sql<string>`lower(${companies.ats}::text)`, n: sql<number>`count(*)::int`, sample: sql<string | null>`max(${companies.name} || ': ' || left(coalesce(${companies.lastCrawlError}, ''), 120))` })
      .from(companies)
      .where(sql`${companies.active} AND ${companies.lastCrawlStatus} IN ('error', 'blocked')`)
      .groupBy(companies.ats)
      .orderBy(desc(sql`count(*)`)),
    lockStatus("crawl"),
  ]);
  const lastRun = runs[0];
  // Compare the two most recent runs that recorded live jobs per source.
  const snapshots = runs.filter((r) => r.liveBySource);
  const drops = sourceDropAlerts(snapshots[1]?.liveBySource, snapshots[0]?.liveBySource);

  const stats = [
    ["Users", u.total.toLocaleString("en-IN"), `${u.week} new this week`],
    ["Premium", u.premium.toLocaleString("en-IN"), u.total ? `${((u.premium / u.total) * 100).toFixed(1)}% conversion` : "0% conversion"],
    ["Revenue, 30 days", formatINR(rev.month), "GST inclusive"],
    ["Open jobs", j.open.toLocaleString("en-IN"), `${j.ghost} flagged as ghost`],
    ["Tailorings, 30 days", ai.count.toLocaleString("en-IN"), `${Math.round((ai.tokensIn + ai.tokensOut) / 1000)}k tokens`],
    ["Referral drafts, 30 days", ref.drafted.toLocaleString("en-IN"), `${ref.sent} sent, ${ref.referred} referred in total, ${ref.networks} networks`],
  ];

  return (
    <div className="container-x py-12">
      <h1 className="text-4xl font-semibold">Admin</h1>

      <div className="mt-8 grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-2 lg:grid-cols-6">
        {stats.map(([label, value, note]) => (
          <div key={label} className="bg-white p-5">
            <p className="text-sm text-slate">{label}</p>
            <p className="mt-1 font-display text-3xl font-semibold tabular-nums">{value}</p>
            <p className="mt-1 text-xs text-slate">{note}</p>
          </div>
        ))}
      </div>

      <section className="panel mt-8 p-6">
        <h2 className="text-xl font-semibold">Crawler health</h2>
        <div className="mt-5">
          <CrawlerHealth
            live={live}
            previous={snapshots[1]?.liveBySource ?? null}
            runs={runs}
            failing={failingRows.map((f) => ({ source: f.source, companies: f.n, sample: f.sample }))}
            drops={drops}
            running={running}
          />
        </div>
      </section>

      <section className="panel mt-8 p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-xl font-semibold">Companies and crawler</h2>
          {lastRun && (
            <p className="text-sm text-slate">
              Last crawl {timeAgo(lastRun.startedAt)}: {lastRun.jobsSeen} seen, {lastRun.jobsNew} new, {lastRun.jobsClosed} closed, {lastRun.errors?.length ?? 0} errors
            </p>
          )}
        </div>
        <div className="mt-5">
          <AdminCompanies rows={companyRows.map((c) => ({ ...c, lastCrawledAt: c.lastCrawledAt?.toISOString() ?? null }))} />
        </div>
      </section>

      <div className="mt-8 grid gap-8 lg:grid-cols-2">
        <section className="panel p-6">
          <h2 className="text-xl font-semibold">Support inbox</h2>
          <ul className="mt-4 divide-y divide-line">
            {messages.length === 0 && <li className="py-3 text-slate">No messages.</li>}
            {messages.map((m) => (
              <li key={m.id} className="py-3">
                <p className="text-sm"><span className="font-medium">{m.name}</span> <span className="text-slate">({m.email}), {m.topic}, {timeAgo(m.createdAt)}</span></p>
                <p className="mt-1 line-clamp-3 text-sm text-ink-soft">{m.message}</p>
              </li>
            ))}
          </ul>
        </section>
        <section className="panel p-6">
          <h2 className="text-xl font-semibold">Recent payments</h2>
          <ul className="mt-4 divide-y divide-line">
            {recentPays.length === 0 && <li className="py-3 text-slate">No payments yet.</li>}
            {recentPays.map((p, i) => (
              <li key={i} className="flex justify-between gap-4 py-3 text-sm">
                <span className="truncate">{p.email} <span className="text-slate">({p.kind})</span></span>
                <span className="shrink-0 tabular-nums">{formatINR(p.amount)} <span className="text-slate">{timeAgo(p.createdAt)}</span></span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
