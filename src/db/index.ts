import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

/*
 * The app always talks to PostgreSQL through DATABASE_URL:
 *  • Production: Neon, Supabase, RDS or any Postgres.
 *  • `npm run local`: scripts/local.ts starts a built in Postgres (PGlite) on your
 *    machine and sets DATABASE_URL for you, so no database install is needed.
 */
const globalForDb = globalThis as unknown as { pool?: Pool };

// node-postgres treats `sslmode=require` in the URL as strict verify-full, which overrides the
// `ssl` option below and rejects hosted providers' private CAs (e.g. Supabase). Strip it from the
// URL and apply TLS explicitly instead; the connection is still encrypted.
const rawUrl = process.env.DATABASE_URL;
const wantsSsl = /[?&]sslmode=(require|verify-ca|verify-full|prefer)\b/.test(rawUrl ?? "");
const connectionString = rawUrl?.replace(/([?&])sslmode=[^&]*&?/, "$1").replace(/[?&]$/, "");

const pool =
  globalForDb.pool ??
  new Pool({
    connectionString,
    max: Number(process.env.PG_POOL_MAX ?? 10),
    ssl: wantsSsl ? { rejectUnauthorized: false } : undefined,
  });

if (process.env.NODE_ENV !== "production") globalForDb.pool = pool;

export const db = drizzle(pool, { schema });
export { schema };
