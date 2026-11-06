import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { applications } from "@/db/schema";
import { apiUser, error, json } from "@/lib/api";

const schema = z.object({
  status: z.enum(["SAVED", "APPLIED", "INTERVIEWING", "OFFER", "REJECTED", "HIDDEN"]).optional(),
  notes: z.string().max(5000).optional(),
});

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { user, res } = await apiUser();
  if (!user) return res;
  const { id } = await ctx.params;
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return error("Invalid request");
  const patch = {
    ...parsed.data,
    ...(parsed.data.status === "APPLIED" ? { appliedAt: new Date() } : {}),
  };
  const [row] = await db
    .update(applications)
    .set(patch)
    .where(and(eq(applications.id, id), eq(applications.userId, user.id)))
    .returning();
  if (!row) return error("Not found", 404);
  return json(row);
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { user, res } = await apiUser();
  if (!user) return res;
  const { id } = await ctx.params;
  await db.delete(applications).where(and(eq(applications.id, id), eq(applications.userId, user.id)));
  return json({ ok: true });
}
