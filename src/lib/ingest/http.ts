/*
 * Polite HTTP for every crawler connector.
 *
 *  - Sends our HireFlowBot user agent with a contact email.
 *  - Reads and obeys robots.txt for every host before the first request (cached per process).
 *  - At most one request per second per host (CRAWL_HOST_INTERVAL_MS to change).
 *  - Retries timeouts, 429 and 5xx with exponential backoff, honouring Retry-After.
 *  - Stops talking to a host after repeated failures for the rest of the run (circuit breaker).
 */

export const crawlerUserAgent = () =>
  `HireFlowBot/1.0 (+${process.env.NEXT_PUBLIC_APP_URL ?? "https://hireflow.ai"}/bot; ${process.env.CRAWLER_CONTACT_EMAIL ?? "crawler@hireflow.ai"})`;

/** The token we match against robots.txt user-agent lines. */
const BOT_TOKEN = "hireflowbot";

export class BlockedByRobotsError extends Error {
  constructor(url: string) {
    super(`robots.txt disallows ${url}`);
    this.name = "BlockedByRobotsError";
  }
}
export class HostUnavailableError extends Error {
  constructor(host: string) {
    super(`stopped crawling ${host} after repeated errors`);
    this.name = "HostUnavailableError";
  }
}
export class HttpError extends Error {
  constructor(public status: number, public url: string) {
    super(`${status} for ${url}`);
    this.name = "HttpError";
  }
}

// ── robots.txt ──────────────────────────────────────────────

type Rule = { allow: boolean; path: string };
export type Robots = { rules: Rule[]; sitemaps: string[] };

/**
 * Parse robots.txt and keep the rules for our bot: the group naming "hireflowbot" if there is one,
 * otherwise the "*" group. Consecutive user-agent lines share one group (RFC 9309).
 */
