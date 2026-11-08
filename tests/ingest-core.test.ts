/* Polite HTTP (robots.txt, retries, circuit breaker), location scope and hiring system detection. */
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { BlockedByRobotsError, HostUnavailableError, getJson, isAllowed, parseRobots, resetHttpState } from "../src/lib/ingest/http";
import { countryCode, detectCountry, inCrawlScope, isForeignRegion, jobInScope, locationLooksInScope } from "../src/lib/ingest/geo";
import { legalName, parseAtsLinks, sameCompany, slugCandidates } from "../src/lib/ingest/detect";
import { decodeEntities, htmlToText, MAX_DESCRIPTION, normalize } from "../src/lib/ingest/normalize";
import { parseToken } from "../src/lib/ingest/tokens";

const realFetch = globalThis.fetch;
beforeEach(() => {
  process.env.CRAWL_HOST_INTERVAL_MS = "0";
  process.env.CRAWL_BACKOFF_MS = "0";
  resetHttpState();
});
afterEach(() => {
  globalThis.fetch = realFetch;
});

// ── robots.txt ──────────────────────────────────────────────
test("robots: SmartRecruiters' API host admits only LinkedIn's bot, so we stay out", () => {
  const r = parseRobots("User-agent: LinkedInBot\nAllow: /v1/companies/\nUser-agent: *\nDisallow: /");
  assert.equal(isAllowed(r, "/v1/companies/Visa/postings"), false);
});

test("robots: Keka allows /careers only", () => {
  const r = parseRobots("User-agent: *\nDisallow: /\nAllow: /careers\nAllow: /careers/");
  assert.equal(isAllowed(r, "/careers/api/embedjobs/default/active/abc"), true);
  assert.equal(isAllowed(r, "/ats/documents/abc/careerportal/x.html"), false);
});

test("robots: Workday sites, sitemaps, wildcards and longest match", () => {
  const r = parseRobots(
    "Sitemap: https://nvidia.wd5.myworkdayjobs.com/NVIDIAExternalCareerSite/siteMap.xml\n\nUser-agent: *\nAllow: /NVIDIAExternalCareerSite/\nDisallow: /talentcommunity/\nDisallow: /*.pdf$\nDisallow: /a/\nAllow: /a/b",
  );
  assert.deepEqual(r.sitemaps, ["https://nvidia.wd5.myworkdayjobs.com/NVIDIAExternalCareerSite/siteMap.xml"]);
  assert.equal(isAllowed(r, "/wday/cxs/nvidia/NVIDIAExternalCareerSite/jobs"), true, "no rule matches");
  assert.equal(isAllowed(r, "/talentcommunity/join"), false);
  assert.equal(isAllowed(r, "/files/x.pdf"), false);
  assert.equal(isAllowed(r, "/files/x.pdf?y=1"), true, "$ anchors the end");
  assert.equal(isAllowed(r, "/a/b/c"), true, "longer allow wins");
  assert.equal(isAllowed(r, "/a/c"), false);
});

test("robots: a group naming our bot replaces the * group; empty Disallow allows all", () => {
  const r = parseRobots("User-agent: *\nDisallow: /\n\nUser-agent: HireFlowBot\nDisallow:");
  assert.equal(isAllowed(r, "/anything"), true);
});

// ── politeFetch ─────────────────────────────────────────────
function fakeFetch(handler: (url: string) => Response) {
  const calls: string[] = [];
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input instanceof Request ? input.url : input);
    calls.push(url);
    return handler(url);
  }) as typeof fetch;
  return calls;
}

test("http: refuses URLs robots.txt disallows, without requesting them", async () => {
  const calls = fakeFetch((u) => (u.endsWith("/robots.txt") ? new Response("User-agent: *\nDisallow: /private") : new Response("{}")));
  await assert.rejects(getJson("https://x.test/private/data"), BlockedByRobotsError);
  assert.deepEqual(calls, ["https://x.test/robots.txt"]);
});

test("http: sends our user agent with a contact email", async () => {
  let ua = "";
  globalThis.fetch = (async (_i: unknown, init?: RequestInit) => {
    ua = (init?.headers as Record<string, string>)["User-Agent"];
    return new Response("{}", { status: 200 });
  }) as typeof fetch;
  await getJson("https://ua.test/x");
  assert.match(ua, /^HireFlowBot\/1\.0 \(\+.*; .+@.+\)$/);
});

test("http: retries 5xx then succeeds; 404 is not retried", async () => {
  let n = 0;
  const calls = fakeFetch((u) => {
    if (u.endsWith("/robots.txt")) return new Response("", { status: 404 });
    if (u.endsWith("/flaky")) return ++n < 3 ? new Response("busy", { status: 503 }) : new Response('{"ok":true}');
    return new Response("missing", { status: 404 });
  });
  assert.deepEqual(await getJson("https://r.test/flaky"), { ok: true });
  await assert.rejects(getJson("https://r.test/missing"), /404/);
  assert.equal(calls.filter((c) => c.endsWith("/missing")).length, 1);
});

