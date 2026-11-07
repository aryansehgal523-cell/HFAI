/*
 * Pure helpers for resume uploads: what kind of file it really is, and which
 * application details we can fill from a parsed resume. No I/O, fully unit tested.
 */
import type { ResumeData } from "@/db/schema";
import type { ApplicationDetails } from "./profile-fields";

export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024; // Vercel rejects request bodies over 4.5 MB

export type ResumeFileKind = "pdf" | "docx";

/** Decide by the first bytes, never by the extension. Returns null for anything else. */
export function detectResumeFile(bytes: Uint8Array): ResumeFileKind | null {
  const head = (n: number) => String.fromCharCode(...bytes.subarray(0, n));
  if (bytes.length >= 5 && head(5) === "%PDF-") return "pdf";
  // DOCX is a zip (PK\x03\x04) whose entries include word/document.xml.
  if (bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04) {
    return asciiIncludes(bytes, "word/document.xml") ? "docx" : null;
  }
  return null;
}

function asciiIncludes(bytes: Uint8Array, needle: string) {
  const n = needle.split("").map((c) => c.charCodeAt(0));
  outer: for (let i = 0; i <= bytes.length - n.length; i++) {
    for (let j = 0; j < n.length; j++) if (bytes[i + j] !== n[j]) continue outer;
    return true;
  }
  return false;
}

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11,
};

/** "Jun 2025", "06/2025", "2025", "Present" → month index since year 0, or null. */
export function parseMonth(s: string | undefined, now = new Date()): number | null {
  if (!s) return null;
  const t = s.trim().toLowerCase();
  if (/^(present|current|now|till date|ongoing|today)$/.test(t)) return now.getFullYear() * 12 + now.getMonth();
  let m = t.match(/^([a-z]{3,9})\.?,?\s+(\d{4})$/);
  if (m && MONTHS[m[1].slice(0, m[1] === "sept" ? 4 : 3)] !== undefined) return Number(m[2]) * 12 + MONTHS[m[1].slice(0, m[1] === "sept" ? 4 : 3)];
  m = t.match(/^(\d{1,2})[/-](\d{4})$/);
  if (m && Number(m[1]) >= 1 && Number(m[1]) <= 12) return Number(m[2]) * 12 + Number(m[1]) - 1;
  m = t.match(/^(\d{4})$/);
  if (m) return Number(m[1]) * 12;
  return null;
}

/** Total years of work, merging overlapping roles, rounded to the nearest half year. */
export function totalExperienceYears(experience: ResumeData["experience"], now = new Date()): number | undefined {
  const spans: [number, number][] = [];
  for (const e of experience) {
    const start = parseMonth(e.start, now);
    const end = parseMonth(e.end ?? "present", now) ?? parseMonth("present", now)!;
    if (start === null || end < start) continue;
    spans.push([start, end + 1]); // inclusive of the end month
  }
  if (spans.length === 0) return undefined;
  spans.sort((a, b) => a[0] - b[0]);
  let months = 0;
  let [cs, ce] = spans[0];
  for (const [s, e] of spans.slice(1)) {
    if (s <= ce) ce = Math.max(ce, e);
    else { months += ce - cs; [cs, ce] = [s, e]; }
  }
  months += ce - cs;
  return Math.round((months / 12) * 2) / 2;
}

const INDIAN_STATES = [
  "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh", "Goa", "Gujarat", "Haryana", "Himachal Pradesh",
  "Jharkhand", "Karnataka", "Kerala", "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya", "Mizoram", "Nagaland", "Odisha",
  "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal",
  "Delhi", "Jammu and Kashmir", "Ladakh", "Puducherry", "Chandigarh",
];

function normaliseUrl(u: string) {
  const t = u.trim().replace(/[),.;]+$/, "");
  return /^https?:\/\//i.test(t) ? t : `https://${t}`;
}

/** Fill what a resume tells us; leave everything else for the user. */
export function detailsFromResume(resume: ResumeData, rawText = "", now = new Date()): Partial<ApplicationDetails> {
  const out: Partial<ApplicationDetails> = {};
  const c = resume.contact ?? {};
  if (c.phone) out.phone = c.phone.trim();

  if (c.location) {
    // "Bengaluru, Karnataka - 560034" → ["Bengaluru", "Karnataka"]
    const parts = c.location
      .split(/[,|]/)
      .map((p) => p.replace(/\b\d{6}\b/g, "").replace(/\s*[-–]\s*$/, "").trim())
      .filter(Boolean);
    const state = INDIAN_STATES.find((s) => parts.some((p) => p.toLowerCase() === s.toLowerCase()));
    if (state) out.state = state;
    const city = parts.find((p) => p.toLowerCase() !== state?.toLowerCase() && !/^india$/i.test(p) && !/^\d{6}$/.test(p));
    if (city) out.city = city;
  }

  // Only trust a 6 digit number where it is clearly a PIN: in the location, after a "PIN" label,
  // or ending an address line ("Delhi - 110001"). Never pick numbers out of bullets.
  const pin =
    (c.location ?? "").match(/(?<!\d)([1-9]\d{5})(?!\d)/) ??
    rawText.match(/\bpin\s*(?:code)?\s*[:\-]?\s*([1-9]\d{5})(?!\d)/i) ??
    rawText.match(/[A-Za-z)]\s*[-,]\s*([1-9]\d{5})\s*$/m);
  if (pin) out.pinCode = pin[1];

  const links = [...(c.links ?? []), ...(rawText.match(/(?:https?:\/\/)?(?:www\.)?(?:linkedin\.com|github\.com)\/[^\s,;)]+/gi) ?? [])];
  for (const l of links) {
    const low = l.toLowerCase();
    if (!out.linkedinUrl && low.includes("linkedin.com/")) out.linkedinUrl = normaliseUrl(l);
    else if (!out.githubUrl && low.includes("github.com/")) out.githubUrl = normaliseUrl(l);
    else if (!out.portfolioUrl && !low.includes("linkedin.com") && !low.includes("github.com") && !low.includes("@")) out.portfolioUrl = normaliseUrl(l);
  }

  const years = totalExperienceYears(resume.experience, now);
  if (years !== undefined) out.totalExperienceYears = years;
  return out;
}
