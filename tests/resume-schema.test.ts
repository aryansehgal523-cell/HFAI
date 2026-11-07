import { test } from "node:test";
import assert from "node:assert/strict";
import { resumeSchema } from "../src/lib/ai";

test("accepts skills without a group (the bug that broke PDF uploads)", () => {
  const r = resumeSchema.parse({ skills: [{ items: ["Java", "Kafka"] }, "Docker", "AWS"] });
  assert.deepEqual(r.skills, [
    { group: "Skills", items: ["Java", "Kafka"] },
    { group: "Skills", items: ["Docker", "AWS"] },
  ]);
});

test("treats null and empty values as absent", () => {
  const r = resumeSchema.parse({
    name: "Priya", headline: null, summary: "", contact: { email: null, links: null },
    experience: [{ company: "Razorpay", title: "SWE", start: "Jan 2024", end: null, bullets: null }],
    projects: null, education: null, achievements: null,
  });
  assert.equal(r.headline, undefined);
  assert.equal(r.summary, undefined);
  assert.equal(r.contact?.email, undefined);
  assert.deepEqual(r.contact?.links, []);
  assert.equal(r.experience[0].end, undefined);
  assert.deepEqual(r.experience[0].bullets, []);
  assert.deepEqual(r.projects, []);
  assert.deepEqual(r.education, []);
  assert.deepEqual(r.achievements, []);
});

test("drops empty placeholder rows", () => {
  const r = resumeSchema.parse({ experience: [{ company: "", title: "", bullets: [] }], education: [{ school: null, degree: null }] });
  assert.equal(r.experience.length, 0);
  assert.equal(r.education.length, 0);
});

test("still rejects structurally wrong output", () => {
  assert.equal(resumeSchema.safeParse({ experience: "worked at Acme" }).success, false);
  assert.equal(resumeSchema.safeParse({ skills: 42 }).success, false);
});
