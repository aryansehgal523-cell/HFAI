/*
 * Resume score, 0 to 100. Pure and deterministic: no AI, no I/O, so it is instant, free,
 * identical in the browser and on the server, and safe to recompute on every keystroke.
 *
 * Categories and weights:
 *   keywords 30 · impact 20 · xyz 15 · language 10 · completeness 10 · length 10 · ats 5
 */
import type { ResumeData } from "@/db/schema";
import { atsScore, extractKeywords, prettySkill, resumeToText } from "./ats";

export type ScoreCategoryKey = "keywords" | "impact" | "xyz" | "language" | "completeness" | "length" | "ats";
export type ScoreCategory = { key: ScoreCategoryKey; label: string; score: number; max: number; tips: string[] };
export type ResumeScore = { total: number; categories: ScoreCategory[] };
export type ScoreJob = { title: string; description: string; skills?: string[] };

export const CATEGORY_WEIGHTS: Record<ScoreCategoryKey, { label: string; max: number }> = {
  keywords: { label: "Keyword match", max: 30 },
  impact: { label: "Measurable impact", max: 20 },
  xyz: { label: "XYZ structure", max: 15 },
  language: { label: "Strong language", max: 10 },
  completeness: { label: "Completeness", max: 10 },
  length: { label: "Length and readability", max: 10 },
  ats: { label: "ATS safety", max: 5 },
};

// ─── Vocabulary ──────────────────────────────────────────────

const ACTION_VERBS = new Set(
  `accelerated achieved automated architected boosted built championed coded collaborated completed conducted consolidated
  created cut debugged decreased defined delivered deployed designed developed devised diagnosed directed doubled drove
  eliminated enabled engineered established exceeded executed expanded generated grew guided halved implemented improved
  increased initiated integrated introduced launched led maintained managed mentored migrated modernised modernized
  negotiated optimised optimized orchestrated organised organized overhauled owned piloted pioneered planned prevented
  produced programmed prototyped published raised rebuilt redesigned reduced refactored resolved restructured revamped
  saved scaled secured shipped simplified slashed spearheaded standardised standardized streamlined strengthened
  surpassed tested trained transformed tripled unified upgraded won wrote analysed analyzed authored coordinated
  facilitated handled identified oversaw presented researched supported`.split(/\s+/).filter(Boolean),
);

const WEAK_OPENERS = [
  "responsible for", "worked on", "helped with", "helped to", "helped", "involved in", "assisted", "participated in",
  "tasked with", "duties included", "in charge of", "was part of", "part of a team",
];

const RESULT_WORDS = /\b(reduc|increas|improv|cut|grew|grow|saved|sav(e|ing)|boost|rais|doubl|tripl|halv|lower|faster|accelerat|eliminat|achiev|exceed|surpass|generat|won)\w*/i;
// "by caching queries" is a method; "by 40%" is a measure, so "by" only counts before a word.
const HOW_WORDS = /\b(using|through|with|via|leveraging|built on|powered by)\b|\bby\s+(?!(about|around|over|nearly|almost|roughly|more|up|less)\b)[a-z]/i;
const NUMBER = /(\d+(\.\d+)?\s?(%|x\b|k\b|m\b|cr\b|crore|lakh|lpa|ms\b|s\b|sec|seconds|minutes|hours|hrs|days|weeks|months|users|customers|clients)|[₹$€£]\s?\d|\b\d{2,}\b|\b\d+(\.\d+)?\s?(percent|times)\b|\b(one|two|three|four|five|six|seven|eight|nine|ten|hundred|thousand|million|billion)\b)/i;

/**
 * Keywords for common target roles, used when no specific job is given.
 * An inner array means "any one of these": a Java backend developer is not expected to
 * also know Go, Python and Node.js, so alternatives count once.
 */
