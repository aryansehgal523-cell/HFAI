import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { and, eq, inArray, ne } from "drizzle-orm";
import { db } from "@/db";
import { applications, companies } from "@/db/schema";
import { networkCountsFor } from "@/lib/referrals/store";
import { ensureMatches, forYou, storedMatches } from "@/lib/match-store";
import { JobRow } from "@/components/JobRow";
import { Filters, SearchBar } from "@/components/Filters";
import { companyTypeCounts, parseFilters, searchJobs } from "@/lib/jobs-query";
import { getCurrentUser } from "@/lib/session";

export const metadata: Metadata = {
  title: "Find jobs",
  description: "Fresh jobs from company career pages across India and remote, with ghost listings filtered out.",
};

type SP = Promise<Record<string, string | string[] | undefined>>;

export default async function JobsPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const filters = parseFilters(sp);
  const user = await getCurrentUser();
  if (filters.network && user) {
    // Same company matching as the job page: aliases plus the strict similarity check.
    const all = await db.select({ id: companies.id, name: companies.name }).from(companies).where(eq(companies.active, true));
    const counts = await networkCountsFor(user.id, all.map((c) => c.name));
    filters.companyIds = all.filter((c) => counts.has(c.name)).map((c) => c.id);
  }
  const tab = sp.tab === "foryou" && user ? "foryou" : "all";
  const hasProfile = user ? await ensureMatches(user.id) : false;
  const [result, typeCounts] = await Promise.all([
    tab === "foryou" && hasProfile ? forYou(user!.id, filters.page) : searchJobs(filters),
    companyTypeCounts(filters),
  ]);
  const matches = user && hasProfile ? await storedMatches(user.id, result.rows.map((r) => r.id)) : new Map();
  const networkCounts = user && result.rows.length ? await networkCountsFor(user.id, result.rows.map((r) => r.companyName)) : new Map<string, number>();

  let savedIds = new Set<string>();
  if (user && result.rows.length) {
    const saved = await db
      .select({ jobId: applications.jobId })
      .from(applications)
      .where(and(eq(applications.userId, user.id), ne(applications.status, "HIDDEN"), inArray(applications.jobId, result.rows.map((r) => r.id))));
    savedIds = new Set(saved.map((s) => s.jobId));
  }

  const pageHref = (p: number) => {
    const next = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) if (typeof v === "string" && k !== "page") next.set(k, v);
    next.set("page", String(p));
    return `/jobs?${next.toString()}`;
  };

  const baseHeading = tab === "foryou" && hasProfile ? "Jobs for you" : filters.network ? "Jobs where you know someone" : filters.q ? `${filters.q} jobs${filters.location ? ` in ${filters.location}` : ""}` : filters.location ? `Jobs in ${filters.location}` : "All open jobs";
  const heading = filters.mnc && tab !== "foryou" ? `${baseHeading} at MNCs` : baseHeading;

  return (
    <div className="container-x py-10">
      <Suspense>
        <SearchBar />
      </Suspense>

      <div className="mt-10 grid gap-10 lg:grid-cols-[250px_1fr]">
        <Suspense>
          <Filters companyCounts={typeCounts} />
        </Suspense>

        <section aria-labelledby="results-heading">
          {user && (
            <nav aria-label="Job lists" className="mb-5 inline-flex rounded-full border border-line bg-white p-1 text-sm">
              {[["all", "All jobs", "/jobs"], ["foryou", "For you", "/jobs?tab=foryou"]].map(([k, l, href]) => (
                <Link key={k} href={href} aria-current={tab === k ? "page" : undefined} className={`rounded-full px-4 py-1.5 ${tab === k ? "bg-ink text-white" : "text-slate hover:text-ink"}`}>{l}</Link>
              ))}
            </nav>
          )}
          {tab === "foryou" && !hasProfile && (
            <div className="mb-6 rounded-2xl bg-cobalt-tint p-5 text-ink">
              <p className="font-semibold">Add your resume to see jobs ranked for you</p>
              <p className="mt-1 text-sm text-ink-soft">We match your skills, experience, cities and salary to every open job.</p>
              <Link href="/onboarding" className="btn-primary btn-sm mt-3">Add my resume</Link>
            </div>
          )}
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line pb-4">
            <h1 id="results-heading" className="text-3xl font-semibold capitalize-first">{heading}</h1>
            <p className="text-sm text-slate">{result.total.toLocaleString("en-IN")}{"capped" in result && result.capped ? "+" : ""} {result.total === 1 ? "job" : "jobs"}</p>
          </div>

          {result.rows.length === 0 ? (
            <div className="py-20 text-center">
              <p className="font-display text-2xl font-semibold">{filters.network && !user ? "Sign in to see jobs where you know someone" : "No jobs match these filters"}</p>
              <p className="mt-2 text-slate">{filters.network ? "Upload your LinkedIn connections on the referrals page, or clear this filter." : "Try a broader role name, another city, or clear a filter."}</p>
              <Link href="/jobs" className="btn-ghost mt-6">Clear search</Link>
            </div>
          ) : (
            <div>
              {result.rows.map((j) => (
                <JobRow
                  key={j.id} job={j} saved={savedIds.has(j.id)} networkCount={networkCounts.get(j.companyName)}
                  matchScore={matches.get(j.id)?.score}
                  verdict={user?.plan === "PREMIUM" ? matches.get(j.id)?.aiVerdict : null}
                />
              ))}
            </div>
          )}

          {result.pages > 1 && (
            <nav className="mt-8 flex items-center justify-between" aria-label="Pagination">
              {result.page > 1 ? <Link className="btn-ghost btn-sm" href={pageHref(result.page - 1)}>Previous</Link> : <span />}
              <span className="text-sm text-slate">Page {result.page} of {result.pages}</span>
              {result.page < result.pages ? <Link className="btn-ghost btn-sm" href={pageHref(result.page + 1)}>Next</Link> : <span />}
            </nav>
          )}
        </section>
      </div>
    </div>
  );
}
