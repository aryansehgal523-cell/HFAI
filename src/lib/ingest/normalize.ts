import crypto from "node:crypto";
import { extractKeywords } from "../ats";

export type RawJob = {
  externalId: string;
  title: string;
  location: string;
  workMode?: "REMOTE" | "HYBRID" | "ONSITE";
  department?: string | null;
  employment?: string | null;
  descriptionHtml?: string | null;
  descriptionText?: string | null;
  applyUrl: string;
  postedAt?: Date | null;
  salary?: { min?: number | null; max?: number | null; currency?: string | null; period?: string | null } | null;
};

const ENTITIES: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&nbsp;": " " };

export function htmlToText(html: string) {
  const decoded = html.replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (m) => ENTITIES[m] ?? m);
  return decoded
    .replace(/<\s*(br|\/p|\/li|\/h[1-6]|\/div)\s*\/?>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, "")
    .replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (m) => ENTITIES[m] ?? m)
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+/g, " ")
    .trim();
}

export function detectWorkMode(location: string, text: string, hint?: string | null): "REMOTE" | "HYBRID" | "ONSITE" {
  const h = (hint ?? "").toLowerCase();
  if (h.includes("remote")) return "REMOTE";
  if (h.includes("hybrid")) return "HYBRID";
  if (h.includes("onsite") || h.includes("on-site") || h.includes("in office")) return "ONSITE";
  const loc = location.toLowerCase();
  if (/\bremote\b/.test(loc)) return "REMOTE";
  if (/\bhybrid\b/.test(loc)) return "HYBRID";
  const t = text.toLowerCase().slice(0, 3000);
  if (/\bfully remote\b|\bremote[ -]first\b|\bwork from anywhere\b/.test(t)) return "REMOTE";
  if (/\bhybrid\b/.test(t)) return "HYBRID";
  return "ONSITE";
}

const COUNTRY_HINTS: [RegExp, string][] = [
  [/\b(india|bengaluru|bangalore|mumbai|pune|hyderabad|chennai|gurugram|gurgaon|noida|delhi|kolkata|ahmedabad|jaipur|kochi)\b/i, "IN"],
  [/\b(united states|usa|\bus\b|new york|san francisco|seattle|austin|boston|chicago|los angeles)\b/i, "US"],
  [/\b(united kingdom|uk|london|manchester)\b/i, "GB"],
  [/\b(germany|berlin|munich)\b/i, "DE"],
  [/\b(singapore)\b/i, "SG"],
  [/\b(canada|toronto|vancouver)\b/i, "CA"],
];

export function detectCountry(location: string) {
  for (const [re, code] of COUNTRY_HINTS) if (re.test(location)) return code;
  return null;
}

/** "3+ years", "2 to 5 years", "2-5 yrs" → min / max years. */
export function detectExperience(text: string): { min: number | null; max: number | null } {
  const t = text.toLowerCase();
  const range = t.match(/(\d{1,2})\s*(?:-|to|–)\s*(\d{1,2})\s*\+?\s*(?:years|yrs)/);
  if (range) return { min: Number(range[1]), max: Number(range[2]) };
  const plus = t.match(/(\d{1,2})\s*\+\s*(?:years|yrs)|(?:at least|minimum of|min\.?)\s*(\d{1,2})\s*(?:years|yrs)/);
  if (plus) return { min: Number(plus[1] ?? plus[2]), max: null };
  if (/\b(fresher|new grad|graduate program|entry level|intern(ship)?)\b/.test(t)) return { min: 0, max: 1 };
  return { min: null, max: null };
}

/** Indian style salary in the text: "₹12 to 18 LPA", "12-18 LPA", "INR 15,00,000". */
export function detectInrSalary(text: string): { min: number; max: number } | null {
  const lpa = text.match(/(?:₹|inr|rs\.?)?\s*(\d{1,3}(?:\.\d)?)\s*(?:-|to|–)\s*(\d{1,3}(?:\.\d)?)\s*(?:lpa|lakhs?)/i);
  if (lpa) return { min: Math.round(Number(lpa[1]) * 1e5), max: Math.round(Number(lpa[2]) * 1e5) };
  return null;
}

export function jobHash(companyId: string, title: string, location: string) {
  const norm = (s: string) => s.toLowerCase().replace(/\(.*?\)|[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
  return crypto.createHash("sha1").update(`${companyId}|${norm(title)}|${norm(location)}`).digest("hex");
}

/**
 * Ghost job score from 0 (fresh and real) to 100 (very likely stale or fake).
 * Signals: age, very short description, no apply link, reposted duplicates.
 */
export function ghostScore(input: { postedAt: Date; description: string; applyUrl: string; duplicates: number }) {
  let score = 0;
  const ageDays = (Date.now() - input.postedAt.getTime()) / 86_400_000;
  if (ageDays > 45) score += 25;
  if (ageDays > 90) score += 25;
  if (input.description.length < 400) score += 20;
  if (!/^https?:\/\//.test(input.applyUrl)) score += 30;
  if (input.duplicates >= 3) score += 20;
  return Math.min(100, score);
}

export function normalize(companyId: string, raw: RawJob) {
  const description = raw.descriptionText?.trim() || htmlToText(raw.descriptionHtml ?? "");
  const location = raw.location?.trim() || "Not specified";
  const exp = detectExperience(`${raw.title}\n${description}`);
  const inr = !raw.salary?.min && !raw.salary?.max ? detectInrSalary(description) : null;
  return {
    companyId,
    externalId: raw.externalId,
    title: raw.title.trim(),
    location,
    country: detectCountry(location),
    workMode: raw.workMode ?? detectWorkMode(location, description),
    department: raw.department ?? null,
    employment: raw.employment ?? null,
    experienceMin: exp.min,
    experienceMax: exp.max,
    salaryMin: raw.salary?.min ?? inr?.min ?? null,
    salaryMax: raw.salary?.max ?? inr?.max ?? null,
    salaryCurrency: raw.salary?.currency ?? (inr ? "INR" : null),
    salaryPeriod: raw.salary?.period ?? (inr ? "YEAR" : null),
    skills: extractKeywords(`${raw.title}\n${description}`).slice(0, 15),
    description,
    applyUrl: raw.applyUrl,
    postedAt: raw.postedAt ?? new Date(),
    hash: jobHash(companyId, raw.title, location),
  };
}
