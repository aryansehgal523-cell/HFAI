import { runCrawl } from "@/lib/ingest/run";

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
  const result = await runCrawl({ concurrency: 6 });
  return Response.json(result);
}
