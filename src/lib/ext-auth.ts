import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { extensionTokens, users, type User } from "@/db/schema";
import { refreshCreditsIfDue } from "./credits";

export const sha256 = (s: string) => crypto.createHash("sha256").update(s).digest("hex");
export const newToken = () => `hfx_${crypto.randomBytes(32).toString("base64url")}`;

const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no 0/O, 1/I/L
export function newCode() {
  const bytes = crypto.randomBytes(8);
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
}
export const normaliseCode = (c: string) => c.toUpperCase().replace(/[^A-Z0-9]/g, "");

/**
 * CORS for /api/ext. Production: only chrome-extension://$EXTENSION_ID. Development: any
 * unpacked extension (their ids change), so the local test flow works without configuration.
 */
export function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") ?? "";
  const id = process.env.EXTENSION_ID;
  const allowed = id ? origin === `chrome-extension://${id}` : process.env.NODE_ENV !== "production" && origin.startsWith("chrome-extension://");
  if (!allowed) return { Vary: "Origin" };
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Max-Age": "600",
    Vary: "Origin",
  };
}

export function extJson(req: Request, data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: corsHeaders(req) });
}
export function extError(req: Request, message: string, status = 400) {
  return extJson(req, { error: message }, status);
}
export function extOptions(req: Request) {
  return new Response(null, { status: 204, headers: corsHeaders(req) });
}

/** The user behind an extension token, or null. Updates last used at most every 5 minutes. */
export async function extUser(req: Request): Promise<{ user: User; tokenId: string } | null> {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token.startsWith("hfx_") || token.length < 40) return null;
  const [row] = await db
    .select({ user: users, tokenId: extensionTokens.id, lastUsedAt: extensionTokens.lastUsedAt })
    .from(extensionTokens)
    .innerJoin(users, eq(users.id, extensionTokens.userId))
    .where(and(eq(extensionTokens.tokenHash, sha256(token)), isNull(extensionTokens.revokedAt)))
    .limit(1);
  if (!row) return null;
  if (!row.lastUsedAt || Date.now() - row.lastUsedAt.getTime() > 5 * 60_000) {
    await db.update(extensionTokens).set({ lastUsedAt: new Date() }).where(eq(extensionTokens.id, row.tokenId));
  }
  return { user: await refreshCreditsIfDue(row.user), tokenId: row.tokenId };
}
