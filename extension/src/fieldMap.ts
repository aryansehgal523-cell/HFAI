/*
 * Which profile value belongs in which form field, and which option to pick.
 * Pure (no DOM), unit tested in tests/field-map.test.ts, and bundled into the extension.
 */

export type FieldInfo = {
  label: string; // visible label text
  name?: string;
  id?: string;
  placeholder?: string;
  aria?: string; // aria-label or aria-labelledby text
  type?: string; // input type, "select", "textarea", "radio-group"
  options?: string[]; // select or radio option texts
  required?: boolean;
};

export type FieldKey =
  | "fullName" | "firstName" | "lastName" | "email" | "phone" | "linkedin" | "github" | "website"
  | "city" | "state" | "pinCode" | "currentCompany" | "currentTitle" | "totalExperience"
  | "currentCtc" | "expectedCtc" | "noticePeriod" | "startDate" | "workAuthIndia" | "sponsorship"
  | "relocate" | "gender" | "disability" | "veteran" | "school" | "degree" | "gradYear" | "resume";

export type Profile = {
  plan: string;
  contact: { fullName: string; firstName: string; lastName: string; email: string; phone: string; city: string; linkedin: string; github?: string; website?: string; state?: string; pinCode?: string };
  work?: { currentCompany: string; currentTitle: string; totalExperienceYears: number | null; currentCtcLpa: number | null; expectedCtcLpa: number | null; noticePeriod: string | null; earliestStartDate: string | null };
  eligibility?: { authorisedToWorkInIndia: boolean | null; needsVisaSponsorship: boolean | null; willingToRelocate: boolean | null };
  eeo?: { gender: string; disability: string; veteran: string };
  education?: { school: string; degree: string; start?: string; end?: string }[];
};

export const normalise = (s: string | undefined) =>
  (s ?? "").toLowerCase().replace(/[*:?()\[\]_\-/.,]+/g, " ").replace(/\s+/g, " ").trim();

/** Order matters: the first pattern that matches wins ("first name" before "name"). */
const PATTERNS: [FieldKey, RegExp][] = [
  ["resume", /\b(resume|cv|curriculum vitae)\b/],
  ["firstName", /\b(first|given|fore) ?name\b/],
  ["lastName", /\b(last|family|sur) ?name\b|\bsurname\b/],
  ["email", /\be ?mail\b/],
  ["linkedin", /\blinked ?in\b/],
  ["github", /\bgit ?hub\b/],
  ["website", /\b(website|portfolio|personal (site|url|page)|blog)\b/],
  ["phone", /\b(phone|mobile|cell|contact number|whatsapp)\b/],
  ["currentCtc", /\b(current|present|existing) (ctc|salary|compensation|annual (salary|ctc)|pay|package)\b|\bctc current\b/],
  ["expectedCtc", /\b(expected|desired|expectation|salary expectation|expected salary)\b.*\b(ctc|salary|compensation|pay|package)?|\bsalary expectations?\b/],
  ["noticePeriod", /\b(notice period|serving notice|when can you join|joining (time|period)|how soon can you join)\b/],
  ["startDate", /\b(start date|available to start|earliest (start|joining)|availability date|date available)\b/],
  ["totalExperience", /\b(years? of (relevant |total |professional )?experience|total experience|experience in years|work experience years|how many years)\b/],
  ["currentCompany", /\b(current|present|most recent) (company|employer|organi[sz]ation)\b|^company( name)?$|^employer$/],
  ["currentTitle", /\b(current|present|most recent) (title|role|position|designation|job title)\b|^(job )?title$|^designation$/],
  ["sponsorship", /\b(sponsor|sponsorship|visa)\b/],
  ["workAuthIndia", /\b(authori[sz]ed|eligible|legally (able|allowed)|right|permit)\b.*\bwork\b|\bwork (authori[sz]ation|permit)\b/],
  ["relocate", /\brelocat/],
  ["gender", /\bgender\b|\bsex\b/],
  ["disability", /\bdisab/],
  ["veteran", /\bveteran|military\b/],
  ["gradYear", /\b(graduation|passing|passout|pass out) (year|date)\b|\byear of (graduation|passing)\b/],
  ["degree", /\b(degree|qualification|discipline|major|course)\b/],
  ["school", /\b(school|university|college|institute|institution)\b/],
  ["pinCode", /\b(pin ?code|postal code|zip( code)?|postcode)\b/],
  ["state", /^state\b|\bstate( province)?$|\bprovince\b/],
  ["city", /\b(city|town|current location|location)\b/],
  ["fullName", /^(your )?(full |legal )?name$|\bfull name\b|\bcandidate name\b/],
];

/** Countries other than India that work authorisation questions sometimes name. */
const OTHER_COUNTRY = /\b(united states|u s|usa|us|uk|united kingdom|canada|europe|eu|australia|singapore|germany|uae)\b/;

export function mapField(f: FieldInfo): FieldKey | null {
  if (f.type === "password" || f.type === "hidden" || f.type === "submit") return null;
  const hay = [f.label, f.aria, f.placeholder, f.name, f.id].map(normalise).filter(Boolean);
  for (const [key, re] of PATTERNS) {
    if (!hay.some((h) => re.test(h))) continue;
    if (key === "resume" && f.type !== "file") continue; // a "resume" text box is not the upload
    if (f.type === "file" && key !== "resume") return null;
    // Only answer work authorisation for India; another country is the user's call.
    if ((key === "workAuthIndia" || key === "sponsorship") && hay.some((h) => OTHER_COUNTRY.test(h)) && !hay.some((h) => /\bindia\b/.test(h))) return null;
    return key;
  }
  return null;
}

