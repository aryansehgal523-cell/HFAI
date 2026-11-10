/*
 * Fill in job functions the keyword rules left empty, with the fast AI model in batches of 100 titles.
 * Skipped when ANTHROPIC_API_KEY is not set; capped per run so a big crawl can't run up a bill.
 */
import { and, asc, eq, gt, inArray, isNull } from "drizzle-orm";
import { db } from "@/db";
import { jobs } from "@/db/schema";
import { aiEnabled, classifyJobFunctions } from "@/lib/ai";
import { JOB_FUNCTIONS, functionByRules } from "@/lib/job-function";

const BATCH = 100;

export async function fillJobFunctions(opts: { maxJobs?: number; log?: (m: string) => void } = {}) {
  const log = opts.log ?? (() => {});
  const maxJobs = opts.maxJobs ?? Number(process.env.FUNCTION_AI_MAX_PER_RUN ?? 2000);

  // Rules first for rows stored before functions existed. Walk every unclassified open job by id
  // (keyset pagination), so titles the rules can't place don't stop the pass.
  let byRules = 0;
  let after = "";
  for (;;) {
    const rows = await db.select({ id: jobs.id, title: jobs.title, department: jobs.department }).from(jobs)
      .where(and(isNull(jobs.jobFunction), isNull(jobs.closedAt), gt(jobs.id, after)))
      .orderBy(asc(jobs.id))
      .limit(5000);
    if (!rows.length) break;
    after = rows[rows.length - 1].id;
    const placed = rows.map((r) => ({ id: r.id, f: functionByRules(r.title, r.department) })).filter((r) => r.f);
    for (const f of JOB_FUNCTIONS) {
      const ids = placed.filter((p) => p.f === f).map((p) => p.id);
      for (let i = 0; i < ids.length; i += 1000) await db.update(jobs).set({ jobFunction: f }).where(inArray(jobs.id, ids.slice(i, i + 1000)));
    }
    byRules += placed.length;
  }

  if (!aiEnabled()) {
    log(`  functions: ${byRules} by rules; AI step skipped (no ANTHROPIC_API_KEY)`);
    return { byRules, byAi: 0, tokens: 0 };
  }
  let byAi = 0, tokens = 0;
  while (byAi < maxJobs) {
    const rows = await db.select({ id: jobs.id, title: jobs.title, department: jobs.department }).from(jobs)
      .where(and(isNull(jobs.jobFunction), isNull(jobs.closedAt))).limit(Math.min(BATCH, maxJobs - byAi));
    if (!rows.length) break;
    try {
      const r = await classifyJobFunctions(rows, JOB_FUNCTIONS);
      tokens += r.inputTokens + r.outputTokens;
      for (let i = 0; i < rows.length; i++) await db.update(jobs).set({ jobFunction: r.functions[i] }).where(eq(jobs.id, rows[i].id));
      byAi += rows.length;
    } catch (e) {
      log(`  functions: AI batch failed, will retry next run: ${e instanceof Error ? e.message : e}`);
      break;
    }
  }
  log(`  functions: ${byRules} by rules, ${byAi} by AI (${Math.round(tokens / 1000)}k tokens)`);
  return { byRules, byAi, tokens };
}