type Unit = string | string[];
const ROLE_KEYWORDS: [RegExp, Unit[]][] = [
  [/backend|back end|server|api/i, [["java", "python", "go", "golang", "node.js", "c#", "kotlin", "ruby", "php", "rust", "scala"], ["sql", "postgresql", "mysql", "mongodb"], ["redis", "kafka"], "microservices", ["rest", "graphql"], ["docker", "kubernetes"], ["aws", "gcp", "azure"], "system design"]],
  [/front ?end|react|ui engineer|web developer/i, [["javascript", "typescript"], ["react", "angular", "vue", "next.js"], ["tailwind", "figma"], ["rest", "graphql"]]],
  [/full ?stack/i, [["javascript", "typescript"], ["react", "angular", "vue", "next.js"], ["node.js", "django", "spring boot", "express", "fastapi", "flask"], ["sql", "postgresql", "mysql", "mongodb"], ["rest", "graphql"], ["docker", "aws", "gcp", "azure"]]],
  [/data analyst|business analyst|analytics/i, ["sql", "excel", ["python", "pandas"], ["tableau", "power bi"], "statistics", ["data analysis", "a/b testing"]]],
  [/data scien/i, ["python", "sql", ["pandas", "numpy"], ["scikit-learn", "machine learning"], "statistics", ["deep learning", "pytorch", "tensorflow"], "a/b testing"]],
  [/data engineer/i, [["python", "scala", "java"], "sql", ["spark", "pyspark", "hadoop"], ["airflow", "dbt"], "etl", ["kafka", "snowflake", "bigquery"], ["aws", "gcp", "azure"]]],
  [/machine learning|ml engineer|\bai\b|genai|llm|nlp/i, ["python", ["pytorch", "tensorflow"], ["machine learning", "deep learning"], ["llm", "rag", "langchain", "nlp", "genai", "generative ai"], "mlops", ["docker", "kubernetes", "aws", "gcp", "azure"]]],
  [/devops|sre|site reliability|platform|cloud/i, ["linux", ["docker", "kubernetes"], "terraform", ["aws", "gcp", "azure"], ["ci/cd", "github actions", "jenkins"]]],
  [/android/i, [["kotlin", "java"], "android"]],
  [/ios/i, ["swift", "ios"]],
  [/mobile|flutter|react native/i, [["flutter", "react native"], ["android", "ios"]]],
  [/product manager|product owner|\bpm\b/i, ["product management", ["agile", "scrum"], "jira", "a/b testing", "stakeholder management", "data analysis"]],
  [/sales|account executive|business development/i, ["sales", ["crm", "salesforce"], "communication", "stakeholder management"]],
  // Generic software roles. Data structures and algorithms are tested in interviews, not listed
  // on resumes, so they are not asked for here.
  [/software|sde|engineer|developer|programmer/i, ["system design", ["sql", "postgresql", "mysql", "mongodb"]]],
];

/** Keyword units for the user's target roles; each unit is satisfied by any one alternative. */
export function roleKeywordUnits(roles: string[]): string[][] {
  const units: string[][] = [];
  const seen = new Set<string>();
  const add = (u: string[]) => {
    const key = [...u].sort().join("|");
    if (!seen.has(key)) { seen.add(key); units.push(u); }
  };
  for (const role of roles) {
    for (const kw of extractKeywords(role)) add([kw]);
    for (const [re, list] of ROLE_KEYWORDS) if (re.test(role)) list.forEach((u) => add(typeof u === "string" ? [u] : u));
  }
  return units;
}

/** Every keyword the target roles mention (flattened). */
export function keywordsForRoles(roles: string[]): string[] {
  return [...new Set(roleKeywordUnits(roles).flat())];
}

// ─── Helpers ─────────────────────────────────────────────────

type Bullet = { text: string; where: string };

function allBullets(r: ResumeData): Bullet[] {
  return [
    ...r.experience.flatMap((e) => e.bullets.map((b) => ({ text: b.trim(), where: e.company || e.title }))),
    ...r.projects.flatMap((p) => p.bullets.map((b) => ({ text: b.trim(), where: p.name }))),
  ].filter((b) => b.text.length > 0);
}

const words = (s: string) => s.split(/\s+/).filter(Boolean);
const firstWord = (s: string) => (s.toLowerCase().match(/^[^a-z]*([a-z]+)/)?.[1] ?? "");
const quote = (s: string, n = 48) => `“${s.length > n ? `${s.slice(0, n).trimEnd()}…` : s}”`;
const round1 = (n: number) => Math.round(n * 10) / 10;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

