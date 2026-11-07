import { test } from "node:test";
import assert from "node:assert/strict";
import { detailsFromResume, detectResumeFile, parseMonth, totalExperienceYears } from "../src/lib/resume-file";
import { mergeDetails, applicationDetailsSchema, preferencesSchema } from "../src/lib/profile-fields";
import type { ResumeData } from "../src/db/schema";

const bytes = (s: string) => new Uint8Array([...s].map((c) => c.charCodeAt(0)));
const NOW = new Date("2026-11-07T00:00:00Z");

test("detects PDF and DOCX by their first bytes", () => {
  assert.equal(detectResumeFile(bytes("%PDF-1.7\n...")), "pdf");
  const docx = bytes("PK\x03\x04....[Content_Types].xml....word/document.xml....");
  assert.equal(detectResumeFile(docx), "docx");
});

test("rejects renamed or unsupported files", () => {
  assert.equal(detectResumeFile(bytes("PK\x03\x04....xl/workbook.xml")), null, "xlsx is a zip but not Word");
  assert.equal(detectResumeFile(bytes("\xD0\xCF\x11\xE0 old .doc")), null, "legacy .doc");
  assert.equal(detectResumeFile(bytes("<html>not a pdf")), null);
  assert.equal(detectResumeFile(bytes("%PD")), null, "truncated");
  assert.equal(detectResumeFile(new Uint8Array()), null);
});

test("parses common resume date formats", () => {
  assert.equal(parseMonth("Jun 2025"), 2025 * 12 + 5);
  assert.equal(parseMonth("June 2025"), 2025 * 12 + 5);
  assert.equal(parseMonth("Sept 2021"), 2021 * 12 + 8);
  assert.equal(parseMonth("06/2025"), 2025 * 12 + 5);
  assert.equal(parseMonth("2024"), 2024 * 12);
  assert.equal(parseMonth("Present", NOW), 2026 * 12 + 10);
  assert.equal(parseMonth("sometime"), null);
  assert.equal(parseMonth("13/2025"), null);
});

test("total experience merges overlapping roles", () => {
  const exp = [
    { company: "A", title: "SWE", start: "Jan 2022", end: "Dec 2023", bullets: [] },
    { company: "B", title: "Freelance", start: "Jun 2023", end: "Mar 2024", bullets: [] }, // overlaps A
    { company: "C", title: "SWE II", start: "Jan 2025", end: "Present", bullets: [] },
  ];
  // A+B: Jan 2022..Mar 2024 = 27 months; C: Jan 2025..Nov 2026 = 23 months; 50 months ≈ 4.2 → 4
  assert.equal(totalExperienceYears(exp, NOW), 4);
  assert.equal(totalExperienceYears([], NOW), undefined);
  assert.equal(totalExperienceYears([{ company: "X", title: "Y", bullets: [] }], NOW), undefined);
});

const resume: ResumeData = {
  name: "Aarav Mehta",
  contact: { phone: "+91 98765 43210", location: "Gurugram, Haryana, India", links: ["linkedin.com/in/aarav", "github.com/aarav", "aarav.dev"] },
  experience: [{ company: "Acme", title: "AI Engineer", start: "Jun 2025", end: "Present", bullets: ["Processed 200000 events a day"] }],
  projects: [], education: [], skills: [], achievements: [],
};

test("fills application details from a resume", () => {
  const d = detailsFromResume(resume, "", NOW);
  assert.equal(d.phone, "+91 98765 43210");
  assert.equal(d.city, "Gurugram");
  assert.equal(d.state, "Haryana");
  assert.equal(d.linkedinUrl, "https://linkedin.com/in/aarav");
  assert.equal(d.githubUrl, "https://github.com/aarav");
  assert.equal(d.portfolioUrl, "https://aarav.dev");
  assert.equal(d.totalExperienceYears, 1.5);
  assert.equal(d.pinCode, undefined, "never take a PIN from bullet numbers");
});

test("reads city, state and PIN from a location with the PIN attached", () => {
  const r = { ...resume, contact: { location: "Bengaluru, Karnataka - 560034" } };
  const d = detailsFromResume(r, "", NOW);
  assert.equal(d.city, "Bengaluru");
  assert.equal(d.state, "Karnataka");
  assert.equal(d.pinCode, "560034");
});

test("takes a PIN only where it is clearly a PIN", () => {
  assert.equal(detailsFromResume(resume, "Address: Sector 21, Gurugram - 122016\n", NOW).pinCode, "122016");
  assert.equal(detailsFromResume(resume, "PIN code: 560034", NOW).pinCode, "560034");
  assert.equal(detailsFromResume(resume, "Handled 250000 tickets", NOW).pinCode, undefined);
});

test("merge keeps what the user already set", () => {
  const merged = mergeDetails({ gender: "Prefer not to say", disability: "Prefer not to say", veteran: "Prefer not to say", city: "Delhi", phone: "" }, { city: "Gurugram", phone: "999" });
  assert.equal(merged.city, "Delhi");
  assert.equal(merged.phone, "999");
});

test("validation: defaults, PIN and URL rules", () => {
  const ok = applicationDetailsSchema.parse({});
  assert.equal(ok.gender, "Prefer not to say");
  assert.equal(applicationDetailsSchema.safeParse({ pinCode: "12345" }).success, false);
  assert.equal(applicationDetailsSchema.safeParse({ linkedinUrl: "not a url" }).success, false);
  assert.equal(applicationDetailsSchema.safeParse({ linkedinUrl: "https://linkedin.com/in/x" }).success, true);
  assert.equal(preferencesSchema.safeParse({ targetRoles: ["a", "b", "c", "d", "e", "f"] }).success, false, "max 5 roles");
});
