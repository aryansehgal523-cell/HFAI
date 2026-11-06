import type { MetadataRoute } from "next";
import { desc, isNull } from "drizzle-orm";
import { db } from "@/db";
import { jobs } from "@/db/schema";
import { absoluteUrl } from "@/lib/utils";

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const statics = ["", "/jobs", "/pricing", "/about", "/contact", "/privacy", "/terms", "/refund", "/bot"].map((p) => ({
    url: absoluteUrl(p),
    changeFrequency: "weekly" as const,
    priority: p === "" ? 1 : 0.6,
  }));
  const open = await db
    .select({ id: jobs.id, lastSeenAt: jobs.lastSeenAt })
    .from(jobs)
    .where(isNull(jobs.closedAt))
    .orderBy(desc(jobs.postedAt))
    .limit(45000)
    .catch(() => []);
  return [
    ...statics,
    ...open.map((j) => ({ url: absoluteUrl(`/jobs/${j.id}`), lastModified: j.lastSeenAt, changeFrequency: "daily" as const, priority: 0.8 })),
  ];
}