export function parseRobots(text: string): Robots {
  const sitemaps: string[] = [];
  const groups: { agents: string[]; rules: Rule[] }[] = [];
  let current: { agents: string[]; rules: Rule[] } | null = null;
  let lastWasAgent = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim();
    const m = line.match(/^([a-zA-Z-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const value = m[2].trim();
    if (key === "sitemap") {
      if (value) sitemaps.push(value);
      continue;
    }
    if (key === "user-agent") {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (!current) continue;
    if (key === "allow" || key === "disallow") {
      // "Disallow:" with no path allows everything, so it adds no rule.
      if (value) current.rules.push({ allow: key === "allow", path: value });
    }
  }
  const mine = groups.filter((g) => g.agents.some((a) => a !== "*" && BOT_TOKEN.includes(a.replace(/\/.*$/, ""))));
  const chosen = mine.length ? mine : groups.filter((g) => g.agents.includes("*"));
  return { rules: chosen.flatMap((g) => g.rules), sitemaps };
}

function ruleMatches(rulePath: string, path: string): number {
  // Supports "*" wildcards and a trailing "$" anchor. Returns the match length or -1.
  const anchored = rulePath.endsWith("$");
  const body = anchored ? rulePath.slice(0, -1) : rulePath;
  const re = new RegExp("^" + body.split("*").map((s) => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*") + (anchored ? "$" : ""));
  return re.test(path) ? body.length : -1;
}

/** Longest matching rule wins; on a tie, Allow wins. No matching rule means allowed. */
export function isAllowed(robots: Robots, pathAndQuery: string): boolean {
  let best: { len: number; allow: boolean } | null = null;
  for (const r of robots.rules) {
    const len = ruleMatches(r.path, pathAndQuery);
    if (len < 0) continue;
    if (!best || len > best.len || (len === best.len && r.allow)) best = { len, allow: r.allow };
  }
  return best ? best.allow : true;
}

const robotsCache = new Map<string, Promise<Robots>>();
const ALLOW_ALL: Robots = { rules: [], sitemaps: [] };
const DISALLOW_ALL: Robots = { rules: [{ allow: false, path: "/" }], sitemaps: [] };

async function loadRobots(origin: string): Promise<Robots> {
  try {
    const res = await throttled(origin, () =>
      fetch(`${origin}/robots.txt`, { headers: { "User-Agent": crawlerUserAgent() }, signal: AbortSignal.timeout(15_000), redirect: "follow", cache: "no-store" }),
    );
    // RFC 9309: 4xx means no restrictions; 5xx means assume complete disallow.
    if (res.status >= 500) return DISALLOW_ALL;
    if (!res.ok) return ALLOW_ALL;
    const text = await res.text();
    // Some hosts answer /robots.txt with an HTML page (a redirect to their home page). That is not a robots file.
    if (/^\s*</.test(text) && !/user-agent\s*:/i.test(text)) return ALLOW_ALL;
    return parseRobots(text);
  } catch {
    // Network failure while reading robots.txt: be conservative for this run.
    return DISALLOW_ALL;
  }
}

export function robotsFor(url: string): Promise<Robots> {
  const origin = new URL(url).origin;
  let p = robotsCache.get(origin);
  if (!p) {
    p = loadRobots(origin);
    robotsCache.set(origin, p);
  }
  return p;
}

export async function allowedByRobots(url: string) {
  const u = new URL(url);
  return isAllowed(await robotsFor(url), u.pathname + u.search);
}

// ── per host rate limit and circuit breaker ─────────────────

const hostInterval = () => Number(process.env.CRAWL_HOST_INTERVAL_MS ?? 1000);
const nextSlot = new Map<string, number>();
const failures = new Map<string, number>();
const MAX_HOST_FAILURES = 5;

async function throttled<T>(urlOrOrigin: string, fn: () => Promise<T>): Promise<T> {
  const host = new URL(urlOrOrigin).host;
  const now = Date.now();
  const slot = Math.max(now, nextSlot.get(host) ?? 0);
  nextSlot.set(host, slot + hostInterval());
  if (slot > now) await new Promise((r) => setTimeout(r, slot - now));
  return fn();
}

export function hostIsDown(url: string) {
  return (failures.get(new URL(url).host) ?? 0) >= MAX_HOST_FAILURES;
}

/** Test helper: forget robots, throttling and failure state. */
export function resetHttpState() {
  robotsCache.clear();
  nextSlot.clear();
  failures.clear();
}

// ── requests ────────────────────────────────────────────────

type RequestOptions = {
  method?: "GET" | "POST";
  body?: unknown;
  accept?: string;
  headers?: Record<string, string>;
  /** Skip the robots.txt check (only for documented public APIs whose host has no robots file meant for them). */
  ignoreRobots?: boolean;
  retries?: number;
  timeoutMs?: number;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** Base delay for retries: 1s, 2s, 4s... (CRAWL_BACKOFF_MS to change, e.g. 0 in tests). */
const backoff = (attempt: number) => Number(process.env.CRAWL_BACKOFF_MS ?? 1000) * 2 ** attempt;

export async function politeFetch(url: string, opts: RequestOptions = {}): Promise<Response> {
  const host = new URL(url).host;
  if (hostIsDown(url)) throw new HostUnavailableError(host);
  if (!opts.ignoreRobots && !(await allowedByRobots(url))) throw new BlockedByRobotsError(url);

  const retries = opts.retries ?? 3;
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await throttled(url, () =>
        fetch(url, {
          method: opts.method ?? "GET",
          headers: {
            "User-Agent": crawlerUserAgent(),
            Accept: opts.accept ?? "application/json",
            ...(opts.body !== undefined ? { "Content-Type": "application/json" } : {}),
            ...opts.headers,
          },
          body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
          signal: AbortSignal.timeout(opts.timeoutMs ?? 25_000),
          redirect: "follow",
          cache: "no-store",
        }),
      );
      if (res.status === 429 || res.status >= 500) {
        lastError = new HttpError(res.status, url);
        if (attempt < retries) {
          const retryAfter = Number(res.headers.get("retry-after"));
          await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter, 60) * 1000 : backoff(attempt));
          continue;
        }
        break;
      }
      failures.set(host, 0);
      return res;
    } catch (e) {
      lastError = e;
      if (attempt < retries) await sleep(backoff(attempt));
    }
  }
  failures.set(host, (failures.get(host) ?? 0) + 1);
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

export async function getJson<T>(url: string, opts: RequestOptions = {}): Promise<T> {
  const res = await politeFetch(url, opts);
  if (!res.ok) throw new HttpError(res.status, url);
  return (await res.json()) as T;
}

export async function postJson<T>(url: string, body: unknown, opts: RequestOptions = {}): Promise<T> {
  return getJson<T>(url, { ...opts, method: "POST", body });
}

export async function getText(url: string, opts: RequestOptions = {}): Promise<string> {
  const res = await politeFetch(url, { accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8", ...opts });
  if (!res.ok) throw new HttpError(res.status, url);
  return res.text();
}

/** Run tasks with a concurrency limit, keeping order of results. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i], i);
      }
    }),
  );
  return out;
}
