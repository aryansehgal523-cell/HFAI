/*
 * Detect which hiring system each company uses:   npm run detect:ats [-- input] [--limit N] [--fresh]
 *
 * Input: src/config/companySeeds.json by default, or a .json file ([{ name, careersUrl, website? }])
 * or a .csv file with "name,careersUrl" lines.
 * Output (in data/):
 *   detected-companies.json   companies with a working connector and live jobs, ready for `npm run companies:import`
 *   detect-unmatched.json     companies we could not match, with what was tried, to add by hand
 *   detect-progress.jsonl     one line per company as it finishes; re-running skips these (use --fresh to start over)
 * --finalize only rebuilds the two output files from detect-progress.jsonl (with the checks below).
 * --retry-unmatched tries the companies that were not matched again (e.g. after adding a connector).
 *
 * Matches found by guessing a board token (not linked from the careers page) are checked again before
 * they are written out: the board's own name must match, and for Indian companies the feed must have
 * at least one job in India, so a same-named company elsewhere is not imported by mistake.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { detectCompany, legalName, sameCompany, type DetectResult, type SeedCompany } from "../src/lib/ingest/detect";
import { mapLimit } from "../src/lib/ingest/http";
import { fetchJobsFor } from "../src/lib/ingest/connectors";
import { normalize } from "../src/lib/ingest/normalize";

const OUT = path.resolve("data");
const PROGRESS = path.join(OUT, "detect-progress.jsonl");

function readInput(file: string): SeedCompany[] {
  const text = readFileSync(file, "utf8");
  if (file.endsWith(".csv")) {
    return text
      .split(/\r?\n/)
      .map((l) => l.split(",").map((s) => s.trim()))
      .filter(([name, url]) => name && /^https?:\/\//.test(url ?? ""))
      .map(([name, careersUrl, website]) => ({ name, careersUrl, website: website || new URL(careersUrl).origin }));
  }
  return (JSON.parse(text) as SeedCompany[]).map((s) => ({ ...s, website: s.website || new URL(s.careersUrl).origin }));
}

async function main() {
  const args = process.argv.slice(2);
  const input = args.find((a) => !a.startsWith("--") && !/^\d+$/.test(a)) ?? "src/config/companySeeds.json";
  const limitIdx = args.indexOf("--limit");
  const limit = limitIdx >= 0 ? Number(args[limitIdx + 1]) : undefined;
  mkdirSync(OUT, { recursive: true });
  if (args.includes("--fresh") && existsSync(PROGRESS)) rmSync(PROGRESS);

  const done = new Map<string, DetectResult>();
  if (existsSync(PROGRESS)) {
    for (const line of readFileSync(PROGRESS, "utf8").split("\n").filter(Boolean)) {
      const r = JSON.parse(line) as DetectResult;
      // --retry-unmatched: try companies that were not matched again (e.g. after adding a connector).
      if (!r.found && args.includes("--retry-unmatched")) done.delete(r.seed.name);
      else done.set(r.seed.name, r);
    }
  }
  const seeds = readInput(input).slice(0, limit);
  const todo = args.includes("--finalize") ? [] : seeds.filter((s) => !done.has(s.name));
  console.log(`${seeds.length} companies, ${done.size} already detected, ${todo.length} to go`);

  let n = 0;
  const started = Date.now();
  await mapLimit(todo, Number(process.env.DETECT_CONCURRENCY ?? 16), async (seed) => {
    let r: DetectResult;
    try {
      r = await detectCompany(seed);
    } catch (e) {
      r = { seed, found: null, tried: [`error: ${e instanceof Error ? e.message : e}`] };
    }
    done.set(seed.name, r);
    appendFileSync(PROGRESS, JSON.stringify(r) + "\n");
    n++;
    const f = r.found;
    console.log(
      `[${n}/${todo.length} ${Math.round((Date.now() - started) / 1000)}s] ${seed.name}: ${
        f ? `${f.ats.toLowerCase()}/${f.token} ${f.jobs} jobs${f.indiaJobs !== undefined ? ` (${f.indiaJobs} in India)` : ""}` : `not found${r.darwinbox ? " (Darwinbox)" : ""}`
      }`,
    );
  });

  const results = seeds.map((s) => done.get(s.name)).filter(Boolean) as DetectResult[];

  // Re-check guessed matches (see the note at the top).
  const rejected = new Map<string, string>();
  const guessed = results.filter((r) => r.found && !r.found.evidence.startsWith("linked from") && !r.found.evidence.startsWith("JobPosting"));
  console.log(`
Re-checking ${guessed.length} matches found by guessing a board token...`);
  // Read every job during the check (not just India), so we can see whether any is in India.
  const scopeBefore = process.env.CRAWL_SCOPE;
  process.env.CRAWL_SCOPE = "all";
  await mapLimit(guessed, 8, async (r) => {
    const f = r.found!;
    const host = new URL(r.seed.website).hostname.replace(/^www\./, "");
    const compact = legalName(r.seed.name).replace(/[^a-z0-9]/g, "");
    if (f.boardName ? !sameCompany(f.boardName, r.seed.name) : f.token.toLowerCase() !== compact && f.token.toLowerCase() !== host.split(".")[0]) {
      rejected.set(r.seed.name, `board "${f.boardName ?? f.token}" does not match the company name`);
      return;
    }
    if (r.seed.hqCountry === "IN") {
      if (f.ats === "WORKDAY" && f.indiaJobs !== undefined && f.indiaJobs > 0) return;
      try {
        const res = await fetchJobsFor(f.ats, f.token, f.config, { known: new Set(), maxDetails: 8, log: () => {} });
        const india = res.jobs.some((j) => normalize("x", j).country === "IN");
        if (!india) rejected.set(r.seed.name, `${f.ats.toLowerCase()}/${f.token} has no jobs in India, likely a different company`);
      } catch (e) {
        rejected.set(r.seed.name, `re-check failed: ${e instanceof Error ? e.message : e}`);
      }
    }
  });
  if (scopeBefore === undefined) delete process.env.CRAWL_SCOPE;
  else process.env.CRAWL_SCOPE = scopeBefore;
  for (const [name, why] of rejected) console.log(`  rejected ${name}: ${why}`);
  const found = results.filter((r) => r.found && !rejected.has(r.seed.name));

  // Two seeds can resolve to the same board (a group and its brand). Keep the seed whose name or domain
  // matches the board token, otherwise the first one.
  const byBoard = new Map<string, DetectResult>();
  const fits = (r: DetectResult) => {
    const t = r.found!.token.toLowerCase();
    return legalName(r.seed.name).replace(/[^a-z0-9]/g, "") === t || new URL(r.seed.website).hostname.replace(/^www\./, "").split(".")[0] === t;
  };
  for (const r of found) {
    const k = `${r.found!.ats}:${r.found!.token.toLowerCase()}`;
    const prev = byBoard.get(k);
    if (!prev || (!fits(prev) && fits(r))) byBoard.set(k, r);
  }
  const detected = [...byBoard.values()]
    .map((r) => ({
      name: r.seed.name,
      website: r.seed.website,
      careersUrl: r.careersPage ?? r.seed.careersUrl,
      industry: r.seed.industry,
      hqCountry: r.seed.hqCountry,
      size: r.seed.size,
      ats: r.found!.ats,
      token: r.found!.token,
      atsConfig: r.found!.config,
      jobs: r.found!.jobs,
      indiaJobs: r.found!.indiaJobs,
      evidence: r.found!.evidence,
    }));
  const unmatched = results
    .filter((r) => !r.found || rejected.has(r.seed.name))
    .map((r) => ({
      name: r.seed.name, website: r.seed.website, careersUrl: r.careersPage ?? r.seed.careersUrl, darwinbox: r.darwinbox,
      rejected: rejected.get(r.seed.name), tried: r.tried,
    }));

  writeFileSync(path.join(OUT, "detected-companies.json"), JSON.stringify(detected, null, 1) + "\n");
  writeFileSync(path.join(OUT, "detect-unmatched.json"), JSON.stringify(unmatched, null, 1) + "\n");
  const byAts = detected.reduce<Record<string, number>>((a, d) => ((a[d.ats] = (a[d.ats] ?? 0) + 1), a), {});
  console.log(`\nDetected ${detected.length} of ${results.length} companies:`, byAts);
  console.log(`Unmatched: ${unmatched.length} (see data/detect-unmatched.json)`);
}

main().then(() => process.exit(0), (e) => {
  console.error(e);
  process.exit(1);
});
