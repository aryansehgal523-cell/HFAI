/* Run with: npm test */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mapAshby, mapGreenhouse, mapLever } from "../src/lib/ingest/connectors";
import { detectExperience, detectInrSalary, detectWorkMode, ghostScore, htmlToText, normalize } from "../src/lib/ingest/normalize";
import { atsScore } from "../src/lib/ats";
import { invoiceNumber } from "../src/lib/razorpay";

test("greenhouse payload maps and normalizes", () => {
  const raw = mapGreenhouse({
    jobs: [{
      id: 123, title: "Data Engineer", absolute_url: "https://boards.greenhouse.io/acme/jobs/123",
      updated_at: "2026-10-01T00:00:00Z", location: { name: "Bengaluru, India" },
      content: "&lt;p&gt;We need 3+ years with &lt;b&gt;Spark&lt;/b&gt; and SQL. Hybrid role.&lt;/p&gt;",
      departments: [{ name: "Data" }],
    }],
  });
  const n = normalize("c1", raw[0]);
  assert.equal(n.externalId, "123");
  assert.equal(n.country, "IN");
  assert.equal(n.workMode, "HYBRID");
  assert.equal(n.experienceMin, 3);
  assert.ok(n.skills.includes("spark"));
  assert.ok(!n.description.includes("<"));
});

test("lever payload maps work mode and salary", () => {
  const raw = mapLever([{
    id: "abc", text: "Backend Engineer", hostedUrl: "https://jobs.lever.co/acme/abc", createdAt: Date.now(),
    workplaceType: "remote", categories: { location: "Remote, India", commitment: "Full time", team: "Eng" },
    descriptionPlain: "Build APIs in Go.", salaryRange: { min: 1800000, max: 2600000, currency: "INR", interval: "per-year-salary" },
  }]);
  const n = normalize("c1", raw[0]);
  assert.equal(n.workMode, "REMOTE");
  assert.equal(n.salaryMin, 1800000);
  assert.equal(n.salaryPeriod, "YEAR");
});

test("ashby payload skips unlisted jobs", () => {
  const raw = mapAshby({
    jobs: [
      { id: "1", title: "ML Engineer", jobUrl: "https://jobs.ashbyhq.com/acme/1", workplaceType: "Hybrid", descriptionPlain: "PyTorch", isListed: true },
      { id: "2", title: "Hidden", jobUrl: "https://jobs.ashbyhq.com/acme/2", isListed: false },
    ],
  });
  assert.equal(raw.length, 1);
  assert.equal(raw[0].workMode, "HYBRID");
});

test("text helpers", () => {
  assert.equal(htmlToText("<p>Hi&amp;bye</p><li>One</li>"), "Hi&bye\n• One");
  assert.deepEqual(detectExperience("2 to 5 years of experience"), { min: 2, max: 5 });
  assert.deepEqual(detectExperience("Fresher role"), { min: 0, max: 1 });
  assert.deepEqual(detectInrSalary("CTC ₹12 to 18 LPA"), { min: 1200000, max: 1800000 });
  assert.equal(detectWorkMode("Pune", "This is a fully remote role"), "REMOTE");
});

test("ghost score rises with age and duplicates", () => {
  const fresh = ghostScore({ postedAt: new Date(), description: "x".repeat(800), applyUrl: "https://a.com", duplicates: 1 });
  const stale = ghostScore({ postedAt: new Date(Date.now() - 100 * 86_400_000), description: "short", applyUrl: "", duplicates: 4 });
  assert.equal(fresh, 0);
  assert.equal(stale, 100);
});

test("ats score counts matched keywords", () => {
  const r = atsScore("Built RAG apps in Python on AWS", "Need Python, AWS and Kubernetes");
  assert.deepEqual(r.missing, ["kubernetes"]);
  assert.equal(r.score, 67);
});

test("invoice numbers follow the Indian financial year", () => {
  assert.equal(invoiceNumber(42, new Date("2026-11-06")), "HF/2026-27/000042");
  assert.equal(invoiceNumber(7, new Date("2027-02-01")), "HF/2026-27/000007");
});
