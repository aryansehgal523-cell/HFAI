import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { companies } from "@/db/schema";
import { error, json } from "@/lib/api";
import { getCurrentUser } from "@/lib/session";
import { slugify } from "@/lib/utils";
import { runCrawl } from "@/lib/ingest/run";

const addSchema = z.object({
  action: z.literal("add"),
  name: z.string().min(2),
  ats: z.enum(["GREENHOUSE", "LEVER", "ASHBY"]),
  token: z.string().min(1).regex(/^[a-zA-Z0-9_.-]+$/),
  industry: z.string().optional(),
});
const toggleSchema = z.object({ action: z.literal("toggle"), id: z.string(), active: z.boolean() });
const crawlSchema = z.object({ action: z.literal("crawl"), id: z.string() });

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN") return error("Forbidden", 403);
  const body = await req.json().catch(() => ({}));

  const add = addSchema.safeParse(body);
  if (add.success) {
    const d = add.data;
    const [row] = await db
      .insert(companies)
      .values({ name: d.name, slug: slugify(d.name), ats: d.ats, atsToken: d.token, industry: d.industry })
      .onConflictDoNothing()
      .returning();
    if (!row) return error("That company or board token already exists", 409);
    const result = await runCrawl({ companyIds: [row.id] });
    return json({ company: row, crawl: result });
  }
  const toggle = toggleSchema.safeParse(body);
  if (toggle.success) {
    await db.update(companies).set({ active: toggle.data.active }).where(eq(companies.id, toggle.data.id));
    return json({ ok: true });
  }
  const crawl = crawlSchema.safeParse(body);
  if (crawl.success) return json(await runCrawl({ companyIds: [crawl.data.id] }));
  return error("Unknown action");
}
