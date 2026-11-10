/*
 * Run a crawl from the command line:
 *   npm run crawl                                   employer feeds, then job search APIs (Adzuna, Jooble)
 *   npm run crawl -- --limit 200 --minutes 50 --concurrency 8 --details 300 --function-ai 2000
 *   npm run crawl -- --feeds-only | --aggregators-only [--calls 20]
 *
 * Only one crawl runs at a time (a lease in crawl_state); a second one exits straight away.
 * Companies are crawled oldest crawl first, so repeated runs with --limit or --minutes work through
 * the whole list over time and an interrupted run simply continues next time.
 * With GITHUB_STEP_SUMMARY set (GitHub Actions) a summary table is written to the job log.
 */
import "dotenv/config";
import { appendFileSync } from "node:fs";
import { recordAggregatorRun, runCrawl } from "../src/lib/ingest/run";
import { runAggregators } from "../src/lib/ingest/aggregators/run";
import { withLock } from "../src/lib/ingest/lock";

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? Number(process.argv[i + 1]) : undefined;
};
const flag = (name: string) => process.argv.includes(`--${name}`);
const summary: string[] = [];

async function crawl() {
  let runId: string | null = null;
  if (!flag("aggregators-only")) {
    const r = await runCrawl({
      concurrency: arg("concurrency") ?? 8,
      limit: arg("limit"),
      timeBudgetMs: arg("minutes") ? arg("minutes")! * 60_000 : undefined,
      maxDetails: arg("details") ?? 300,
      functionAiLimit: arg("function-ai"),
      log: (m) => console.log(m),
    });
    runId = r.runId;
    const line = `${r.companies} companies, ${r.jobsSeen} jobs seen, ${r.jobsNew} new, ${r.jobsClosed} closed, ${r.duplicatesRemoved} duplicates removed, ${r.errors.length} errors${r.pending ? `, ${r.pending} left for the next run` : ""}`;
    console.log(`\nEmployer feeds: ${line}`);
    summary.push(`### Employer feeds\n${line}\n`, "| Source | Companies OK | Failed | Jobs | New | Closed |", "| --- | --- | --- | --- | --- | --- |");
    for (const [source, s] of Object.entries(r.stats)) {
      console.log(`  ${source}: ${s.ok}/${s.companies} ok, ${s.jobsSeen} jobs, ${s.jobsNew} new`);
      summary.push(`| ${source} | ${s.ok}/${s.companies} | ${s.failed} | ${s.jobsSeen} | ${s.jobsNew} | ${s.jobsClosed} |`);
    }
    if (r.errors.length) summary.push(`\nFailing: ${r.errors.slice(0, 15).map((e) => `${e.company} (${e.error.slice(0, 80)})`).join("; ")}`);
  }
  if (!flag("feeds-only")) {
    console.log("\nJob search APIs:");
    const a = await runAggregators({ log: (m) => console.log(m), maxCalls: arg("calls") });
    await recordAggregatorRun(runId, a.sources);
    console.log(`  ${a.expired} aggregator jobs expired (30 days after posting)`);
    summary.push("\n### Job search APIs");
    for (const [id, s] of Object.entries(a.sources)) {
      summary.push(`- ${id}: ${s.skipped ? `skipped, ${s.skipped}` : `${s.calls} calls, ${s.jobsSeen} jobs, ${s.jobsNew} new, ${s.duplicates} duplicates, ${s.errors} errors`}`);
    }
  }
}

async function main() {
  const out = await withLock("crawl", process.env.GITHUB_RUN_ID ? `github-${process.env.GITHUB_RUN_ID}` : "cli", crawl);
  if (!out.ran) {
    console.log(`Another crawl is running (${out.heldBy ?? "unknown"}); nothing to do.`);
    summary.push(`Skipped: another crawl is running (${out.heldBy ?? "unknown"}).`);
  }
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## HireFlow crawl\n\n${summary.join("\n")}\n`);
}

main().then(() => process.exit(0), (e) => {
  console.error(e);
  process.exit(1);
});
