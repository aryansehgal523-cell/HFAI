/* Phase 2: job search APIs, the query plan, quotas and cross source duplicates. */
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { adzuna, jooble, mapAdzuna, mapJooble, type AdzunaResp, type JoobleResp } from "../src/lib/ingest/aggregators/sources";
import { AGGREGATOR_LOCATIONS, ROLE_KEYWORDS, buildQueryPlan, queryKey } from "../src/lib/ingest/aggregators/queries";
import { callBudget, istDay } from "../src/lib/ingest/aggregators/run";
import { cityKey, dedupeKey, descriptionOverlap, isDuplicate, normalizeTitle, preferred } from "../src/lib/ingest/dedupe";
import { redactUrl, resetHttpState } from "../src/lib/ingest/http";
import { normalize } from "../src/lib/ingest/normalize";
import { SOURCE_ATTRIBUTION } from "../src/lib/sources";

const fixture = <T,>(f: string) => JSON.parse(readFileSync(path.join(__dirname, "fixtures/ingest", f), "utf8")) as T;
const realFetch = globalThis.fetch;
beforeEach(() => {
  process.env.CRAWL_HOST_INTERVAL_MS = "0";
  process.env.CRAWL_BACKOFF_MS = "0";
  resetHttpState();
});
afterEach(() => {
  globalThis.fetch = realFetch;
  for (const k of ["ADZUNA_APP_ID", "ADZUNA_APP_KEY", "JOOBLE_API_KEY"]) delete process.env[k];
});

