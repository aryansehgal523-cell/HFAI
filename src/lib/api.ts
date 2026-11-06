import { NextResponse } from "next/server";
import { getCurrentUser } from "./session";

export function json<T>(data: T, status = 200) {
  return NextResponse.json(data, { status });
}

export function error(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

/** Returns the signed in user or a 401 response. */
export async function apiUser() {
  const user = await getCurrentUser();
  if (!user) return { user: null, res: error("Sign in to continue", 401) } as const;
  return { user, res: null } as const;
}

// Simple in memory rate limiter (per server instance). Use Upstash or Redis in production.
const hits = new Map<string, { n: number; reset: number }>();
export function rateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const h = hits.get(key);
  if (!h || h.reset < now) {
    hits.set(key, { n: 1, reset: now + windowMs });
    return true;
  }
  h.n++;
  return h.n <= limit;
}