test("http: stops calling a host after repeated failures", async () => {
  const calls = fakeFetch((u) => (u.endsWith("/robots.txt") ? new Response("", { status: 404 }) : new Response("down", { status: 500 })));
  for (let i = 0; i < 5; i++) await assert.rejects(getJson(`https://down.test/p${i}`, { retries: 0 }));
  const before = calls.length;
  await assert.rejects(getJson("https://down.test/p9"), HostUnavailableError);
  assert.equal(calls.length, before, "no request once the host is marked down");
});

test("http: a 5xx robots.txt means stay out", async () => {
  fakeFetch((u) => (u.endsWith("/robots.txt") ? new Response("", { status: 503 }) : new Response("{}")));
  await assert.rejects(getJson("https://r5.test/x"), BlockedByRobotsError);
});

// ── location ────────────────────────────────────────────────
test("geo: detects India from cities, states and mixed lists", () => {
  for (const l of ["Bengaluru, Karnataka", "Gurgaon", "Remote, India", "Pune; London", "Navi Mumbai", "Hyderabad - Telangana", "India, Bengaluru"]) assert.equal(detectCountry(l), "IN", l);
});

test("geo: other countries, US states and words that only look like places", () => {
  assert.equal(detectCountry("Remote - US"), "US");
  assert.equal(detectCountry("Fremont, CA"), "US");
  assert.equal(detectCountry("NYC, NY, US"), "US");
  assert.equal(detectCountry("Taiwan, Taipei"), "TW");
  assert.equal(detectCountry("London, United Kingdom"), "GB");
  assert.equal(detectCountry("Indianapolis, Indiana"), "US");
  assert.equal(detectCountry("Remote"), null);
  assert.equal(detectCountry("Campus hiring"), null, "'us' inside a word does not count");
  assert.equal(countryCode("India"), "IN");
  assert.equal(countryCode("IND"), "IN");
  assert.equal(countryCode("United States of America"), "US");
});

test("geo: India scope keeps India and unknown, drops other countries", () => {
  assert.ok(inCrawlScope("IN", "india"));
  assert.ok(inCrawlScope(null, "india"));
  assert.ok(!inCrawlScope("US", "india"));
  assert.ok(inCrawlScope("US", "all"));
  assert.ok(locationLooksInScope("3 Locations", "india"));
  assert.ok(!locationLooksInScope("Kuala Lumpur, Malaysia", "india"));
});

test("geo: regions and abbreviations outside India are out of scope; APAC and India mixes stay", () => {
  for (const l of ["AMER", "Remote - EMEA", "SEA, SF", "EU", "Luxembourg", "Seattle"]) assert.ok(!jobInScope(detectCountry(l), l, "india"), l);
  for (const l of ["APAC", "Remote, India & APAC", "Singapore or Bengaluru", "Remote", "N/A"]) assert.ok(jobInScope(detectCountry(l), l, "india"), l);
  assert.ok(!isForeignRegion("Bengaluru, EMEA hub"), "an Indian place wins");
  assert.ok(jobInScope(null, "AMER", "all"));
});

test("normalize: title is the last resort for the country", () => {
  const n = normalize("c", { externalId: "1", title: "Account Executive, Bengaluru", location: "N/A", applyUrl: "https://x" });
  assert.equal(n.country, "IN");
});

// ── normalise ───────────────────────────────────────────────
test("normalize: numeric entities, escaped HTML, script tags and the description cap", () => {
  assert.equal(decodeEntities("Rock&#8217;n &amp; roll &#x20B9;5 &rupee;"), "Rock’n & roll ₹5 ₹");
  assert.equal(htmlToText("&lt;p&gt;Hello&lt;/p&gt;&lt;ul&gt;&lt;li&gt;One&lt;/li&gt;&lt;/ul&gt;"), "Hello\n• One");
  assert.equal(htmlToText("<style>p{}</style><p>Hi</p><script>x()</script>"), "Hi");
  const n = normalize("c", { externalId: "1", title: "T", location: "Remote", applyUrl: "https://x", descriptionText: "a".repeat(20000), country: "IN" });
  assert.equal(n.description.length, MAX_DESCRIPTION);
  assert.equal(n.country, "IN", "structured country wins over text");
});

