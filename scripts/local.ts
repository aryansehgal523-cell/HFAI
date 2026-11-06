/*
 * One command to run HireFlow on your computer:   npm run local
 *
 * If DATABASE_URL is set (in .env or your shell) it uses that PostgreSQL.
 * Otherwise it starts a built in PostgreSQL (PGlite) that saves to ./.data,
 * so you don't need to install a database. Then it applies migrations,
 * adds demo jobs the first time, and starts the site at http://localhost:3000.
 * Press Ctrl+C to stop everything.
 */
import "dotenv/config";
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import net from "node:net";
import path from "node:path";

const DATA_DIR = process.env.PGLITE_DIR ?? "./.data/pglite";
const DB_PORT = Number(process.env.LOCAL_DB_PORT ?? 54329);

function run(cmd: string, args: string[], env: NodeJS.ProcessEnv) {
  return new Promise<void>((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: "inherit", env, shell: process.platform === "win32" });
    p.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} ${args.join(" ")} exited with ${code}`))));
  });
}

function portFree(port: number) {
  return new Promise<boolean>((resolve) => {
    const s = net.createServer().once("error", () => resolve(false)).once("listening", () => s.close(() => resolve(true)));
    s.listen(port, "127.0.0.1");
  });
}

async function main() {
  const env = { ...process.env };
  let stopDb: (() => Promise<void>) | null = null;

  if (!env.DATABASE_URL?.startsWith("postgres")) {
    if (!(await portFree(DB_PORT))) {
      throw new Error(`Port ${DB_PORT} is busy. Is HireFlow already running? Set LOCAL_DB_PORT to use another port.`);
    }
    const { PGlite } = await import("@electric-sql/pglite");
    const { PGLiteSocketServer } = await import("@electric-sql/pglite-socket");
    mkdirSync(DATA_DIR, { recursive: true });
    const pg = await PGlite.create(DATA_DIR);
    const server = new PGLiteSocketServer({ db: pg, port: DB_PORT, host: "127.0.0.1", maxConnections: 20 });
    await server.start();
    env.DATABASE_URL = `postgres://postgres:postgres@127.0.0.1:${DB_PORT}/postgres`;
    env.PG_POOL_MAX = "5";
    console.log(`\n  Built in database running (data saved in ${DATA_DIR})\n`);
    stopDb = async () => {
      await server.stop();
      await pg.close();
    };
  }

  const tsx = ["npx", ["tsx"]] as const;
  await run(tsx[0], [...tsx[1], "scripts/migrate.ts"], env);
  await run(tsx[0], [...tsx[1], "scripts/seed.ts", "--if-empty"], env);

  const port = env.PORT ?? "3000";
  console.log(`\n  HireFlow AI is starting at http://localhost:${port}\n`);
  // Start Next directly (not through npx) so stopping this script stops the site too.
  const nextBin = path.join(process.cwd(), "node_modules", "next", "dist", "bin", "next");
  const next = spawn(process.execPath, [nextBin, "dev", "-p", port], { stdio: "inherit", env });

  let stopping = false;
  const shutdown = async () => {
    if (stopping) return;
    stopping = true;
    if (next.exitCode === null) {
      next.kill("SIGTERM");
      await new Promise((r) => next.once("exit", r));
    }
    if (stopDb) await stopDb().catch(() => {});
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  next.on("exit", (code) => {
    if (!stopping && code) console.error(`\n  The site stopped (exit code ${code}). Is port ${port} already in use? Try PORT=3001 npm run local\n`);
    shutdown();
  });
}

main().catch((e) => {
  console.error(`\n  Could not start HireFlow: ${e instanceof Error ? e.message : e}\n`);
  process.exit(1);
});
