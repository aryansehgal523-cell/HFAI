import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { tailorings, type ResumeData } from "@/db/schema";
import { apiUser, error, json } from "@/lib/api";

const schema = z.object({
  resume: z.looseObject({}).optional(),
  coverLetter: z.string().max(10000).optional(),
});

/** Save the user's manual edits to a tailored resume or cover letter (free). */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { user, res } = await apiUser();
  if (!user) return res;
  const { id } = await ctx.params;
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return error("Invalid request");
  const set: Partial<{ resume: ResumeData; coverLetter: string }> = {};
  if (parsed.data.resume) set.resume = parsed.data.resume as unknown as ResumeData;
  if (parsed.data.coverLetter !== undefined) set.coverLetter = parsed.data.coverLetter;
  const [row] = await db
    .update(tailorings)
    .set(set)
    .where(and(eq(tailorings.id, id), eq(tailorings.userId, user.id)))
    .returning({ id: tailorings.id });
  if (!row) return error("Not found", 404);
  return json({ ok: true });
}
