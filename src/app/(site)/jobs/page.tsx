import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { and, eq, inArray, ne } from "drizzle-orm";
import { db } from "@/db";
import { applications } from "@/db/schema";
import { JobRow } from "@/components/JobRow";
import { Filters, SearchBar } from "@/components/Filters";
import { parseFilters, searchJobs } from "@/lib/jobs-query";
import { getCurrentUser } from "@/lib/session";

export const metadata: Metadata = {
  title: "Find jobs",
  description: "Fresh jobs from company career pages across India and remote, with ghost listings filtered out.",
};

type SP = Promise<Record<string, string | string[] | undefined>>;

export default async function JobsPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const filters = parseFilters(sp);
  const [result, user] = await Promise.all([searchJobs(filters), getCurrentUser()]);

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

  const heading = filters.q ? `${filters.q} jobs${filters.location ? ` in ${filters.location}` : ""}` : filters.location ? `Jobs in ${filters.location}` : "All open jobs";

  return (
    <div className="container-x py-10">
      <Suspense>
        <SearchBar />
      </Suspense>

      <div className="mt-10 grid gap-10 lg:grid-cols-[250px_1fr]">
        <Suspense>
          <Filters />
        </Suspense>

        <section aria-labelledby="results-heading">
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line pb-4">
            <h1 id="results-heading" className="text-3xl font-semibold capitalize-first">{heading}</h1>
            <p className="text-sm text-slate">{result.total.toLocaleString("en-IN")} {result.total === 1 ? "job" : "jobs"}</p>
          </div>

          {result.rows.length === 0 ? (
            <div className="py-20 text-center">
              <p className="font-display text-2xl font-semibold">No jobs match these filters</p>
              <p className="mt-2 text-slate">Try a broader role name, another city, or clear a filter.</p>
              <Link href="/jobs" className="btn-ghost mt-6">Clear search</Link>
            </div>
          ) : (
            <div>
              {result.rows.map((j) => (
                <JobRow key={j.id} job={j} saved={savedIds.has(j.id)} />
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
