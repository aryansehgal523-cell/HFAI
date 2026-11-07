import { and, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { companyAliases, connections, type Connection } from "@/db/schema";
import { DEFAULT_ALIASES, buildAliasMap, companyKey, matchingKeys, type AliasMap } from "./company";
import type { ParsedConnection } from "./connectionsCsv";

export const RELATIONSHIPS = ["alumni", "ex_colleague", "friend", "family", "other"] as const;
export type Relationship = (typeof RELATIONSHIPS)[number];
export const RELATIONSHIP_LABEL: Record<Relationship, string> = {
  alumni: "Alumni", ex_colleague: "Ex colleague", friend: "Friend", family: "Family", other: "Other",
};

// ─── Aliases (DB rows on top of the built in list), cached briefly per server instance ──
let aliasCache: { map: AliasMap; at: number } | null = null;
export async function loadAliasMap(): Promise<AliasMap> {
  if (aliasCache && Date.now() - aliasCache.at < 5 * 60_000) return aliasCache.map;
  const rows = await db.select({ alias: companyAliases.alias, canonical: companyAliases.canonical }).from(companyAliases);
  const map = buildAliasMap([...DEFAULT_ALIASES, ...rows.map((r) => [r.alias, r.canonical] as [string, string])]);
  aliasCache = { map, at: Date.now() };
  return map;
}

/**
 * Development only: pretend "now" is another date so follow ups can be tested without
 * waiting 5 days. Set HF_DEV_NOW=2026-11-20 or open /referrals?asOf=2026-11-20.
 */
export function referralNow(asOf?: string | null): Date {
  if (process.env.NODE_ENV !== "production") {
    const v = asOf || process.env.HF_DEV_NOW;
    if (v && !Number.isNaN(Date.parse(v))) return new Date(v);
  }
  return new Date();
}

const nameKey = (first: string, last: string) => `${first} ${last}`.toLowerCase().replace(/\s+/g, " ").trim();

/**
 * Insert or update connections. Rows with a LinkedIn URL are unique per URL; rows without
 * one are unique per name and company. Uploading the same file again updates in place.
 */
export async function importConnections(
  userId: string,
  parsed: ParsedConnection[],
  source: "linkedin_csv" | "alumni_csv" | "manual",
  relationship: Relationship | null = null,
) {
  const aliases = await loadAliasMap();
  const rows = parsed.map((p) => ({
    userId,
    firstName: p.firstName.slice(0, 80),
    lastName: p.lastName.slice(0, 120),
    nameKey: nameKey(p.firstName, p.lastName),
    profileUrl: p.profileUrl,
    email: p.email,
    company: p.company.slice(0, 160),
    companyKey: companyKey(p.company, aliases),
    position: p.position?.slice(0, 200) ?? null,
    connectedOn: p.connectedOn,
    relationship,
    batch: p.batch ?? null,
    source,
  })).filter((r) => r.companyKey);

  // One statement cannot update the same row twice, so de-duplicate first (last one wins).
  const withUrl = [...new Map(rows.filter((r) => r.profileUrl).map((r) => [r.profileUrl!, r])).values()];
  const noUrl = [...new Map(rows.filter((r) => !r.profileUrl).map((r) => [`${r.nameKey}|${r.companyKey}`, r])).values()];

  const CHUNK = 1000;
  for (let i = 0; i < withUrl.length; i += CHUNK) {
    await db.insert(connections).values(withUrl.slice(i, i + CHUNK)).onConflictDoUpdate({
      target: [connections.userId, connections.profileUrl],
      targetWhere: isNotNull(connections.profileUrl),
      set: {
        firstName: sql`excluded.first_name`, lastName: sql`excluded.last_name`, nameKey: sql`excluded.name_key`,
        email: sql`coalesce(excluded.email, ${connections.email})`, company: sql`excluded.company`, companyKey: sql`excluded.company_key`,
        position: sql`excluded.position`, connectedOn: sql`coalesce(excluded.connected_on, ${connections.connectedOn})`,
        // Keep a relationship the user set by hand unless this import states one.
        relationship: sql`coalesce(excluded.relationship, ${connections.relationship})`,
        batch: sql`coalesce(excluded.batch, ${connections.batch})`, updatedAt: new Date(),
      },
    });
  }
  for (let i = 0; i < noUrl.length; i += CHUNK) {
    await db.insert(connections).values(noUrl.slice(i, i + CHUNK)).onConflictDoUpdate({
      target: [connections.userId, connections.nameKey, connections.companyKey],
      targetWhere: isNull(connections.profileUrl),
      set: {
        email: sql`coalesce(excluded.email, ${connections.email})`, position: sql`excluded.position`,
        relationship: sql`coalesce(excluded.relationship, ${connections.relationship})`,
        batch: sql`coalesce(excluded.batch, ${connections.batch})`, updatedAt: new Date(),
      },
    });
  }
  return { imported: withUrl.length + noUrl.length, duplicatesMerged: rows.length - withUrl.length - noUrl.length };
}

/** company key → number of connections, for the whole network. */
export async function networkKeyCounts(userId: string) {
  const rows = await db
    .select({ key: connections.companyKey, n: sql<number>`count(*)::int` })
    .from(connections)
    .where(eq(connections.userId, userId))
    .groupBy(connections.companyKey);
  return new Map(rows.map((r) => [r.key, r.n]));
}

/** How many people the user knows at each of these companies (same matching as the job page). */
export async function networkCountsFor(userId: string, companyNames: string[]) {
  const [counts, aliases] = await Promise.all([networkKeyCounts(userId), loadAliasMap()]);
  const out = new Map<string, number>();
  if (counts.size === 0) return out;
  for (const name of new Set(companyNames)) {
    let n = 0;
    for (const k of matchingKeys(name, counts.keys(), aliases)) n += counts.get(k) ?? 0;
    if (n) out.set(name, n);
  }
  return out;
}

/** Everyone the user knows at one company. */
export async function networkAt(userId: string, companyName: string): Promise<Connection[]> {
  const [counts, aliases] = await Promise.all([networkKeyCounts(userId), loadAliasMap()]);
  const keys = [...matchingKeys(companyName, counts.keys(), aliases)];
  if (keys.length === 0) return [];
  return db.select().from(connections).where(and(eq(connections.userId, userId), inArray(connections.companyKey, keys)));
}

/** First initial and count only: what free users see. Names never leave the server for them. */
export function initialsPreview(people: { firstName: string }[], n = 3) {
  return people.slice(0, n).map((p) => (p.firstName[0] ?? "?").toUpperCase());
}
