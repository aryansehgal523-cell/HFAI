import type { MetadataRoute } from "next";
import { desc, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { jobs } from "@/db/schema";
import { absoluteUrl } from "@/lib/utils";

export const revalidate = 3600;

/** Search engines accept at most 50,000 URLs per sitemap; we split at 45,000 jobs. */
export const JOBS_PER_SITEMAP = 45_000;

async function openJobCount() {
  const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(jobs).where(isNull(jobs.closedAt)).catch(() => [{ n: 0 }]);
  return r?.n ?? 0;
}

/**
 * Sitemap files exist from build time, while jobs grow between deploys, so we always serve
 * MAX_SITEMAPS files (room for 450,000 jobs; an empty sitemap is valid). robots.txt, refreshed hourly,
 * lists only the files that currently hold jobs.
 */
export const MAX_SITEMAPS = 10;

export async function generateSitemaps() {
  return Array.from({ length: MAX_SITEMAPS }, (_, id) => ({ id }));
}

/** How many sitemap files currently have jobs in them (at least 1, for the static pages). */
export async function sitemapFilesInUse() {
  return Math.min(MAX_SITEMAPS, Math.max(1, Math.ceil((await openJobCount()) / JOBS_PER_SITEMAP)));
}

export default async function sitemap({ id }: { id: number }): Promise<MetadataRoute.Sitemap> {
  const statics = ["", "/jobs", "/pricing", "/about", "/contact", "/privacy", "/terms", "/refund", "/bot"].map((p) => ({
    url: absoluteUrl(p),
    changeFrequency: "weekly" as const,
    priority: p === "" ? 1 : 0.6,
  }));
  const open = await db
    .select({ id: jobs.id, lastSeenAt: jobs.lastSeenAt })
    .from(jobs)
    .where(isNull(jobs.closedAt))
    .orderBy(desc(jobs.postedAt), jobs.id)
    .limit(JOBS_PER_SITEMAP)
    .offset(Number(id) * JOBS_PER_SITEMAP)
    .catch(() => []);
  return [
    ...(Number(id) === 0 ? statics : []),
    ...open.map((j) => ({ url: absoluteUrl(`/jobs/${j.id}`), lastModified: j.lastSeenAt, changeFrequency: "daily" as const, priority: 0.8 })),
  ];
}
