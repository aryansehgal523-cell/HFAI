import { lt } from "drizzle-orm";
import { db } from "@/db";
import { usageEvents } from "@/db/schema";
import { runCrawl } from "@/lib/ingest/run";
import { withLock } from "@/lib/ingest/lock";
import { matchNewJobsForActiveUsers } from "@/lib/match-store";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

/**
 * Scheduled crawl. Vercel Cron sends "Authorization: Bearer $CRON_SECRET" automatically
 * (see vercel.json). Any other scheduler can call it with the same header.
 */
export async function GET(req: Request) {
  if (!process.env.CRON_SECRET || req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("unauthorized", { status: 401 });
  }
  // A small top up inside the function time limit; the big crawl runs in GitHub Actions (see README).
  // Skipped when the big crawl (GitHub Actions) or another top up holds the lock.
  const locked = await withLock("crawl", "vercel-cron", () => runCrawl({ concurrency: 6, timeBudgetMs: 180_000, maxDetails: 50, functionAiLimit: 200 }));
  const result = locked.ran ? locked.result : { skipped: `another crawl is running (${locked.heldBy ?? "unknown"})` };
  // Retention promised in the privacy policy: usage records are kept for 13 months.
  const cutoff = new Date(Date.now() - 395 * 24 * 60 * 60 * 1000);
  const purged = await db.delete(usageEvents).where(lt(usageEvents.createdAt, cutoff)).returning({ id: usageEvents.id });
  const matched = await matchNewJobsForActiveUsers().catch((e) => ({ error: String(e) }));
  return Response.json({ ...result, usageEventsPurged: purged.length, matched });
}