export const hasNumber = (b: string) => NUMBER.test(b);
export const isWeak = (b: string) => WEAK_OPENERS.some((w) => b.toLowerCase().replace(/^[^a-z]+/, "").startsWith(w));
export const startsWithAction = (b: string) => ACTION_VERBS.has(firstWord(b));

/** 1 for a full XYZ bullet (action, result, how), 0.5 for two of three, else 0. */
export function xyzCredit(b: string): number {
  const action = startsWithAction(b);
  const result = hasNumber(b) || RESULT_WORDS.test(b);
  const how = HOW_WORDS.test(b);
  const parts = [action, result, how].filter(Boolean).length;
  return parts === 3 ? 1 : parts === 2 && action ? 0.5 : 0;
}

// ─── Categories ──────────────────────────────────────────────

function keywordCategory(r: ResumeData, job?: ScoreJob | null, targetRoles: string[] = []): ScoreCategory {
  const { label, max } = CATEGORY_WEIGHTS.keywords;
  const text = resumeToText(r);
  if (job) {
    const { score, missing } = atsScore(text, `${job.title}\n${job.description}`, job.skills ?? []);
    const tips = missing.length
      ? [`This job asks for ${missing.slice(0, 4).map(prettySkill).join(", ")}${missing.length > 4 ? ` and ${missing.length - 4} more` : ""}. Add the ones you have really used to a bullet or your skills.`]
      : [];
    return { key: "keywords", label, max, score: round1((score / 100) * max), tips };
  }
  const units = roleKeywordUnits(targetRoles);
  if (units.length === 0) {
    // No job and no target roles: reward a reasonably broad, specific skills vocabulary.
    const have = extractKeywords(text).length;
    const tips = ["Add the roles you want in your job preferences so we can check the keywords those jobs ask for."];
    if (have < 6) tips.push("Name the specific tools you use (for example SQL, React, AWS). Recruiters and ATS search for them.");
    return { key: "keywords", label, max, score: round1(clamp(have / 8, 0, 1) * max), tips };
  }
  const have = new Set(extractKeywords(text));
  const lower = text.toLowerCase();
  const met = (k: string) => have.has(k) || lower.includes(k);
  const missing = units.filter((u) => !u.some(met));
  const share = (units.length - missing.length) / units.length;
  const describe = (u: string[]) => (u.length === 1 ? prettySkill(u[0]) : `one of ${u.slice(0, 3).map(prettySkill).join(", ")}`);
  const tips = missing.length
    ? [`For ${targetRoles.slice(0, 2).join(" and ")} roles, recruiters search for ${missing.slice(0, 3).map(describe).join("; ")}. Add the ones you have really used.`]
    : [];
  return { key: "keywords", label, max, score: round1(share * max), tips };
}

function impactCategory(bullets: Bullet[]): ScoreCategory {
  const { label, max } = CATEGORY_WEIGHTS.impact;
  if (bullets.length === 0) return { key: "impact", label, max, score: 0, tips: ["Add bullets under your experience or projects that say what you achieved."] };
  const without = bullets.filter((b) => !hasNumber(b.text));
  const score = round1(((bullets.length - without.length) / bullets.length) * max);
  const tips = without.length
    ? [`${without.length} of your ${bullets.length} bullets have no number. Add one to ${quote(without[0].text)}: how many users, how much money or how much faster?`]
    : [];
  return { key: "impact", label, max, score, tips };
}

function xyzCategory(bullets: Bullet[]): ScoreCategory {
  const { label, max } = CATEGORY_WEIGHTS.xyz;
  if (bullets.length === 0) return { key: "xyz", label, max, score: 0, tips: [] };
  const credits = bullets.map((b) => xyzCredit(b.text));
  const score = round1((credits.reduce((a, c) => a + c, 0) / bullets.length) * max);
  const weakest = bullets.find((_, i) => credits[i] === 0) ?? bullets.find((_, i) => credits[i] < 1);
  const tips = weakest
    ? [`Rewrite ${quote(weakest.text)} as: what you achieved, how it was measured, and how you did it (“Cut load time 40% by caching queries in Redis”).`]
    : [];
  return { key: "xyz", label, max, score, tips };
}

