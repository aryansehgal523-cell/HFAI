import { z } from "zod";
import { headers } from "next/headers";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db } from "@/db";
import { extensionCodes, extensionTokens, users } from "@/db/schema";
import { rateLimit } from "@/lib/api";
import { extError, extJson, extOptions, newToken, normaliseCode, sha256 } from "@/lib/ext-auth";

const schema = z.object({ code: z.string().min(6).max(20), name: z.string().trim().max(80).default("Chrome") });

export const OPTIONS = extOptions;

/** The extension exchanges a one time code for a long lived token. */
export async function POST(req: Request) {
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0] ?? "local";
  if (!rateLimit(`ext-connect:${ip}`, 10, 10 * 60_000)) return extError(req, "Too many attempts. Wait a few minutes and try again.", 429);
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return extError(req, "Enter the 8 character code from HireFlow Settings.");
  const codeHash = sha256(normaliseCode(parsed.data.code));
  // Single use: claim the code atomically.
  const [claimed] = await db.update(extensionCodes).set({ usedAt: new Date() })
    .where(and(eq(extensionCodes.codeHash, codeHash), isNull(extensionCodes.usedAt), gt(extensionCodes.expiresAt, new Date())))
    .returning({ userId: extensionCodes.userId });
  if (!claimed) return extError(req, "That code is wrong or has expired. Create a new one in HireFlow Settings.", 401);
  const token = newToken();
  await db.insert(extensionTokens).values({ userId: claimed.userId, tokenHash: sha256(token), name: parsed.data.name || "Chrome" });
  const [u] = await db.select({ name: users.name, plan: users.plan }).from(users).where(eq(users.id, claimed.userId)).limit(1);
  return extJson(req, { token, user: u });
}
