import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { connections } from "@/db/schema";
import { apiUser, error, json } from "@/lib/api";
import { RELATIONSHIPS } from "@/lib/referrals/store";

const patch = z.object({ relationship: z.enum(RELATIONSHIPS).nullable() });

/** Mark how you know someone (alumni, ex colleague...). It changes ranking and the draft. */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { user, res } = await apiUser();
  if (!user) return res;
  const { id } = await ctx.params;
  const parsed = patch.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return error("Choose how you know them");
  const [row] = await db.update(connections).set({ relationship: parsed.data.relationship, updatedAt: new Date() })
    .where(and(eq(connections.id, id), eq(connections.userId, user.id))).returning({ id: connections.id });
  return row ? json({ ok: true }) : error("Not found", 404);
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { user, res } = await apiUser();
  if (!user) return res;
  const { id } = await ctx.params;
  const [row] = await db.delete(connections).where(and(eq(connections.id, id), eq(connections.userId, user.id))).returning({ id: connections.id });
  return row ? json({ ok: true }) : error("Not found", 404);
}