// ── detection ───────────────────────────────────────────────
test("detect: finds hiring system links on a careers page", () => {
  const html = `
    <a href="https://boards.greenhouse.io/razorpaysoftwareprivatelimited">Jobs</a>
    <script src="https://boards.greenhouse.io/embed/job_board/js?for=groww"></script>
    <a href="https://jobs.lever.co/palantir/123">x</a>
    <a href="https://jobs.ashbyhq.com/notion">x</a>
    <a href="https://accenture.wd103.myworkdayjobs.com/en-US/AccentureCareers/job/1">x</a>
    <a href="https://accenture.wd103.myworkdayjobs.com/AvanadeCareers">x</a>
    <a href="https://mastercard.wd1.myworkdayjobs.com/Internal">internal</a>
    <a href="https://careers.smartrecruiters.com/Experian">x</a>
    <a href="https://apply.workable.com/remofirst/j/ABC">x</a>
    <a href="https://bunq.recruitee.com/o/x">x</a>
    <a href="https://jupiter.keka.com/careers">x</a>
    <a href="https://zeptonow.darwinbox.in/ms/candidate/careers">x</a>
    <a href="https://fa-etvl-saasfaprod1.fa.ocs.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_1/jobs?x=1">x</a>`;
  const found = parseAtsLinks(html);
  const key = (a: string) => found.filter((c) => c.ats === a).map((c) => c.token);
  assert.deepEqual(key("GREENHOUSE"), ["razorpaysoftwareprivatelimited", "groww"]);
  assert.deepEqual(key("LEVER"), ["palantir"]);
  assert.deepEqual(key("ASHBY"), ["notion"]);
  assert.deepEqual(found.find((c) => c.ats === "WORKDAY" && c.token === "accenture")?.config, { dc: "wd103", sites: ["AccentureCareers", "AvanadeCareers"] });
  assert.ok(!found.some((c) => c.token === "mastercard"), "internal career sites are skipped");
  assert.deepEqual(key("SMARTRECRUITERS"), ["Experian"]);
  assert.deepEqual(key("WORKABLE"), ["remofirst"]);
  assert.deepEqual(key("RECRUITEE"), ["bunq"]);
  assert.deepEqual(key("KEKA"), ["jupiter"]);
  assert.deepEqual(key("DARWINBOX"), ["zeptonow"]);
  assert.deepEqual(found.find((c) => c.ats === "ORACLE")?.config, { sites: ["CX_1"] });
});

test("detect: board tokens from the name and domain", () => {
  assert.deepEqual(slugCandidates("Razorpay Software Pvt Ltd", "https://razorpay.com"), ["razorpaysoftware", "razorpay-software", "razorpay"]);
  assert.deepEqual(slugCandidates("Western Digital", "https://www.westerndigital.com"), ["westerndigital", "western-digital", "western"]);
  assert.deepEqual(slugCandidates("Tata Consultancy Services", "https://tcs.com"), ["tataconsultancyservices", "tata-consultancy-services", "tataconsultancy", "tcs"]);
  assert.deepEqual(legalName("The Western Digital Corp."), "western digital");
});

test("detect: a probed board only counts when its name matches", () => {
  assert.ok(sameCompany("Stripe", "Stripe"));
  assert.ok(sameCompany("Razorpay Software Private Limited", "Razorpay"));
  assert.ok(sameCompany("Western Digital Corporation", "Western Digital"));
  assert.ok(!sameCompany("Clear Street", "Clear"), "short generic names need an exact match");
  assert.ok(!sameCompany("Western Union", "Western Digital"), "a shared first word is not enough");
  assert.ok(!sameCompany(undefined, "Acme"));
  assert.ok(sameCompany("Rubrik Job Board", "Rubrik"));
  assert.ok(sameCompany("HackerRank Careers", "HackerRank"));
  assert.ok(!sameCompany("McAfee Heating and Air Conditioning", "McAfee"));
});

test("admin tokens: Workday, JSON-LD and simple tokens", () => {
  assert.deepEqual(parseToken("WORKDAY", "https://nvidia.wd5.myworkdayjobs.com/en-US/NVIDIAExternalCareerSite"), { token: "nvidia", config: { dc: "wd5", sites: ["NVIDIAExternalCareerSite"] } });
  assert.deepEqual(parseToken("WORKDAY", "nvidia.wd5/NVIDIAExternalCareerSite"), { token: "nvidia", config: { dc: "wd5", sites: ["NVIDIAExternalCareerSite"] } });
  assert.equal(parseToken("WORKDAY", "nvidia"), null);
  assert.deepEqual(parseToken("JSONLD", "https://careers.unilever.com/"), { token: "careers.unilever.com", config: {} });
  assert.deepEqual(parseToken("SMARTRECRUITERS", "WesternDigital"), { token: "WesternDigital", config: {} });
  assert.deepEqual(parseToken("GREENHOUSE", "Stripe"), { token: "stripe", config: {} });
  assert.equal(parseToken("LEVER", "bad token!"), null);
  assert.deepEqual(parseToken("ORACLE", "https://fa-etvl-saasfaprod1.fa.ocs.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_1/jobs"), { token: "fa-etvl-saasfaprod1.fa.ocs.oraclecloud.com", config: { sites: ["CX_1"] } });
});