const NOTICE_WORDS: Record<string, RegExp> = {
  immediate: /\b(immediate|immediately|0 days?|none|right away|serving notice|less than 15)\b/,
  "15": /\b(15 days?|2 weeks|two weeks|less than 30)\b/,
  "30": /\b(30 days?|1 month|one month|4 weeks)\b/,
  "60": /\b(60 days?|2 months|two months)\b/,
  "90": /\b(90 days?|3 months|three months|more than 60)\b/,
};

const yesNo = (b: boolean | null | undefined) => (b === true ? "Yes" : b === false ? "No" : "");

/** The value to put in a field, as text. "" means we do not know it, so leave the field alone. */
export function valueFor(key: FieldKey, p: Profile): string {
  const c = p.contact, w = p.work, e = p.eligibility, eeo = p.eeo, ed = p.education?.[0];
  switch (key) {
    case "fullName": return c.fullName;
    case "firstName": return c.firstName;
    case "lastName": return c.lastName;
    case "email": return c.email;
    case "phone": return c.phone;
    case "linkedin": return c.linkedin;
    case "github": return c.github ?? "";
    case "website": return c.website ?? "";
    case "city": return c.city;
    case "state": return c.state ?? "";
    case "pinCode": return c.pinCode ?? "";
    case "currentCompany": return w?.currentCompany ?? "";
    case "currentTitle": return w?.currentTitle ?? "";
    case "totalExperience": return w?.totalExperienceYears != null ? String(w.totalExperienceYears) : "";
    case "currentCtc": return w?.currentCtcLpa != null ? String(w.currentCtcLpa) : "";
    case "expectedCtc": return w?.expectedCtcLpa != null ? String(w.expectedCtcLpa) : "";
    case "noticePeriod": return w?.noticePeriod ? (w.noticePeriod === "immediate" ? "Immediate" : `${w.noticePeriod} days`) : "";
    case "startDate": return w?.earliestStartDate ?? "";
    case "workAuthIndia": return yesNo(e?.authorisedToWorkInIndia);
    case "sponsorship": return yesNo(e?.needsVisaSponsorship);
    case "relocate": return yesNo(e?.willingToRelocate);
    case "gender": return eeo?.gender ?? "";
    case "disability": return eeo?.disability ?? "";
    case "veteran": return eeo?.veteran ?? "";
    case "school": return ed?.school ?? "";
    case "degree": return ed?.degree ?? "";
    case "gradYear": return ed?.end?.match(/\d{4}/)?.[0] ?? "";
    case "resume": return "";
  }
}

const PREFER_NOT = /\b(prefer not|decline|don t wish|do not wish|not to (say|disclose|answer)|rather not|choose not)\b/;

/**
 * Pick the option that best matches a value. Returns the option index, or -1 when nothing
 * fits well enough (we would rather leave a dropdown for the user than pick wrongly).
 */
export function pickOption(options: string[], value: string, key?: FieldKey): number {
  if (!value) return -1;
  const opts = options.map(normalise);
  const v = normalise(value);
  const valid = (i: number) => opts[i] && !/^(select|choose|please select|none selected|\s*)$/.test(opts[i]);
  let i = opts.findIndex((o, n) => valid(n) && o === v);
  if (i >= 0) return i;
  if (key === "noticePeriod") {
    const code = v.startsWith("immediate") ? "immediate" : v.match(/\d+/)?.[0] ?? "";
    const re = NOTICE_WORDS[code];
    if (re) { i = opts.findIndex((o, n) => valid(n) && re.test(o)); if (i >= 0) return i; }
  }
  if (/^prefer not/.test(v)) { i = opts.findIndex((o, n) => valid(n) && PREFER_NOT.test(o)); if (i >= 0) return i; }
  if (v === "yes" || v === "no") { i = opts.findIndex((o, n) => valid(n) && new RegExp(`^${v}\\b`).test(o)); if (i >= 0) return i; }
  // Containment either way ("Bachelor of Technology" ~ "B.Tech" is too loose; require a whole word match)
  i = opts.findIndex((o, n) => valid(n) && (o.includes(v) || (v.includes(o) && o.length >= 3)));
  if (i >= 0) return i;
  // Token overlap as the last resort, with a high bar.
  const vt = new Set(v.split(" "));
  let best = -1, bestScore = 0;
  opts.forEach((o, n) => {
    if (!valid(n)) return;
    const ot = o.split(" ");
    const hit = ot.filter((t) => vt.has(t)).length;
    const score = hit / Math.max(ot.length, vt.size);
    if (score > bestScore) { bestScore = score; best = n; }
  });
  return bestScore >= 0.6 ? best : -1;
}

/** A free text question we cannot fill from the profile ("Why do you want to work here?"). */
export function isCustomQuestion(f: FieldInfo) {
  const t = normalise(f.label);
  return (f.type === "textarea" || f.type === "text") && mapField(f) === null && t.split(" ").length >= 4 && /\b(why|what|how|describe|tell us|explain|share)\b/.test(t);
}

export const FIELD_LABEL: Record<FieldKey, string> = {
  fullName: "full name", firstName: "first name", lastName: "last name", email: "email", phone: "phone", linkedin: "LinkedIn",
  github: "GitHub", website: "website", city: "city", state: "state", pinCode: "PIN code", currentCompany: "current company",
  currentTitle: "current title", totalExperience: "years of experience", currentCtc: "current CTC", expectedCtc: "expected CTC",
  noticePeriod: "notice period", startDate: "start date", workAuthIndia: "work authorisation", sponsorship: "visa sponsorship",
  relocate: "relocation", gender: "gender", disability: "disability", veteran: "veteran status", school: "school", degree: "degree",
  gradYear: "graduation year", resume: "resume",
};