function languageCategory(bullets: Bullet[]): ScoreCategory {
  const { label, max } = CATEGORY_WEIGHTS.language;
  if (bullets.length === 0) return { key: "language", label, max, score: 0, tips: [] };
  const weak = bullets.filter((b) => isWeak(b.text));
  const notAction = bullets.filter((b) => !isWeak(b.text) && !startsWithAction(b.text));
  const penalty = (weak.length + notAction.length * 0.4) / bullets.length;
  const score = round1(clamp(1 - penalty * 1.5, 0, 1) * max);
  const tips: string[] = [];
  if (weak.length) {
    const opener = WEAK_OPENERS.find((w) => weak[0].text.toLowerCase().replace(/^[^a-z]+/, "").startsWith(w)) ?? "that phrase";
    tips.push(`${weak.length} ${weak.length === 1 ? "bullet starts" : "bullets start"} with “${opener}”. Start ${quote(weak[0].text, 40)} with what you did instead, like “Built”, “Reduced” or “Led”.`);
  } else if (notAction.length) {
    tips.push(`Start ${quote(notAction[0].text, 40)} with a strong past tense verb.`);
  }
  return { key: "language", label, max, score, tips };
}

function completenessCategory(r: ResumeData): ScoreCategory {
  const { label, max } = CATEGORY_WEIGHTS.completeness;
  const c = r.contact ?? {};
  const checks: [boolean, string][] = [
    [Boolean(r.name?.trim()), "your full name"],
    [Boolean(c.email?.trim()), "your email"],
    [Boolean(c.phone?.trim()), "your phone number"],
    [Boolean(c.location?.trim()), "your city"],
    [Boolean(r.summary?.trim()), "a two line summary"],
    [r.experience.length > 0 || r.projects.length > 0, "your experience or projects"],
    [r.education.length > 0, "your education"],
    [r.skills.some((s) => s.items.length > 0), "a skills section"],
    [(c.links ?? []).length > 0, "a LinkedIn or GitHub link"],
  ];
  const missing = checks.filter(([ok]) => !ok).map(([, what]) => what);
  const score = round1(((checks.length - missing.length) / checks.length) * max);
  const tips = missing.length ? [`Add ${missing.slice(0, 3).join(", ")}${missing.length > 3 ? ` and ${missing.length - 3} more` : ""}.`] : [];
  return { key: "completeness", label, max, score, tips };
}

function lengthCategory(r: ResumeData, bullets: Bullet[], years: number): ScoreCategory {
  const { label, max } = CATEGORY_WEIGHTS.length;
  const tips: string[] = [];
  // 5 points: bullets of about 12 to 30 words
  const sized = bullets.filter((b) => { const n = words(b.text).length; return n >= 12 && n <= 30; });
  const bulletPts = bullets.length ? (sized.length / bullets.length) * 5 : 0;
  const long = bullets.find((b) => words(b.text).length > 30);
  const short = bullets.find((b) => words(b.text).length < 12);
  if (long) tips.push(`${quote(long.text, 40)} runs over 30 words. Split it or cut it to one line.`);
  else if (short) tips.push(`${quote(short.text, 40)} is very short. Add the result and how you got it.`);
  // 3 points: total length sensible for the experience level
  const total = words(resumeToText(r)).length;
  // Counts the content words (summary, bullets, skills), not contact or education lines.
  const [lo, hi] = years < 2 ? [110, 600] : years < 6 ? [150, 850] : [220, 1100];
  const lengthPts = total >= lo && total <= hi ? 3 : total < lo ? 3 * (total / lo) : 3 * clamp(hi / total, 0, 1);
  if (total < lo) tips.push(`Your resume is short (${total} words). Add projects or more detail on your strongest role.`);
  if (total > hi) tips.push(`Your resume is long (${total} words). Cut older or less relevant points to keep it to one or two pages.`);
  // 2 points: no role with more than 6 bullets
  const crowded = r.experience.find((e) => e.bullets.length > 6);
  const crowdPts = crowded ? 0 : 2;
  if (crowded) tips.push(`${crowded.title || "One role"} at ${crowded.company || "a company"} has ${crowded.bullets.length} bullets. Keep the best 4 to 6.`);
  return { key: "length", label, max, score: round1(bulletPts + lengthPts + crowdPts), tips };
}

