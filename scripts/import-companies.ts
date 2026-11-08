/*
 * Import detected companies into the crawl list:   npm run companies:import [-- data/detected-companies.json] [--crawl]
 *
 * Adds new companies and updates existing ones. A company that already exists under the same name
 * (slug) with a different hiring system is moved to the newly detected one: that means it switched
 * systems (for example Postman moving from Greenhouse to Workday). Demo (MANUAL) companies are never touched.
 * --crawl runs a crawl of the imported companies afterwards.
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "../src/db";
import { companies } from "../src/db/schema";
import { runCrawl } from "../src/lib/ingest/run";
import { ATS_VALUES, type Ats, type AtsConfig } from "../src/lib/ingest/types";
import { slugify } from "../src/lib/utils";

type Detected = {
  name: string; website?: string; careersUrl?: string; industry?: string; hqCountry?: string; size?: string;
  ats: Ats; token: string; atsConfig?: AtsConfig;
};

async function main() {
  const file = process.argv.slice(2).find((a) => !a.startsWith("--")) ?? "data/detected-companies.json";
  const list = JSON.parse(readFileSync(file, "utf8")) as Detected[];
  let added = 0, updated = 0, moved = 0, skipped = 0;
  const ids: string[] = [];

  for (const d of list) {
    if (!ATS_VALUES.includes(d.ats) || d.ats === "MANUAL" || d.ats === "AGGREGATOR") {
      skipped++;
      continue;
    }
    const fields = {
      name: d.name, website: d.website ?? null, careersUrl: d.careersUrl ?? null, industry: d.industry ?? null,
      size: d.size ?? null, atsConfig: d.atsConfig ?? {}, active: true,
    };
    const [sameBoard] = await db.select().from(companies).where(and(eq(companies.ats, d.ats), eq(companies.atsToken, d.token)));
    if (sameBoard) {
      await db.update(companies).set({ ...fields, name: sameBoard.name }).where(eq(companies.id, sameBoard.id));
      ids.push(sameBoard.id);
      updated++;
      continue;
    }
    const slug = slugify(d.name);
    const [sameName] = await db.select().from(companies).where(eq(companies.slug, slug));
    if (sameName && sameName.ats !== "MANUAL" && sameName.ats !== "AGGREGATOR") {
      await db
        .update(companies)
        .set({ ...fields, name: sameName.name, ats: d.ats, atsToken: d.token, lastCrawlStatus: null, lastCrawlError: null, consecutiveFailures: 0 })
        .where(eq(companies.id, sameName.id));
      ids.push(sameName.id);
      moved++;
      continue;
    }
    const [row] = await db
      .insert(companies)
      .values({ ...fields, slug: sameName ? `${slug}-${d.ats.toLowerCase()}` : slug, ats: d.ats, atsToken: d.token })
      .onConflictDoNothing()
      .returning({ id: companies.id });
    if (row) {
      ids.push(row.id);
      added++;
    } else skipped++;
  }
  console.log(`Imported ${list.length}: ${added} added, ${updated} updated, ${moved} moved to a new hiring system, ${skipped} skipped`);

  if (process.argv.includes("--crawl") && ids.length) {
    const active = await db.select({ id: companies.id }).from(companies).where(and(inArray(companies.id, ids), eq(companies.active, true)));
    const r = await runCrawl({ companyIds: active.map((a) => a.id), concurrency: 8, log: (m) => console.log(m) });
    console.log(`\nCrawl: ${r.companies} companies, ${r.jobsSeen} jobs, ${r.jobsNew} new, ${r.errors.length} errors`);
  }
}

main().then(() => process.exit(0), (e) => {
  console.error(e);
  process.exit(1);
});
