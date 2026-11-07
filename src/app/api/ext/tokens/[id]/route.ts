import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { extensionTokens } from "@/db/schema";
import { apiUser, error, json } from "@/lib/api";

/** Settings: revoke a connected browser. */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { user, res } = await apiUser();
  if (!user) return res;
  const { id } = await ctx.params;
  const [row] = await db.update(extensionTokens).set({ revokedAt: new Date() })
    .where(and(eq(extensionTokens.id, id), eq(extensionTokens.userId, user.id))).returning({ id: extensionTokens.id });
  return row ? json({ ok: true }) : error("Not found", 404);
}
