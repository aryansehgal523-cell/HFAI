import { test } from "node:test";
import assert from "node:assert/strict";
import { LIMITS, enforceDraft, followUpDate, mailtoLink, relationshipFact } from "../src/lib/referrals/draft";

const LINK = "https://boards.greenhouse.io/razorpay/jobs/12345";

test("relationship facts are only what we know", () => {
  assert.equal(relationshipFact({ relationship: "alumni", connectedOn: null, batch: "2019", source: "alumni_csv" }, "VIT Vellore"), "You are both alumni of VIT Vellore (they graduated in 2019).");
  assert.equal(relationshipFact({ relationship: null, connectedOn: "2021-03-04", source: "linkedin_csv" }, "VIT"), "You have been connected on LinkedIn since 2021.");
  assert.equal(relationshipFact({ relationship: "ex_colleague", connectedOn: null, source: "manual" }, null), "You worked together before.");
  assert.equal(relationshipFact({ relationship: null, connectedOn: null, source: "manual" }, "VIT"), null, "nothing to claim");
});

test("LinkedIn drafts stay under 600 characters and keep the link", () => {
  const long = `Hi Ananya,\n\nI hope you're well. ${"I built a payments reconciliation service that cut settlement time by 60%. ".repeat(12)}Here is the role: ${LINK}. Would you be open to referring me?`;
  const out = enforceDraft(long, { channel: "linkedin", link: LINK, firstName: "Ananya" });
  assert.ok(out.length <= LIMITS.linkedinChars, `${out.length}`);
  assert.ok(out.includes(LINK));
  assert.ok(out.startsWith("Hi Ananya,"), "greeting kept");
  assert.ok(out.includes("Would you be open to referring me?"), "the ask is never trimmed");
});

test("email drafts stay under 150 words", () => {
  const long = `Hi Rohan,\n\n${"I reduced p95 latency from 800 ms to 220 ms by adding indexes. ".repeat(20)}`;
  const out = enforceDraft(long, { channel: "email", link: LINK, firstName: "Rohan" });
  assert.ok(out.split(/\s+/).filter(Boolean).length <= LIMITS.emailWords);
  assert.ok(out.includes(LINK), "link appended when the model left it out");
});

test("adds a greeting when the model forgot it, and leaves good drafts alone", () => {
  assert.ok(enforceDraft(`Saw the backend role at Razorpay: ${LINK}`, { channel: "linkedin", link: LINK, firstName: "Kavya" }).startsWith("Hi Kavya,"));
  const good = `Hi Kavya, we were both at VIT. Would you refer me for ${LINK}? Happy to send my resume.`;
  assert.equal(enforceDraft(good, { channel: "linkedin", link: LINK, firstName: "Kavya" }), good);
});

test("follow up is 5 days later and mailto links are encoded", () => {
  assert.equal(followUpDate(new Date("2026-11-07T10:00:00Z")).toISOString(), "2026-11-12T10:00:00.000Z");
  assert.equal(mailtoLink("a@b.com", "Referral for SDE", "Hi A & B"), "mailto:a@b.com?subject=Referral%20for%20SDE&body=Hi%20A%20%26%20B");
});
