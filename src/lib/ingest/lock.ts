/*
 * A database lock so two crawls never run at once (the GitHub Actions crawl, the Vercel top up, a manual
 * `npm run crawl`). It is a lease in crawl_state: the holder renews it every few minutes, and a crawl that
 * died leaves a lease that simply expires. Works through Supabase's connection pooler (unlike Postgres
 * advisory locks, which belong to a single connection).
 */
import crypto from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "@/db";

const LEASE_MS = 15 * 60_000;
const RENEW_MS = 5 * 60_000;

export async function acquireLock(name: string, owner: string, leaseMs = LEASE_MS): Promise<boolean> {
  const value = JSON.stringify({ owner, expiresAt: new Date(Date.now() + leaseMs).toISOString() });
  const out = await db.execute(sql`
    INSERT INTO crawl_state (key, value, updated_at) VALUES (${`lock:${name}`}, ${value}::jsonb, now())
    ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = now()
    WHERE (crawl_state.value->>'expiresAt')::timestamptz < now() OR crawl_state.value->>'owner' = ${owner}
    RETURNING key`);
  return out.rows.length > 0;
}

export async function releaseLock(name: string, owner: string) {
  await db.execute(sql`DELETE FROM crawl_state WHERE key = ${`lock:${name}`} AND value->>'owner' = ${owner}`);
}

/** Who holds the lock and until when (for the admin page and logs). */
export async function lockStatus(name: string): Promise<{ owner: string; expiresAt: string } | null> {
  const out = await db.execute<{ value: { owner: string; expiresAt: string } }>(sql`SELECT value FROM crawl_state WHERE key = ${`lock:${name}`}`);
  const v = out.rows[0]?.value;
  return v && Date.parse(v.expiresAt) > Date.now() ? v : null;
}

/**
 * Run fn while holding the lock, renewing the lease in the background. Returns { ran: false } when
 * another crawl holds it.
 */
export async function withLock<T>(name: string, label: string, fn: () => Promise<T>): Promise<{ ran: true; result: T } | { ran: false; heldBy: string | null }> {
  const owner = `${label}:${crypto.randomUUID().slice(0, 8)}`;
  if (!(await acquireLock(name, owner))) return { ran: false, heldBy: (await lockStatus(name))?.owner ?? null };
  const timer = setInterval(() => void acquireLock(name, owner).catch(() => {}), RENEW_MS);
  try {
    return { ran: true, result: await fn() };
  } finally {
    clearInterval(timer);
    await releaseLock(name, owner).catch(() => {});
  }
}
