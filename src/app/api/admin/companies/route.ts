import { z } from "zod";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { companies } from "@/db/schema";
import { error, json } from "@/lib/api";
import { getCurrentUser } from "@/lib/session";
import { slugify } from "@/lib/utils";
import { runCrawl } from "@/lib/ingest/run";
import { detectCompany } from "@/lib/ingest/detect";
import { FEEDS, parseToken } from "@/lib/ingest/tokens";
import { COMPANY_TYPES, classifyCompany } from "@/lib/company-type";
import { companyKey } from "@/lib/referrals/company";
import seeds from "@/config/companySeeds.json";

const seedFor = (name: string, website: string | null) => {
  const k = companyKey(name);
  const host = website ? website.replace(/^https?:\/\/(www\.)?/, "").split("/")[0] : null;
  return seeds.find((s) => companyKey(s.name) === k || (host && s.website.includes(host))) ?? null;
};

export const maxDuration = 300;

const addSchema = z.object({
  action: z.literal("add"),
  name: z.string().trim().min(2).max(120),
  ats: z.enum(FEEDS),
  token: z.string().trim().min(1).max(200),
  industry: z.string().trim().max(80).optional(),
});
const detectSchema = z.object({ action: z.literal("detect"), name: z.string().trim().min(2).max(120), careersUrl: z.string().url().max(500) });
const toggleSchema = z.object({ action: z.literal("toggle"), id: z.string(), active: z.boolean() });
const crawlSchema = z.object({ action: z.literal("crawl"), id: z.string() });
const classifySchema = z.object({ action: z.literal("classify"), id: z.string(), type: z.enum([...COMPANY_TYPES, "AUTO"]) });
const bulkSchema = z.object({ action: z.literal("bulk"), op: z.enum(["crawl", "deactivate", "activate"]), ids: z.array(z.string()).min(1).max(2000) });

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN") return error("Forbidden", 403);
  const body = await req.json().catch(() => ({}));

  const add = addSchema.safeParse(body);
  if (add.success) {
    const d = add.data;
    const parsed = parseToken(d.ats, d.token);
    if (!parsed) return error(d.ats === "WORKDAY" ? "Workday needs tenant.wdN/Site, e.g. nvidia.wd5/NVIDIAExternalCareerSite" : "That token doesn't look right");
    const [row] = await db
      .insert(companies)
      .values({ name: d.name, slug: slugify(d.name), ats: d.ats, atsToken: parsed.token, atsConfig: parsed.config, industry: d.industry })
      .onConflictDoNothing()
      .returning();
    if (!row) return error("That company or board token already exists", 409);
    const result = await runCrawl({ companyIds: [row.id], timeBudgetMs: 240_000 });
    return json({ company: row, crawl: result });
  }

  const detect = detectSchema.safeParse(body);
  if (detect.success) {
    const { name, careersUrl } = detect.data;
    const r = await detectCompany({ name, careersUrl, website: new URL(careersUrl).origin });
    if (!r.found) {
      return error(
        r.darwinbox
          ? `This company uses Darwinbox (${r.darwinbox}.darwinbox.in), which has no public job feed we can read.`
          : "No supported hiring system or JobPosting data found on that careers page.",
        404,
      );
    }
    const f = r.found;
    const [row] = await db
      .insert(companies)
      .values({ name, slug: slugify(name), ats: f.ats, atsToken: f.token, atsConfig: f.config, careersUrl: r.careersPage ?? careersUrl, website: new URL(careersUrl).origin })
      .onConflictDoNothing()
      .returning();
    if (!row) return error(`Found ${f.ats.toLowerCase()}/${f.token}, but that company or board is already in the list`, 409);
    const result = await runCrawl({ companyIds: [row.id], timeBudgetMs: 200_000 });
    return json({ company: row, crawl: result });
  }

  const toggle = toggleSchema.safeParse(body);
  if (toggle.success) {
    await db.update(companies).set({ active: toggle.data.active }).where(eq(companies.id, toggle.data.id));
    return json({ ok: true });
  }

  const crawl = crawlSchema.safeParse(body);
  if (crawl.success) return json(await runCrawl({ companyIds: [crawl.data.id], timeBudgetMs: 240_000 }));

  const classify = classifySchema.safeParse(body);
  if (classify.success) {
    const { id, type } = classify.data;
    const [c] = await db.select().from(companies).where(eq(companies.id, id));
    if (!c) return error("Company not found", 404);
    if (type === "AUTO") {
      // Hand the company back to the automatic rules (seed data and lists; `npm run companies:enrich` adds Wikidata).
      const seed = seedFor(c.name, c.website);
      const r = classifyCompany({ name: c.name, industry: c.industry ?? seed?.industry, seedSize: seed?.size, seedHq: seed?.hqCountry, jobCountries: [] });
      await db.update(companies).set(r).where(eq(companies.id, id));
      return json({ ok: true, classification: r });
    }
    // An admin choice wins over every automatic rule; MNC, GCC and Indian large groups count as MNCs.
    const isMnc = type === "MNC" || type === "GCC" || type === "INDIAN_LARGE";
    await db.update(companies).set({ companyType: type, isMnc, classifiedBy: "admin" }).where(eq(companies.id, id));
    return json({ ok: true });
  }

  const bulk = bulkSchema.safeParse(body);
  if (bulk.success) {
    const { op, ids } = bulk.data;
    if (op === "crawl") {
      // Stays inside the function time limit; the result says how many are still pending.
      return json(await runCrawl({ companyIds: ids, concurrency: 8, timeBudgetMs: 240_000 }));
    }
    const out = await db.update(companies).set({ active: op === "activate" }).where(inArray(companies.id, ids)).returning({ id: companies.id });
    return json({ updated: out.length });
  }
  return error("Unknown action");
}
