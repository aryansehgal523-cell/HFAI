import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { coachThreads } from "@/db/schema";
import { apiUser, error, json } from "@/lib/api";

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { user, res } = await apiUser();
  if (!user) return res;
  const { id } = await ctx.params;
  const [row] = await db.delete(coachThreads).where(and(eq(coachThreads.id, id), eq(coachThreads.userId, user.id))).returning({ id: coachThreads.id });
  return row ? json({ ok: true }) : error("Not found", 404);
}
