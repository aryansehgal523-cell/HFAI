/* Connectors for the new job sources, tested against trimmed real payloads in tests/fixtures/ingest. */
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { mapWorkable, type WorkableResp } from "../src/lib/ingest/sources/workable";
import { mapRecruitee, type RecruiteeResp } from "../src/lib/ingest/sources/recruitee";
import { kekaPortalId, mapKeka, type KekaJob } from "../src/lib/ingest/sources/keka";
import { fetchWorkday, findIndiaFacet, mapWorkdayDetail, workdayPostedOn, type WorkdayDetailResp, type WorkdayListResp } from "../src/lib/ingest/sources/workday";
import { fetchSmartRecruiters, parseSrGroups, parseSrJobs } from "../src/lib/ingest/sources/smartrecruiters";
import { looksLikeJobUrl, parseSitemap, fetchJsonLd } from "../src/lib/ingest/sources/jsonld";
import { extractJsonLdJobPostings, mapJobPosting, microdataJobPosting } from "../src/lib/ingest/jobposting";
import { normalize } from "../src/lib/ingest/normalize";
import { resetHttpState } from "../src/lib/ingest/http";
import { fetchOracle, mapOracleDetail, oracleCountry, type OracleDetailResp } from "../src/lib/ingest/sources/oracle";

const fixture = (f: string) => readFileSync(path.join(__dirname, "fixtures/ingest", f), "utf8");
const json = <T,>(f: string) => JSON.parse(fixture(f)) as T;
const ctx = (over: Partial<{ known: Set<string>; maxDetails: number }> = {}) => ({ known: new Set<string>(), maxDetails: 50, log: () => {}, ...over });

// ── fake network for connector tests ────────────────────────
type Route = [RegExp, (url: string, init?: RequestInit) => { status?: number; body: string; type?: string }];
const realFetch = globalThis.fetch;
let requests: string[] = [];
function serve(routes: Route[]) {
  requests = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    requests.push(`${init?.method ?? "GET"} ${url}`);
    for (const [re, fn] of routes) {
      if (re.test(url)) {
        const r = fn(url, init);
        return new Response(r.body, { status: r.status ?? 200, headers: { "content-type": r.type ?? "application/json" } });
      }
    }
    return new Response("not found", { status: 404, headers: { "content-type": "text/plain" } });
  }) as typeof fetch;
}
beforeEach(() => {
  process.env.CRAWL_HOST_INTERVAL_MS = "0";
  process.env.CRAWL_BACKOFF_MS = "0";
  process.env.CRAWL_SCOPE = "india";
  resetHttpState();
});
afterEach(() => {
  globalThis.fetch = realFetch;
});

// ── Workable ────────────────────────────────────────────────
test("workable: a job listed once per country becomes one job with every location", () => {
  const data = json<WorkableResp>("workable.json");
  const jobs = mapWorkable(data);
  assert.equal(data.jobs.length, 3);
  assert.equal(jobs.length, 2);
  const first = jobs[0];
  assert.equal(first.externalId, data.jobs[0].shortcode);
  assert.match(first.location, /Philippines; Ukraine/);
  assert.equal(first.workMode, "REMOTE");
  assert.equal(first.applyUrl, data.jobs[0].url);
  assert.ok(first.postedAt instanceof Date);
});

test("workable: an Indian location wins the country even when it is not first", () => {
  const data = json<WorkableResp>("workable.json");
  data.jobs[1].locations = [{ country: "India", countryCode: "IN", city: "Pune", hidden: false }];
  assert.equal(mapWorkable(data)[0].country, "IN");
});

