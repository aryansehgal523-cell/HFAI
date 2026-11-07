/*
 * Company name matching for the referral engine. Pure and unit tested.
 *
 * 1. normaliseCompany: lowercase, strip punctuation, drop trailing legal and descriptor
 *    words ("Razorpay Software Pvt Ltd" → "razorpay"), collapse spaces.
 * 2. Aliases map known variants to one key (TCS ↔ Tata Consultancy Services).
 * 3. As a last step, a strict similarity check catches spacing and typo variants
 *    ("Razor Pay" ↔ "razorpay") without merging different businesses
 *    ("Swiggy Instamart" ≠ "Swiggy" unless aliased).
 */

/** Words removed from the END of a name only, so "Tech Mahindra" keeps its "tech". */
const TRAILING = new Set([
  "private", "pvt", "limited", "ltd", "inc", "incorporated", "llc", "llp", "corp", "corporation", "co", "company",
  "plc", "gmbh", "ag", "sa", "bv", "pte", "pty",
  "technologies", "technology", "tech", "solutions", "solution", "services", "service", "software", "systems",
  "india", "global", "group", "labs", "lab", "holdings", "international", "intl", "enterprises", "ventures",
  "digital", "infotech", "the",
  // Not "consulting"/"consultancy": "Tata Consultancy Services" must not collapse to "tata",
  // nor "Boston Consulting Group" to "boston".
]);

export function normaliseCompany(name: string): string {
  const tokens = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ")
    .replace(/\(.*?\)/g, " ") // "Amazon (AWS)" → "amazon"
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  if (tokens[0] === "the" && tokens.length > 1) tokens.shift();
  while (tokens.length > 1 && TRAILING.has(tokens[tokens.length - 1])) tokens.pop();
  return tokens.join(" ");
}

/** Seed aliases: [alias, canonical] where both are raw names; stored normalised. */
export const DEFAULT_ALIASES: [string, string][] = [
  ["TCS", "Tata Consultancy Services"],
  ["Infosys BPM", "Infosys"],
  ["Infosys Limited", "Infosys"],
  ["Amazon Web Services", "Amazon"],
  ["AWS", "Amazon"],
  ["Amazon Development Centre", "Amazon"],
  ["Google India", "Google"],
  ["Alphabet", "Google"],
  ["Facebook", "Meta"],
  ["Meta Platforms", "Meta"],
  ["Accenture Solutions", "Accenture"],
  ["Microsoft India", "Microsoft"],
  ["Microsoft IDC", "Microsoft"],
  ["HCL", "HCLTech"],
  ["HCL Technologies", "HCLTech"],
  ["Wipro Technologies", "Wipro"],
  ["Cognizant Technology Solutions", "Cognizant"],
  ["CTS", "Cognizant"],
  ["L&T Infotech", "LTIMindtree"],
  ["LTI", "LTIMindtree"],
  ["Mindtree", "LTIMindtree"],
  ["Flipkart Internet", "Flipkart"],
  ["Paytm", "One97 Communications"],
  ["PhonePe Private Limited", "PhonePe"],
  ["Zomato", "Eternal"],
  ["Blinkit", "Eternal"],
  ["IBM India", "IBM"],
  ["Deloitte USI", "Deloitte"],
  ["Deloitte Touche Tohmatsu", "Deloitte"],
  ["EY", "Ernst and Young"],
  ["EY GDS", "Ernst and Young"],
  ["PwC", "PricewaterhouseCoopers"],
  ["KPMG India", "KPMG"],
  ["JPMorgan Chase", "JPMorgan"],
  ["JP Morgan", "JPMorgan"],
  ["J.P. Morgan", "JPMorgan"],
  ["Goldman Sachs India", "Goldman Sachs"],
  ["Oracle India", "Oracle"],
  ["Salesforce India", "Salesforce"],
  ["Adobe Systems", "Adobe"],
  ["Uber India", "Uber"],
];

export type AliasMap = Map<string, string>; // normalised alias → normalised canonical

export function buildAliasMap(pairs: [string, string][]): AliasMap {
  const m: AliasMap = new Map();
  for (const [alias, canonical] of pairs) {
    const a = normaliseCompany(alias);
    const c = normaliseCompany(canonical);
    if (a && c && a !== c) m.set(a, c);
  }
  return m;
}

export const DEFAULT_ALIAS_MAP = buildAliasMap(DEFAULT_ALIASES);

/** The key stored on each connection and used for every comparison. */
export function companyKey(name: string, aliases: AliasMap = DEFAULT_ALIAS_MAP): string {
  const n = normaliseCompany(name);
  return aliases.get(n) ?? n;
}

/** Edit distance, capped for speed. */
function levenshtein(a: string, b: string, cap = 3): number {
  if (Math.abs(a.length - b.length) > cap) return cap + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      rowMin = Math.min(rowMin, cur[j]);
    }
    if (rowMin > cap) return cap + 1;
    prev = cur;
  }
  return prev[b.length];
}

/**
 * Strict last step for keys that are not equal: same letters ignoring spaces, or one or two
 * typos in a long name. Different token sets ("swiggy instamart" vs "swiggy") never match.
 */
export function similarKeys(a: string, b: string): boolean {
  if (a === b) return true;
  const sa = a.replace(/ /g, "");
  const sb = b.replace(/ /g, "");
  if (sa === sb) return true; // "razor pay" ↔ "razorpay"
  if (Math.min(sa.length, sb.length) < 6) return false; // short names: exact only
  const ta = a.split(" ");
  const tb = b.split(" ");
  if (ta.length !== tb.length) return false;
  const limit = Math.min(sa.length, sb.length) >= 10 ? 2 : 1;
  return levenshtein(sa, sb, limit) <= limit;
}

/** Which of the user's connection keys belong to this company. */
export function matchingKeys(companyName: string, userKeys: Iterable<string>, aliases: AliasMap = DEFAULT_ALIAS_MAP): Set<string> {
  const target = companyKey(companyName, aliases);
  const out = new Set<string>();
  for (const k of userKeys) if (k === target || similarKeys(k, target)) out.add(k);
  return out;
}