// ── Adzuna ──────────────────────────────────────────────────
test("adzuna: maps results, keeps the redirect link, drops ads with no company", () => {
  const jobs = mapAdzuna(fixture<AdzunaResp>("adzuna.json"));
  assert.equal(jobs.length, 2);
  const j = jobs[0];
  assert.equal(j.externalId, "adzuna:4512398765");
  assert.equal(j.sourceJobId, "4512398765");
  assert.equal(j.companyName, "Infosys Limited");
  assert.equal(j.title, "Senior Java Developer", "HTML highlight tags removed");
  assert.equal(j.location, "Bengaluru, Karnataka");
  assert.equal(j.country, "IN");
  assert.match(j.applyUrl, /^https:\/\/www\.adzuna\.in\/land\/ad\//);
  assert.deepEqual(j.salary, { min: 1800000, max: 2600000, currency: "INR", period: "YEAR" });
  assert.equal(j.employment, "full time, permanent");
  assert.equal(j.department, "IT");
});

test("adzuna: estimated salaries are not shown as real ones", () => {
  const jobs = mapAdzuna(fixture<AdzunaResp>("adzuna.json"));
  assert.equal(jobs[1].salary, null);
  assert.equal(normalize("c", jobs[1]).experienceMin, 0, "fresher detected");
});

test("adzuna: India endpoint, keys, query and pacing; skipped without keys", async () => {
  assert.equal(adzuna.enabled(), false);
  process.env.ADZUNA_APP_ID = "id123";
  process.env.ADZUNA_APP_KEY = "secret456";
  assert.equal(adzuna.enabled(), true);
  let url = "";
  globalThis.fetch = (async (input: string | URL | Request) => {
    url = String(input);
    return new Response(JSON.stringify(fixture("adzuna.json")), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  const page = await adzuna.search({ keyword: "java developer", location: "Bengaluru" }, 2);
  const u = new URL(url);
  assert.equal(u.pathname, "/v1/api/jobs/in/search/2");
  assert.equal(u.searchParams.get("what"), "java developer");
  assert.equal(u.searchParams.get("where"), "Bengaluru");
  assert.equal(u.searchParams.get("results_per_page"), "50");
  assert.equal(page.total, 2);
  assert.ok(!url.includes("robots.txt"), "official API with our key: no robots request");
});

// ── Jooble ──────────────────────────────────────────────────
test("jooble: maps jobs, cleans titles and snippets", () => {
  const jobs = mapJooble(fixture<JoobleResp>("jooble.json"));
  assert.equal(jobs.length, 2);
  assert.equal(jobs[0].externalId, "jooble:-8732165498723");
  assert.equal(jobs[0].companyName, "Teleperformance");
  assert.equal(jobs[0].country, "IN");
  const n = normalize("c", jobs[0]);
  assert.ok(!n.description.includes("&nbsp;"));
  assert.equal(n.experienceMin, 0);
  assert.equal(n.experienceMax, 2);
});

test("jooble: POST with the key in the path; the key never appears in errors", async () => {
  process.env.JOOBLE_API_KEY = "jk-secret-789";
  let body: Record<string, string> = {};
  globalThis.fetch = (async (_i: unknown, init?: RequestInit) => {
    body = JSON.parse(String(init?.body));
    return new Response("rate limited", { status: 403 });
  }) as typeof fetch;
  await assert.rejects(jooble.search({ keyword: "teacher", location: "Pune" }, 1), (e: Error) => {
    assert.ok(!e.message.includes("jk-secret-789"), e.message);
    return true;
  });
  assert.deepEqual(body, { keywords: "teacher", location: "Pune, India", page: "1", ResultOnPage: "20" });
});

test("redactUrl hides keys in query strings and paths", () => {
  assert.equal(redactUrl("https://api.adzuna.com/v1/api/jobs/in/search/1?app_id=abc&app_key=xyz&what=java"), "https://api.adzuna.com/v1/api/jobs/in/search/1?app_id=***&app_key=***&what=java");
  assert.equal(redactUrl("https://in.jooble.org/api/1234-abcd"), "https://in.jooble.org/api/***");
});

// ── query plan and quotas ───────────────────────────────────
test("query plan: 150+ roles of every kind, top 40 cities and remote, interleaved", () => {
  assert.ok(ROLE_KEYWORDS.length >= 150, `${ROLE_KEYWORDS.length} keywords`);
  assert.equal(new Set(ROLE_KEYWORDS).size, ROLE_KEYWORDS.length, "no duplicates");
  for (const k of ["telesales", "accountant", "staff nurse", "teacher", "fresher", "internship", "bpo", "hr executive", "data analyst"]) assert.ok(ROLE_KEYWORDS.includes(k), k);
  assert.equal(AGGREGATOR_LOCATIONS.length, 41);
  assert.ok(AGGREGATOR_LOCATIONS.includes("Remote"));
  const plan = buildQueryPlan();
  assert.equal(plan.length, ROLE_KEYWORDS.length * 41);
  assert.equal(new Set(plan.map(queryKey)).size, plan.length);
  assert.deepEqual(plan.slice(0, 3).map((q) => q.location), ["Bengaluru", "Mumbai", "Delhi"], "consecutive queries cover different cities");
});

test("quota: an even share per run, never past the daily limit", () => {
  assert.equal(callBudget(250, 0, 4), 63);
  assert.equal(callBudget(250, 240, 4), 10);
  assert.equal(callBudget(250, 250, 4), 0);
  assert.equal(callBudget(500, 0, 1), 500);
  assert.equal(istDay(new Date("2026-11-09T20:00:00Z")), "2026-11-10", "IST is 5.5 hours ahead");
});

// ── duplicates ──────────────────────────────────────────────
test("dedupe: titles and cities normalise across sources", () => {
  assert.equal(normalizeTitle("Sr. Software Engineer II (Backend) - Remote"), "senior software engineer 2 backend");
  assert.equal(normalizeTitle("Senior Software Engineer 2, Backend"), "senior software engineer 2 backend");
  assert.equal(cityKey("Bangalore, KA"), "bengaluru");
  assert.equal(cityKey("Bengaluru, Karnataka, India"), "bengaluru");
  assert.equal(cityKey("Gurgaon"), "gurugram");
  assert.equal(dedupeKey("c1", "Sr. Java Developer", "Bangalore"), dedupeKey("c1", "Senior Java Developer", "Bengaluru, Karnataka"));
  assert.notEqual(dedupeKey("c1", "Java Developer", "Pune"), dedupeKey("c1", "Java Developer", "Bengaluru"));
  assert.notEqual(dedupeKey("c1", "Java Developer", "Pune"), dedupeKey("c2", "Java Developer", "Pune"));
});

test("dedupe: a snippet of the employer's description counts as the same job; different text does not", () => {
  const full = "We are hiring a Senior Java Developer with 5+ years of experience in Spring Boot, Kafka and microservices for our Bengaluru team. You will design and build payment APIs used by millions of customers every day.";
  const snippet = "Senior Java Developer with 5+ years of experience in Spring Boot, Kafka and microservices for our Bengaluru team...";
  const other = "Join our retail banking operations team to manage branch cash, KYC checks and customer onboarding in Mumbai.";
  assert.ok(descriptionOverlap(snippet, full) > 0.8);
  assert.ok(descriptionOverlap(other, full) < 0.3);
  const d = (desc: string, days: number, employer: boolean) => ({ id: desc.slice(0, 5), source: employer ? "workday" : "adzuna", postedAt: new Date(Date.UTC(2026, 10, 1 + days)), description: desc, isEmployerFeed: employer });
  assert.ok(isDuplicate(d(full, 0, true), d(snippet, 3, false)));
  assert.ok(!isDuplicate(d(full, 0, true), d(snippet, 12, false)), "more than 7 days apart");
  assert.ok(!isDuplicate(d(full, 0, true), d(other, 1, false)));
});

test("dedupe: keep the employer feed, otherwise the fullest description", () => {
  const emp = { id: "e", source: "workday", postedAt: new Date(), description: "short", isEmployerFeed: true };
  const agg = { id: "a", source: "adzuna", postedAt: new Date(), description: "a much longer description of the role", isEmployerFeed: false };
  const agg2 = { ...agg, id: "b", source: "jooble", description: "shorter text" };
  assert.equal(preferred(emp, agg).id, "e");
  assert.equal(preferred(agg2, agg).id, "a");
});

test("attribution: every aggregator has a label and link", () => {
  for (const id of ["adzuna", "jooble"]) {
    assert.match(SOURCE_ATTRIBUTION[id].label, /^Jobs by /);
    assert.match(SOURCE_ATTRIBUTION[id].href, /^https:\/\//);
  }
});

// ── monitoring ──────────────────────────────────────────────
test("monitor: alerts when a source loses more than half its jobs between crawls", async () => {
  const { sourceDropAlerts } = await import("../src/lib/ingest/monitor");
  const before = { workday: 6000, greenhouse: 2000, keka: 30, adzuna: 400 };
  const after = { workday: 5800, greenhouse: 700, keka: 2 };
  assert.deepEqual(sourceDropAlerts(before, after), [
    { source: "adzuna", before: 400, after: 0, dropPct: 100 },
    { source: "greenhouse", before: 2000, after: 700, dropPct: 65 },
  ]);
  assert.deepEqual(sourceDropAlerts(null, after), []);
});
