import { and, desc, eq, ilike, isNull, or, sql } from "drizzle-orm";
import { headers } from "next/headers";
import { db } from "@/db";
import { companies, jobs } from "@/db/schema";
import { SKILL_VOCAB, prettySkill } from "@/lib/ats";
import { error, rateLimit } from "@/lib/api";

export type Suggestion = { type: "title" | "company" | "skill" | "location"; label: string; count?: number };

/** Autocomplete for the job search box: matching titles, companies, skills and cities. */
export async function GET(req: Request) {
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0] ?? "local";
  if (!rateLimit(`suggest:${ip}`, 120, 60_000)) return error("Too many requests", 429);

  const url = new URL(req.url);
  const field = url.searchParams.get("field") === "location" ? "location" : "q";
  const q = (url.searchParams.get("q") ?? "").trim().slice(0, 60).replace(/[%_]/g, "");
  if (q.length < 2) return Response.json({ suggestions: [] });
  const like = `%${q}%`;
  const open = and(isNull(jobs.closedAt), sql`${jobs.ghostScore} <= 40`);

  let suggestions: Suggestion[];
  if (field === "location") {
    const rows = await db
      .select({ label: jobs.location, count: sql<number>`count(*)::int` })
      .from(jobs)
      .where(and(open, or(ilike(jobs.location, like), sql`${q} <% ${jobs.location}`)))
      .groupBy(jobs.location)
      .orderBy(desc(sql`max(word_similarity(${q}, ${jobs.location}))`), desc(sql`count(*)`))
      .limit(6);
    suggestions = rows.map((r) => ({ type: "location", ...r }));
  } else {
    const [titles, cos] = await Promise.all([
      db
        .select({ label: jobs.title, count: sql<number>`count(*)::int` })
        .from(jobs)
        .where(and(open, or(ilike(jobs.title, like), sql`${q} <% ${jobs.title}`)))
        .groupBy(jobs.title)
        .orderBy(desc(sql`max(word_similarity(${q}, ${jobs.title}))`), desc(sql`count(*)`))
        .limit(5),
      db
        .select({ label: companies.name, count: sql<number>`count(${jobs.id})::int` })
        .from(companies)
        .innerJoin(jobs, eq(jobs.companyId, companies.id))
        .where(and(open, ilike(companies.name, like)))
        .groupBy(companies.name)
        .limit(3),
    ]);
    const lower = q.toLowerCase();
    const skills = SKILL_VOCAB.filter((s) => s.startsWith(lower) || s.includes(` ${lower}`)).slice(0, 3);
    suggestions = [
      ...titles.map((t) => ({ type: "title" as const, ...t })),
      ...cos.map((c) => ({ type: "company" as const, ...c })),
      ...skills.map((s) => ({ type: "skill" as const, label: prettySkill(s) })),
    ];
  }
  return Response.json({ suggestions }, { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } });
}
