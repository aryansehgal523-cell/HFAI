import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { extensionTokens } from "@/db/schema";
import { apiUser, json } from "@/lib/api";

/** Settings: connected browsers. */
export async function GET() {
  const { user, res } = await apiUser();
  if (!user) return res;
  const rows = await db.select({ id: extensionTokens.id, name: extensionTokens.name, lastUsedAt: extensionTokens.lastUsedAt, createdAt: extensionTokens.createdAt })
    .from(extensionTokens).where(and(eq(extensionTokens.userId, user.id), isNull(extensionTokens.revokedAt))).orderBy(desc(extensionTokens.createdAt));
  return json({ tokens: rows });
}
