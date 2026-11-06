/* Run a full crawl from the command line: `npm run crawl` */
import "dotenv/config";
import { runCrawl } from "../src/lib/ingest/run";

runCrawl({ concurrency: 4, log: (m) => console.log(m) })
  .then((r) => {
    console.log(`\nDone: ${r.companies} companies, ${r.jobsSeen} jobs seen, ${r.jobsNew} new, ${r.jobsClosed} closed, ${r.errors.length} errors`);
    process.exit(0);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
