import { test } from "node:test";
import assert from "node:assert/strict";
import { canonicalJobUrl, parseAtsUrl } from "../src/lib/ats-url";

test("Greenhouse board and embedded URLs", () => {
  assert.deepEqual(parseAtsUrl("https://boards.greenhouse.io/stripe/jobs/7012345"), { ats: "greenhouse", company: "stripe", jobId: "7012345" });
  assert.deepEqual(parseAtsUrl("https://job-boards.greenhouse.io/figma/jobs/5551234?gh_src=x"), { ats: "greenhouse", company: "figma", jobId: "5551234" });
  assert.equal(parseAtsUrl("https://stripe.com/jobs/listing/x?gh_jid=7012345").jobId, "7012345");
});

test("Lever and Ashby", () => {
  assert.deepEqual(parseAtsUrl("https://jobs.lever.co/acme/1f2e3d4c-aaaa-bbbb-cccc-1234567890ab/apply"), { ats: "lever", company: "acme", jobId: "1f2e3d4c-aaaa-bbbb-cccc-1234567890ab" });
  assert.deepEqual(parseAtsUrl("https://jobs.ashbyhq.com/openai/2b2c3d4e-0000-1111-2222-333344445555/application"), { ats: "ashby", company: "openai", jobId: "2b2c3d4e-0000-1111-2222-333344445555" });
});

test("Workday requisition ids", () => {
  const r = parseAtsUrl("https://acme.wd5.myworkdayjobs.com/en-US/External/job/Bengaluru-India/Software-Engineer_R-12345/apply");
  assert.equal(r.ats, "workday");
  assert.equal(r.company, "acme");
  assert.equal(r.jobId, "R-12345");
});

test("unknown and invalid URLs", () => {
  assert.deepEqual(parseAtsUrl("https://example.com/careers/1"), { ats: "other" });
  assert.deepEqual(parseAtsUrl("not a url"), { ats: "other" });
});

test("canonical apply URLs ignore /apply, trailing slashes, case and www", () => {
  assert.equal(canonicalJobUrl("https://jobs.lever.co/Acme/abc/apply/"), canonicalJobUrl("https://jobs.lever.co/acme/abc"));
  assert.equal(canonicalJobUrl("https://www.example.com/Jobs/1?x=1"), "example.com/jobs/1");
});
