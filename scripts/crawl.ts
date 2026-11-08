/*
 * Run a crawl from the command line:   npm run crawl [-- --limit 200] [--minutes 50] [--concurrency 8] [--details 300]
 *
 * Companies are crawled oldest crawl first, so repeated runs with --limit or --minutes work through
 * the whole list over time. Every company's result is saved on its row (see the admin page).
 */
import "dotenv/config";
import { runCrawl } from "../src/lib/ingest/run";

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? Number(process.argv[i + 1]) : undefined;
};

runCrawl({
  concurrency: arg("concurrency") ?? 8,
  limit: arg("limit"),
  timeBudgetMs: arg("minutes") ? arg("minutes")! * 60_000 : undefined,
  maxDetails: arg("details") ?? 300,
  log: (m) => console.log(m),
})
  .then((r) => {
    console.log(`\nDone: ${r.companies} companies, ${r.jobsSeen} jobs seen, ${r.jobsNew} new, ${r.jobsClosed} closed, ${r.errors.length} errors${r.pending ? `, ${r.pending} left for the next run` : ""}`);
    for (const [source, s] of Object.entries(r.stats)) console.log(`  ${source}: ${s.ok}/${s.companies} ok, ${s.jobsSeen} jobs, ${s.jobsNew} new`);
    process.exit(0);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
