/*
 * Classify companies that have no company type yet (new aggregator companies, new imports), using the
 * seed list, the curated lists and the countries they hire in. `npm run companies:enrich` refines this
 * monthly with Wikidata. Admin choices are never touched.
 */
import { eq, isNull, ne, and, sql } from "drizzle-orm";
import { db } from "@/db";
import { companies } from "@/db/schema";
import { classifyCompany } from "@/lib/company-type";
import { companyKey } from "@/lib/referrals/company";
import seeds from "@/config/companySeeds.json";

const host = (u?: string | null) => {
  try {
    return u ? new URL(u).hostname.replace(/^www\./, "").toLowerCase() : null;
  } catch {
    return null;
  }
};
const seedByKey = new Map(seeds.map((s) => [companyKey(s.name), s]));
const seedByHost = new Map(seeds.map((s) => [host(s.website), s]));

export function seedForCompany(name: string, website?: string | null) {
  return seedByKey.get(companyKey(name)) ?? seedByHost.get(host(website)) ?? null;
}

export async function classifyUnclassified(limit = 5000): Promise<number> {
  const rows = await db
    .select({ id: companies.id, name: companies.name, website: companies.website, industry: companies.industry })
    .from(companies)
    .where(and(isNull(companies.companyType), ne(companies.ats, "MANUAL")))
    .limit(limit);
  if (!rows.length) return 0;
  const countryRows = await db.execute<{ company_id: string; countries: string[] }>(
    sql`SELECT company_id, array_agg(DISTINCT country) AS countries FROM jobs WHERE closed_at IS NULL AND country IS NOT NULL GROUP BY company_id`,
  );
  const countriesBy = new Map(countryRows.rows.map((r) => [r.company_id, r.countries]));
  for (const c of rows) {
    const seed = seedForCompany(c.name, c.website);
    const r = classifyCompany({ name: c.name, industry: c.industry ?? seed?.industry, seedSize: seed?.size, seedHq: seed?.hqCountry, jobCountries: countriesBy.get(c.id) ?? [] });
    await db.update(companies).set(r).where(eq(companies.id, c.id));
  }
  return rows.length;
}
