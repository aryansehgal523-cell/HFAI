/*
 * Cross source duplicates. The same opening often arrives from the employer's own feed and from one or
 * more aggregators. Two jobs are the same when: same company (after name normalisation), same normalised
 * title, same city, posted within 7 days of each other, and their descriptions overlap.
 * We keep one: the employer's feed first, otherwise the aggregator with the fullest description.
 */
import crypto from "node:crypto";

/** "Sr. Software Engineer II (Backend) - Remote" → "senior software engineer 2 backend". */
export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/\bsr\.?\b/g, "senior")
    .replace(/\bjr\.?\b/g, "junior")
    .replace(/\b(engg|engr)\b/g, "engineer")
    .replace(/\bmgr\b/g, "manager")
    .replace(/\biii\b/g, "3")
    .replace(/\bii\b/g, "2")
    .replace(/\b(remote|hybrid|on-?site|work from home|wfh|urgent(ly)? hiring|immediate joiners?)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Spellings of the same city, so "Bangalore" and "Bengaluru, Karnataka" match. */
const CITY_ALIASES: [RegExp, string][] = [
  [/\b(bengaluru|bangalore|blr)\b/, "bengaluru"],
  [/\b(gurugram|gurgaon|ggn)\b/, "gurugram"],
  [/\b(mumbai|bombay|navi mumbai|thane|powai|andheri)\b/, "mumbai"],
  [/\b(new delhi|delhi|ncr)\b/, "delhi"],
  [/\b(noida|greater noida)\b/, "noida"],
  [/\b(chennai|madras)\b/, "chennai"],
  [/\b(kolkata|calcutta)\b/, "kolkata"],
  [/\b(hyderabad|secunderabad|hitech city|gachibowli)\b/, "hyderabad"],
  [/\b(pune|hinjewadi|kharadi)\b/, "pune"],
  [/\b(kochi|cochin)\b/, "kochi"],
  [/\b(thiruvananthapuram|trivandrum)\b/, "thiruvananthapuram"],
  [/\b(vadodara|baroda)\b/, "vadodara"],
  [/\b(mysuru|mysore)\b/, "mysuru"],
  [/\b(mangaluru|mangalore)\b/, "mangaluru"],
  [/\b(visakhapatnam|vizag)\b/, "visakhapatnam"],
  [/\b(ahmedabad|gandhinagar)\b/, "ahmedabad"],
  [/\b(chandigarh|mohali|panchkula)\b/, "chandigarh"],
  [/\bremote\b/, "remote"],
];

/** The first city a location names, normalised; otherwise its first comma part. */
export function cityKey(location: string): string {
  const l = location.toLowerCase();
  for (const [re, city] of CITY_ALIASES) if (re.test(l)) return city;
  return l.split(/[,;/|(-]/)[0].replace(/[^a-z ]/g, "").trim();
}

/** Key shared by duplicates: company, normalised title and city. */
export function dedupeKey(companyId: string, title: string, location: string): string {
  return crypto.createHash("sha1").update(`${companyId}|${normalizeTitle(title)}|${cityKey(location)}`).digest("hex");
}

const words = (s: string) => new Set(s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter((w) => w.length > 2));

/**
 * How much of the shorter description appears in the longer one (0 to 1). Aggregators often send a
 * 500 character snippet of the full text, so containment works better than symmetric similarity.
 */
export function descriptionOverlap(a: string, b: string): number {
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  const ws = words(short);
  if (ws.size < 5) return 1; // too little text to disagree on
  const wl = words(long);
  let hit = 0;
  for (const w of ws) if (wl.has(w)) hit++;
  return hit / ws.size;
}

export type DedupeCandidate = { id: string; source: string | null; postedAt: Date; description: string; isEmployerFeed: boolean };

/** Same opening? Posted within 7 days and at least half of the shorter description is shared. */
export function isDuplicate(a: DedupeCandidate, b: DedupeCandidate): boolean {
  const days = Math.abs(a.postedAt.getTime() - b.postedAt.getTime()) / 86_400_000;
  return days <= 7 && descriptionOverlap(a.description, b.description) >= 0.5;
}

/** Which of two duplicates to keep: the employer's feed, otherwise the longer description, otherwise the older row. */
export function preferred<T extends DedupeCandidate>(a: T, b: T): T {
  if (a.isEmployerFeed !== b.isEmployerFeed) return a.isEmployerFeed ? a : b;
  if (a.description.length !== b.description.length) return a.description.length > b.description.length ? a : b;
  return a.postedAt <= b.postedAt ? a : b;
}
