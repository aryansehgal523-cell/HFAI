import { db } from "@/db";
import { extensionCodes } from "@/db/schema";
import { apiUser, error, json, rateLimit } from "@/lib/api";
import { newCode, sha256 } from "@/lib/ext-auth";

/** Settings: create a one time code to connect the Chrome extension (valid 10 minutes). */
export async function POST() {
  const { user, res } = await apiUser();
  if (!user) return res;
  if (!rateLimit(`ext-code:${user.id}`, 10, 60 * 60 * 1000)) return error("Too many codes. Try again later.", 429);
  const code = newCode();
  const expiresAt = new Date(Date.now() + 10 * 60_000);
  await db.insert(extensionCodes).values({ codeHash: sha256(code), userId: user.id, expiresAt });
  return json({ code: `${code.slice(0, 4)}-${code.slice(4)}`, expiresAt });
}
