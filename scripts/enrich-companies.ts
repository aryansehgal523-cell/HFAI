/*
 * Classify every company for the MNC and company type filters:   npm run companies:enrich [-- --refresh] [--offline]
 *
 * 1. Wikidata facts (employee count, headquarters country) for each company, cached in
 *    data/wikidata-companies.json. Entries older than 30 days are fetched again (run monthly; --refresh
 *    refetches everything, --offline uses only the cache).
 * 2. Our seed list (src/config/companySeeds.json): size category and headquarters country.
 * 3. The countries each company is hiring in (open jobs).
 * 4. classifyCompany() in src/lib/company-type.ts. Companies an admin classified by hand are left alone.
 */
import "dotenv/config";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { eq, ne, sql } from "drizzle-orm";
import { db } from "../src/db";
import { companies } from "../src/db/schema";
import { classifyCompany } from "../src/lib/company-type";
import { companyKey } from "../src/lib/referrals/company";
import { chooseCandidate, queryWikidata, type WikidataCandidate, type WikidataFact } from "../src/lib/wikidata";
import seeds from "../src/config/companySeeds.json";

const CACHE = path.resolve("data/wikidata-companies.json");
const MAX_AGE_DAYS = 30;
const BATCH = 40;

type Cache = { updatedAt: string; companies: Record<string, WikidataFact | { none: true; fetchedAt: string }> };

const host = (u?: string | null) => {
  try {
    return u ? new URL(u).hostname.replace(/^www\./, "").toLowerCase() : null;
  } catch {
    return null;
  }
};
/** "Infosys Limited" → "Infosys": the label Wikidata is most likely to use. */
const plainName = (name: string) => name.replace(/[,.]?\s+(private limited|pvt\.? ltd\.?|limited|ltd\.?|inc\.?|llc|llp|plc|corp\.?|corporation|gmbh|ag|s\.?a\.?)$/i, "").trim();

async function main() {
  const refresh = process.argv.includes("--refresh");
  const offline = process.argv.includes("--offline");
  const cache: Cache = existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, "utf8")) : { updatedAt: "", companies: {} };

  const rows = await db.select().from(companies).where(ne(companies.ats, "MANUAL"));
  const seedByKey = new Map(seeds.map((s) => [companyKey(s.name), s]));
  const seedByHost = new Map(seeds.map((s) => [host(s.website), s]));
  const seedFor = (c: (typeof rows)[number]) => seedByKey.get(c.normalizedName ?? companyKey(c.name)) ?? seedByHost.get(host(c.website)) ?? null;

  // 1. Wikidata for companies not in the cache or with stale entries.
  const stale = (k: string) => {
    const e = cache.companies[k];
    return refresh || !e || Date.now() - Date.parse(e.fetchedAt) > MAX_AGE_DAYS * 86_400_000;
  };
  const todo = rows.filter((c) => stale(c.normalizedName ?? companyKey(c.name)));
  if (!offline && todo.length) {
    console.log(`Wikidata: looking up ${todo.length} companies...`);
    for (let i = 0; i < todo.length; i += BATCH) {
      const batch = todo.slice(i, i + BATCH);
      const labels = [...new Set(batch.flatMap((c) => [c.name, plainName(c.name)]))];
      let cands: WikidataCandidate[] = [];
      try {
        cands = await queryWikidata(labels);
      } catch (e) {
        console.log(`  batch ${i / BATCH + 1} failed: ${e instanceof Error ? e.message : e}`);
        continue;
      }
      const now = new Date().toISOString();
      for (const c of batch) {
        const mine = cands.filter((x) => x.name === c.name || x.name === plainName(c.name));
        const pick = chooseCandidate(mine, host(c.website) ?? host(seedFor(c)?.website));
        cache.companies[c.normalizedName ?? companyKey(c.name)] = pick
          ? { qid: pick.qid, employees: pick.employees, hqCountry: pick.hqCountry ?? pick.country, website: pick.websites[0] ?? null, fetchedAt: now }
          : { none: true, fetchedAt: now };
      }
      process.stdout.write(`  ${Math.min(i + BATCH, todo.length)}/${todo.length}\r`);
    }
    cache.updatedAt = new Date().toISOString();
    mkdirSync(path.dirname(CACHE), { recursive: true });
    writeFileSync(CACHE, JSON.stringify(cache, null, 1) + "\n");
    console.log(`\nWikidata cache saved (${Object.keys(cache.companies).length} companies)`);
  }

  // 3. Countries each company is hiring in.
  const countryRows = await db.execute<{ company_id: string; countries: string[] }>(
    sql`SELECT company_id, array_agg(DISTINCT country) AS countries FROM jobs WHERE closed_at IS NULL AND country IS NOT NULL GROUP BY company_id`,
  );
  const countriesBy = new Map(countryRows.rows.map((r) => [r.company_id, r.countries]));

  // 4. Classify.
  const counts: Record<string, number> = {};
  let mnc = 0, changed = 0;
  for (const c of rows) {
    const seed = seedFor(c);
    const wd = cache.companies[c.normalizedName ?? companyKey(c.name)];
    const result = classifyCompany({
      name: c.name,
      industry: c.industry ?? seed?.industry,
      seedSize: seed?.size ?? null,
      seedHq: seed?.hqCountry ?? null,
      wikidata: wd && !("none" in wd) ? wd : null,
      jobCountries: countriesBy.get(c.id) ?? [],
      current: { classifiedBy: c.classifiedBy, companyType: c.companyType ?? undefined, isMnc: c.isMnc, employeeCount: c.employeeCount, hqCountry: c.hqCountry },
    });
    counts[result.companyType] = (counts[result.companyType] ?? 0) + 1;
    if (result.isMnc) mnc++;
    if (result.classifiedBy === "admin") continue;
    if (c.companyType !== result.companyType || c.isMnc !== result.isMnc || c.employeeCount !== result.employeeCount || c.hqCountry !== result.hqCountry || c.classifiedBy !== result.classifiedBy) {
      await db.update(companies).set(result).where(eq(companies.id, c.id));
      changed++;
    }
  }
  console.log(`Classified ${rows.length} companies (${changed} changed): ${mnc} MNCs`, counts);
}

main().then(() => process.exit(0), (e) => {
  console.error(e);
  process.exit(1);
});
