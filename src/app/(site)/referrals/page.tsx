import type { Metadata } from "next";
import Link from "next/link";
import { and, asc, desc, eq, ilike, or, sql } from "drizzle-orm";
import { Lock, Search } from "lucide-react";
import { db } from "@/db";
import { companies, connections, jobs, referralRequests } from "@/db/schema";
import { requireUser } from "@/lib/session";
import { referralNow } from "@/lib/referrals/store";
import { AddContact, ConnectNetwork, ConnectionsList, FollowUps, RequestsBoard, type RequestRow } from "@/components/ReferralsClient";

export const metadata: Metadata = { title: "Referrals" };

export default async function ReferralsPage({ searchParams }: { searchParams: Promise<{ q?: string; asOf?: string }> }) {
  const user = await requireUser("/referrals");
  const sp = await searchParams;
  const now = referralNow(sp.asOf);
  const asOf = process.env.NODE_ENV !== "production" ? sp.asOf : undefined;
  const q = sp.q?.trim().slice(0, 60);
  const premium = user.plan === "PREMIUM";

  const like = q ? `%${q.replace(/[%_]/g, "")}%` : null;
  const [[{ total }], topCompanies, people, requests] = await Promise.all([
    db.select({ total: sql<number>`count(*)::int` }).from(connections).where(eq(connections.userId, user.id)),
    db.select({ company: sql<string>`min(${connections.company})`, n: sql<number>`count(*)::int` }).from(connections)
      .where(eq(connections.userId, user.id)).groupBy(connections.companyKey).orderBy(desc(sql`count(*)`)).limit(12),
    db.select().from(connections)
      .where(and(eq(connections.userId, user.id), like ? or(ilike(connections.firstName, like), ilike(connections.lastName, like), ilike(connections.company, like), ilike(connections.position, like)) : undefined))
      .orderBy(asc(connections.company), asc(connections.firstName)).limit(50),
    db.select({
      id: referralRequests.id, jobId: referralRequests.jobId, jobTitle: jobs.title, company: companies.name,
      personName: referralRequests.personName, personPosition: referralRequests.personPosition, personUrl: referralRequests.personUrl,
      channel: referralRequests.channel, status: referralRequests.status, sentAt: referralRequests.sentAt,
      followUpAt: referralRequests.followUpAt, followUpMessage: referralRequests.followUpMessage, updatedAt: referralRequests.updatedAt,
    }).from(referralRequests)
      .innerJoin(jobs, eq(jobs.id, referralRequests.jobId))
      .innerJoin(companies, eq(companies.id, jobs.companyId))
      .where(eq(referralRequests.userId, user.id))
      .orderBy(desc(referralRequests.updatedAt)),
  ]);

  const rows: RequestRow[] = requests.map((r) => ({
    ...r,
    sentAt: r.sentAt?.toISOString() ?? null,
    followUpAt: r.followUpAt?.toISOString() ?? null,
    updatedAt: r.updatedAt.toISOString(),
  }));
  const due = rows.filter((r) => r.status === "sent" && r.followUpAt && new Date(r.followUpAt) <= now);
  const sent = rows.filter((r) => r.status !== "drafted").length;
  const replied = rows.filter((r) => ["replied", "referred", "declined"].includes(r.status)).length;
  const referred = rows.filter((r) => r.status === "referred").length;

  return (
    <div className="container-x space-y-10 py-12">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <h1 className="text-4xl font-semibold">Referrals</h1>
          <p className="mt-2 max-w-2xl text-slate">A referral is the fastest way past the resume pile. See who you know at each company, ask them well, and keep track of who replied.</p>
        </div>
        <dl className="panel grid grid-cols-3 divide-x divide-line">
          {[["Requests sent", sent], ["Reply rate", sent ? `${Math.round((replied / sent) * 100)}%` : "—"], ["Referrals", referred]].map(([l, v]) => (
            <div key={l as string} className="px-5 py-3">
              <dt className="text-xs text-slate">{l}</dt>
              <dd className="font-display text-2xl font-semibold tabular-nums">{v}</dd>
            </div>
          ))}
        </dl>
      </div>

      {asOf && <p className="rounded-xl bg-cobalt-tint px-4 py-2 text-sm text-ink">Development: showing follow ups as of {now.toDateString()}.</p>}

      {!premium && (
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-ink px-6 py-5 text-white light-scope">
          <p className="max-w-2xl"><span className="font-semibold">Referral requests are part of Premium.</span> <span className="text-white/70">Import your network for free and see how many people you know at each company. Premium shows who they are, who to ask first, and drafts the message.</span></p>
          <Link href="/pricing" className="btn bg-white text-ink hover:bg-paper"><Lock className="h-4 w-4" />See Premium</Link>
        </div>
      )}

      <FollowUps due={due} asOf={asOf} />

      {(premium || rows.length > 0) && (
        <section aria-labelledby="requests-title">
          <h2 id="requests-title" className="mb-4 text-2xl font-semibold">Your requests</h2>
          <RequestsBoard initial={rows} asOf={asOf} />
        </section>
      )}

      {total === 0 ? (
        <ConnectNetwork hasNetwork={false} />
      ) : (
        <section aria-labelledby="network-title" className="panel p-6 sm:p-8">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 id="network-title" className="text-2xl font-semibold">Your network</h2>
              <p className="mt-1 text-slate">{total.toLocaleString("en-IN")} {total === 1 ? "person" : "people"}. Mark alumni and ex colleagues: they rank first and the message mentions how you know them.</p>
            </div>
            <AddContact />
          </div>
          <div className="mt-5 flex flex-wrap gap-2" aria-label="Companies where you know the most people">
            {topCompanies.map((c) => (
              <Link key={c.company} href={`/jobs?q=${encodeURIComponent(c.company)}`} className="chip">{c.company} <span className="text-slate-light">{c.n}</span></Link>
            ))}
          </div>
          <form method="get" className="mt-6 flex max-w-md items-center gap-2" role="search">
            <label className="relative flex-1">
              <span className="sr-only">Search your network</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate" aria-hidden />
              <input name="q" defaultValue={q} placeholder="Name, company or role" className="field pl-9" />
            </label>
            {asOf && <input type="hidden" name="asOf" value={asOf} />}
            <button className="btn-ghost">Search</button>
          </form>
          <div className="mt-4">
            <ConnectionsList key={q ?? ""} rows={people.map((c) => ({ id: c.id, name: `${c.firstName} ${c.lastName}`.trim(), company: c.company, position: c.position, relationship: c.relationship, profileUrl: c.profileUrl }))} />
            {people.length === 50 && <p className="pt-3 text-xs text-slate">Showing the first 50. Search to find someone specific.</p>}
          </div>
        </section>
      )}

      {total > 0 && <ConnectNetwork hasNetwork />}
    </div>
  );
}