function dateStyle(s?: string) {
  if (!s) return null;
  const t = s.trim().toLowerCase();
  if (/^(present|current|now)$/.test(t)) return "any";
  if (/^[a-z]{3,9}\.?\s+\d{4}$/.test(t)) return "month-name";
  if (/^\d{1,2}[/-]\d{4}$/.test(t)) return "numeric";
  if (/^\d{4}$/.test(t)) return "year";
  return "other";
}

function atsCategory(r: ResumeData, bullets: Bullet[]): ScoreCategory {
  const { label, max } = CATEGORY_WEIGHTS.ats;
  const tips: string[] = [];
  // 3 points: consistent, readable date formats across roles
  const styles = r.experience.flatMap((e) => [dateStyle(e.start), dateStyle(e.end)]).filter((s): s is string => Boolean(s) && s !== "any");
  const unique = new Set(styles);
  let datePts = 3;
  if (styles.includes("other")) { datePts = 1; tips.push("Write dates like “Jun 2024” so applicant tracking systems can read them."); }
  else if (unique.size > 1) { datePts = 2; tips.push("Use one date style throughout, for example “Jun 2024 to Present”."); }
  // 2 points: no characters that confuse parsers (emoji, decorative symbols, tabs, table pipes)
  const odd = bullets.find((b) => /[\u{1F300}-\u{1FAFF}☀-➿★☆✓✔➤►▪■◆|\t]/u.test(b.text));
  const charPts = odd ? 0 : 2;
  if (odd) tips.push(`Remove symbols and emoji like in ${quote(odd.text, 36)}. Some systems turn them into junk.`);
  return { key: "ats", label, max, score: round1(datePts + charPts), tips };
}

// ─── Public API ──────────────────────────────────────────────

export function scoreResume(
  resume: ResumeData,
  opts: { job?: ScoreJob | null; targetRoles?: string[]; experienceYears?: number } = {},
): ResumeScore {
  const r: ResumeData = {
    ...resume,
    experience: resume.experience ?? [],
    projects: resume.projects ?? [],
    education: resume.education ?? [],
    skills: resume.skills ?? [],
    achievements: resume.achievements ?? [],
  };
  const bullets = allBullets(r);
  const categories = [
    keywordCategory(r, opts.job, opts.targetRoles),
    impactCategory(bullets),
    xyzCategory(bullets),
    languageCategory(bullets),
    completenessCategory(r),
    lengthCategory(r, bullets, opts.experienceYears ?? 0),
    atsCategory(r, bullets),
  ];
  const total = Math.round(clamp(categories.reduce((a, c) => a + c.score, 0), 0, 100));
  return { total, categories };
}

/**
 * Options for scoring the master resume (no specific job). Shared by the browser and the
 * server so the profile page, the onboarding screen and the stored rows always agree.
 */
export function masterScoreOptions(
  preferences?: { targetRoles?: string[]; experienceYears?: number } | null,
  details?: { totalExperienceYears?: number } | null,
) {
  return {
    targetRoles: preferences?.targetRoles ?? [],
    experienceYears: details?.totalExperienceYears ?? preferences?.experienceYears ?? 0,
  };
}

/** The most valuable fixes first: biggest points still on the table. */
export function topTips(s: ResumeScore, n = 3): string[] {
  return [...s.categories]
    .filter((c) => c.tips.length)
    .sort((a, b) => (b.max - b.score) - (a.max - a.score))
    .flatMap((c) => c.tips.slice(0, 1))
    .slice(0, n);
}

/** Per category change between two scores, for "+6" badges and the "biggest gains" line. */
export function scoreDiff(before: ResumeScore, after: ResumeScore) {
  return after.categories.map((c) => {
    const b = before.categories.find((x) => x.key === c.key)?.score ?? 0;
    return { key: c.key, label: c.label, before: b, after: c.score, delta: round1(c.score - b) };
  });
}

export function biggestGains(before: ResumeScore, after: ResumeScore, n = 2) {
  return scoreDiff(before, after).filter((d) => d.delta >= 1).sort((a, b) => b.delta - a.delta).slice(0, n);
}
