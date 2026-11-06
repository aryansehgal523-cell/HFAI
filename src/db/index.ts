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

const pool =
  globalForDb.pool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    max: Number(process.env.PG_POOL_MAX ?? 10),
    ssl: process.env.DATABASE_URL?.includes("sslmode=require") ? { rejectUnauthorized: false } : undefined,
  });

if (process.env.NODE_ENV !== "production") globalForDb.pool = pool;

export const db = drizzle(pool, { schema });
export { schema };