// ── Recruitee ───────────────────────────────────────────────
test("recruitee: maps offers with work mode, employment, dates and requirements", () => {
  const jobs = mapRecruitee(json<RecruiteeResp>("recruitee.json"));
  assert.equal(jobs.length, 2);
  const j = jobs[0];
  assert.equal(j.externalId, "2804401");
  assert.equal(j.country, "AT");
  assert.equal(j.workMode, "HYBRID");
  assert.equal(j.employment, "Full time");
  assert.equal(j.postedAt?.toISOString(), "2026-10-30T16:32:58.000Z");
  assert.match(j.descriptionHtml ?? "", /Requirements/);
  assert.match(j.applyUrl, /^https:\/\/careers\.bunq\.com\/o\//);
});

// ── Keka ────────────────────────────────────────────────────
test("keka: maps jobs to public job detail links with structured country and experience", () => {
  const jobs = mapKeka("jupiter", json<KekaJob[]>("keka.json"));
  assert.equal(jobs[0].applyUrl, "https://jupiter.keka.com/careers/jobdetails/145340");
  assert.equal(jobs[0].country, "IN");
  assert.equal(jobs[0].location, "Bengaluru, India");
  const n = normalize("c", jobs[0]);
  assert.equal(n.experienceMin, 5);
  assert.equal(n.experienceMax, 6);
});

test("keka: finds the portal id on the careers page", () => {
  const html = `<script>fetch('/ats/documents/b5279857-cf81-4dde-a215-fc48957ee2b5/careerportal/18096d20247d4ecfa4efcf04875cbda6.html')</script>`;
  assert.equal(kekaPortalId(html), "b5279857-cf81-4dde-a215-fc48957ee2b5");
  assert.equal(kekaPortalId("<html>Tenant not found</html>"), null);
});

// ── Workday ─────────────────────────────────────────────────
test("workday: finds the India facet in a nested facet tree", () => {
  const list = json<WorkdayListResp>("workday-list.json");
  assert.deepEqual(findIndiaFacet(list.facets), { parameter: "locationHierarchy1", id: "2fcb99c455831013ea52b82135ba3266" });
  assert.equal(findIndiaFacet([]), null);
});

test("workday: posted on text and detail mapping", () => {
  const now = new Date("2026-11-08T00:00:00Z");
  assert.equal(workdayPostedOn("Posted 15 Days Ago", now)?.toISOString(), "2026-10-24T00:00:00.000Z");
  assert.equal(workdayPostedOn("Posted 30+ Days Ago", now)?.toISOString(), "2026-10-09T00:00:00.000Z");
  assert.equal(workdayPostedOn("Posted Today", now)?.getTime(), now.getTime());
  const d = json<WorkdayDetailResp>("workday-detail.json");
  const j = mapWorkdayDetail("nvidia.wd5.myworkdayjobs.com", "NVIDIAExternalCareerSite", "/job/India-Bengaluru/x_JR1", d);
  assert.equal(j.country, "IN");
  assert.match(j.location, /India, Bengaluru/);
  assert.equal(j.applyUrl, d.jobPostingInfo.externalUrl);
  assert.equal(j.postedAt?.toISOString().slice(0, 10), d.jobPostingInfo.startDate);
  // Site codes like "PUN MIC T 4" or "GA - Alpharetta" name no country; Workday's own country field does.
  const coded = structuredClone(d);
  coded.jobPostingInfo.location = "GA - Alpharetta";
  coded.jobPostingInfo.additionalLocations = [];
  coded.jobPostingInfo.country = { descriptor: "United States of America" };
  assert.equal(mapWorkdayDetail("t.wd5.myworkdayjobs.com", "S", "/job/x", coded).country, "US");
});

test("workday connector: applies the India facet, skips known jobs and respects the detail cap", async () => {
  const list = json<WorkdayListResp>("workday-list.json");
  const detail = fixture("workday-detail.json");
  const bodies: unknown[] = [];
  serve([
    [/robots\.txt$/, () => ({ body: "User-agent: *\nAllow: /NVIDIAExternalCareerSite/\nDisallow: /talentcommunity/", type: "text/plain" })],
    [/\/jobs$/, (_u, init) => {
      const body = JSON.parse(String(init?.body));
      bodies.push(body);
      const facetOn = Object.keys(body.appliedFacets).length > 0;
      if (!facetOn) return { body: JSON.stringify({ ...list, total: 2000 }) };
      return { body: JSON.stringify({ total: 3, jobPostings: body.offset === 0 ? list.jobPostings : [] }) };
    }],
    [/\/job\//, () => ({ body: detail })],
  ]);
  const known = new Set([list.jobPostings[0].externalPath]);
  const r = await fetchWorkday("nvidia", { dc: "wd5", sites: ["NVIDIAExternalCareerSite"] }, ctx({ known, maxDetails: 1 }));
  assert.deepEqual((bodies[1] as { appliedFacets: unknown }).appliedFacets, { locationHierarchy1: ["2fcb99c455831013ea52b82135ba3266"] }, "second request filters to India");
  assert.deepEqual(r.stillListed, [list.jobPostings[0].externalPath]);
  assert.equal(r.jobs.length, 1, "one detail request allowed");
  assert.equal(r.deferred, 1, "the rest waits for the next run");
  assert.equal(r.complete, true);
  assert.ok(requests.every((q) => !q.includes("talentcommunity")));
});

// ── SmartRecruiters ─────────────────────────────────────────
test("smartrecruiters: parses location groups, counts and the show more value", () => {
  const { groups, groupPages } = parseSrGroups(fixture("smartrecruiters-groups.html"), "WesternDigital");
  assert.equal(groupPages, 4);
  assert.equal(groups[0].location, "Amphoe Si Maha Phot, Thailand");
  assert.equal(groups[0].qty, 13);
  assert.equal(groups[0].moreValue, "Amphoe Si Maha Phot, TH");
  assert.ok(groups[0].jobs.length >= 5);
  assert.match(groups[0].jobs[0].id, /^\d+$/);
  assert.equal(groups[0].jobs[0].title, "Technician 3, Engineering");
});

test("smartrecruiters: reads the job page microdata", () => {
  const md = microdataJobPosting(fixture("smartrecruiters-job.html"));
  assert.ok(md);
  const raw = mapJobPosting(md!, "https://jobs.smartrecruiters.com/Experian/1");
  assert.equal(raw?.title, "TECHNICAL LEADER ECS");
  assert.equal(raw?.country, "CO");
  assert.equal(raw?.postedAt?.toISOString(), "2026-09-28T14:20:59.994Z");
  assert.ok((raw?.descriptionHtml ?? "").length > 500);
  assert.ok(!/Apply Now|st-apply/i.test(normalize("c", raw!).description.slice(-200)));
});

test("smartrecruiters connector: only opens groups in India and only new jobs", async () => {
  const groups = fixture("smartrecruiters-groups.html").replace(/Amphoe Si Maha Phot, Thailand/, "Bengaluru, India");
  const job = fixture("smartrecruiters-job.html").replace(/content="Colombia"/, 'content="India"').replace(/content="Bogotá"/, 'content="Bengaluru"');
  serve([
    [/robots\.txt$/, () => ({ status: 404, body: "", type: "text/plain" })],
    [/careers\.smartrecruiters\.com\/WesternDigital$/, () => ({ body: groups.replace('data-groups-pages="4"', 'data-groups-pages="1"'), type: "text/html" })],
    [/\/api\/more\?type=location&value=Amphoe/, () => ({ body: "", type: "text/html" })],
    [/jobs\.smartrecruiters\.com\/WesternDigital\/\d+/, () => ({ body: job, type: "text/html" })],
  ]);
  const listed = parseSrJobs(groups, "WesternDigital");
  const r = await fetchSmartRecruiters("WesternDigital", {}, ctx({ known: new Set([listed[0].id]) }));
  assert.ok(r.stillListed.includes(listed[0].id));
  assert.ok(r.jobs.length > 0);
  assert.ok(r.jobs.every((j) => j.country === "IN"));
  assert.ok(!requests.some((q) => /value=BangPa/.test(q)), "Thailand groups are not expanded");
  assert.ok(!requests.some((q) => /api\.smartrecruiters\.com/.test(q)), "the API host is never called");
});

// ── JSON-LD ─────────────────────────────────────────────────
test("json-ld: extracts and maps a real JobPosting", () => {
  const html = fixture("jsonld-job.html");
  const postings = extractJsonLdJobPostings(html);
  assert.equal(postings.length, 1);
  const raw = mapJobPosting(postings[0], "https://careers.unilever.com/en/job/hoboken/x/34155/98710441728", new Date("2026-11-08"));
  assert.equal(raw?.title, "Associate Director Operations, Wild");
  assert.equal(raw?.country, "US");
  assert.equal(raw?.postedAt?.toISOString().slice(0, 10), "2026-11-07");
  assert.equal(raw?.salary, null, "empty salary blocks are ignored");
});

test("json-ld: @graph, arrays, expired postings and remote jobs", () => {
  const html = `<script type="application/ld+json">{"@graph":[{"@type":"Organization"},{"@type":["JobPosting"],"title":"Data Analyst &amp; BI","datePosted":"2026-11-01","validThrough":"2027-01-01","jobLocationType":"TELECOMMUTE","applicantLocationRequirements":{"@type":"Country","name":"India"},"baseSalary":{"currency":"INR","value":{"minValue":600000,"maxValue":900000,"unitText":"YEAR"}}}]}</script>
    <script type="application/ld+json">{"@type":"JobPosting","title":"Old job","validThrough":"2020-01-01"}</script>`;
  const postings = extractJsonLdJobPostings(html);
  assert.equal(postings.length, 2);
  const now = new Date("2026-11-08");
  const a = mapJobPosting(postings[0], "https://x.com/jobs/1", now)!;
  assert.equal(a.title, "Data Analyst & BI");
  assert.equal(a.workMode, "REMOTE");
  assert.equal(a.country, "IN");
  assert.deepEqual(a.salary, { min: 600000, max: 900000, currency: "INR", period: "YEAR" });
  assert.equal(mapJobPosting(postings[1], "https://x.com/jobs/2", now), null, "expired");
});

test("json-ld: sitemap index and url sets", () => {
  const index = `<?xml version="1.0"?><sitemapindex><sitemap><loc>https://c.com/sitemap-jobs.xml</loc></sitemap><sitemap><loc>https://c.com/sitemap-blog.xml</loc></sitemap></sitemapindex>`;
  assert.deepEqual(parseSitemap(index).sitemaps, ["https://c.com/sitemap-jobs.xml", "https://c.com/sitemap-blog.xml"]);
  const set = `<urlset><url><loc>https://c.com/job/123</loc><lastmod>2026-11-01</lastmod></url><url><loc><![CDATA[https://c.com/about?a=1&amp;b=2]]></loc></url></urlset>`;
  const pages = parseSitemap(set).pages;
  assert.equal(pages.length, 2);
  assert.equal(pages[1].loc, "https://c.com/about?a=1&b=2");
});

test("json-ld: which URLs look like job pages", () => {
  assert.ok(looksLikeJobUrl("https://careers.unilever.com/en/job/hoboken/associate-director-operations-wild/34155/98710441728"));
  assert.ok(looksLikeJobUrl("https://careers.adobe.com/us/en/job/R171207/Enterprise-Sales-Account-Executive"));
  assert.ok(looksLikeJobUrl("https://acme.com/careers/jobs/senior-backend-engineer-bengaluru"));
  assert.ok(!looksLikeJobUrl("https://jobs.bosch.com/de/dataprotection-notice/"), "host name alone is not enough");
  assert.ok(!looksLikeJobUrl("https://acme.com/careers/"));
  assert.ok(!looksLikeJobUrl("https://acme.com/jobs/search"));
});

test("json-ld connector: opens new pages, remembers non job pages and Indian URLs go first", async () => {
  const jobHtml = fixture("jsonld-job.html");
  serve([
    [/robots\.txt$/, () => ({ body: "User-agent: *\nDisallow: /private/\nSitemap: https://careers.acme.com/sitemap.xml", type: "text/plain" })],
    [/sitemap\.xml$/, () => ({
      type: "application/xml",
      body: `<urlset><url><loc>https://careers.acme.com/job/london/analyst/1/1001</loc></url><url><loc>https://careers.acme.com/job/bengaluru/analyst/1/1002</loc></url><url><loc>https://careers.acme.com/job/pune/not-a-job-page/1/1003</loc></url><url><loc>https://careers.acme.com/private/job/x/1/1004</loc></url></urlset>`,
    })],
    [/1002$|1001$/, () => ({ body: jobHtml, type: "text/html" })],
    [/1003$/, () => ({ body: "<html>no data</html>", type: "text/html" })],
  ]);
  const r = await fetchJsonLd("careers.acme.com", {}, ctx({ maxDetails: 2 }));
  const opened = requests.filter((q) => /\/job\//.test(q)).map((q) => q.replace(/^GET /, ""));
  assert.deepEqual(opened, ["https://careers.acme.com/job/bengaluru/analyst/1/1002", "https://careers.acme.com/job/pune/not-a-job-page/1/1003"], "India first, then the cap");
  assert.deepEqual(r.skipped, ["https://careers.acme.com/job/pune/not-a-job-page/1/1003"]);
  assert.equal(r.jobs.length, 1);
  assert.equal(r.deferred, 1, "the London page waits for the next run");
  assert.ok(!requests.some((q) => q.includes("/private/")), "robots.txt is obeyed");
});

// ── Oracle Recruiting Cloud ─────────────────────────────────
test("oracle: maps a requisition detail with description sections and the public job link", () => {
  const d = json<OracleDetailResp>("oracle-detail.json").items[0];
  const j = mapOracleDetail("fa-etvl-saasfaprod1.fa.ocs.oraclecloud.com", "CX_1", d);
  assert.equal(j.externalId, "153747");
  assert.equal(j.title, "Web QA");
  assert.equal(j.country, "IN");
  assert.equal(j.applyUrl, "https://fa-etvl-saasfaprod1.fa.ocs.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_1/job/153747");
  assert.ok(normalize("c", j).description.length > 300);
  assert.equal(oracleCountry({ PrimaryLocationCountry: "US", secondaryLocations: [{ CountryCode: "IN" }] }), "IN");
});

test("oracle connector: lists, skips jobs outside India before opening them, keeps known jobs", async () => {
  const list = fixture("oracle-list.json");
  const detail = json<OracleDetailResp>("oracle-detail.json");
  serve([
    [/robots\.txt$/, () => ({ status: 404, body: "<html>Not Found</html>", type: "text/html" })],
    [/recruitingCEJobRequisitions\?/, (u) => ({ body: /offset=0/.test(u) ? list : JSON.stringify({ items: [{ TotalJobsCount: 3, requisitionList: [] }] }) })],
    [/recruitingCEJobRequisitionDetails/, (u) => {
      const id = decodeURIComponent(u).match(/Id="(\d+)"/)![1];
      return { body: JSON.stringify({ items: [{ ...detail.items[0], Id: id }] }) };
    }],
  ]);
  const r = await fetchOracle("fa-etvl-saasfaprod1.fa.ocs.oraclecloud.com", { sites: ["CX_1"] }, ctx({ known: new Set(["149051"]) }));
  assert.deepEqual(r.stillListed, ["149051"]);
  assert.deepEqual(r.jobs.map((j) => j.externalId), ["153747"]);
  assert.ok(!requests.some((q) => q.includes("141171")), "the US job is never opened");
});
