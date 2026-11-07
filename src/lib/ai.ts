import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import type { ResumeData } from "@/db/schema";

const FAST = process.env.ANTHROPIC_FAST_MODEL ?? "claude-haiku-4-5";
const STRONG = process.env.ANTHROPIC_STRONG_MODEL ?? "claude-sonnet-4-5";

let client: Anthropic | null = null;
function anthropic() {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not set");
  client ??= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

// Models phrase absent data in different ways (missing key, null, "" or a bare list), so the
// schema accepts those shapes and normalises them, instead of failing a whole parse because
// one optional field came back as null. Structure that really matters is still enforced.
const opt = z.string().nullish().transform((v) => (v == null || v.trim() === "" ? undefined : v));
const req = z.string().nullish().transform((v) => v ?? "");
const list = z.array(z.string().nullish()).nullish().transform((v) => (v ?? []).filter((x): x is string => Boolean(x && x.trim())));

const skillsSchema = z
  .array(z.union([z.string(), z.object({ group: opt, items: list })]))
  .nullish()
  .transform((rows) => {
    const groups: { group: string; items: string[] }[] = [];
    const loose: string[] = [];
    for (const r of rows ?? []) {
      if (typeof r === "string") { if (r.trim()) loose.push(r.trim()); }
      else if (r.items.length) groups.push({ group: r.group ?? "Skills", items: r.items });
    }
    if (loose.length) groups.push({ group: "Skills", items: loose });
    return groups;
  });

export const resumeSchema = z.object({
  name: opt,
  headline: opt,
  contact: z
    .object({ email: opt, phone: opt, location: opt, links: list })
    .nullish()
    .transform((c) => c ?? undefined),
  summary: opt,
  experience: z.array(z.object({
    company: req, title: req, location: opt, start: opt, end: opt, bullets: list,
  })).nullish().transform((v) => (v ?? []).filter((e) => e.company || e.title || e.bullets.length)),
  projects: z.array(z.object({
    name: req, tech: list, link: opt, bullets: list,
  })).nullish().transform((v) => (v ?? []).filter((p) => p.name || p.bullets.length)),
  education: z.array(z.object({
    school: req, degree: req, start: opt, end: opt, score: opt,
  })).nullish().transform((v) => (v ?? []).filter((e) => e.school || e.degree)),
  skills: skillsSchema,
  achievements: list,
});

/** Pull the first JSON object out of a model reply. */
function parseJson<T>(text: string, schema: z.ZodType<T>): T {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("Model did not return JSON");
  return schema.parse(JSON.parse(text.slice(start, end + 1)));
}

function textOf(msg: Anthropic.Message) {
  return msg.content.map((b) => (b.type === "text" ? b.text : "")).join("");
}

const RESUME_SHAPE = `{"name","headline","contact":{"email","phone","location","links":[]},"summary",
"experience":[{"company","title","location","start","end","bullets":[]}],
"projects":[{"name","tech":[],"link","bullets":[]}],
"education":[{"school","degree","start","end","score"}],
"skills":[{"group","items":[]}],"achievements":[]}`;

const PARSE_SYSTEM =
  "You convert resumes into JSON. Copy facts exactly as written. Never invent employers, dates, numbers, skills or links. Omit fields that are absent. Put every URL or profile handle you see (LinkedIn, GitHub, portfolio) in contact.links.";

/** Turn pasted resume text into the structured master profile. */
export async function parseResume(raw: string): Promise<ResumeData> {
  const msg = await anthropic().messages.create({
    model: FAST,
    max_tokens: 4000,
    system: PARSE_SYSTEM,
    messages: [{ role: "user", content: `Return only JSON shaped like ${RESUME_SHAPE}\n\nResume:\n"""${raw.slice(0, 20000)}"""` }],
  });
  return parseJson(textOf(msg), resumeSchema) as ResumeData;
}

/**
 * Parse a PDF resume directly. Claude reads the PDF itself (text and layout), so
 * two column layouts and scanned PDFs without a text layer still work.
 */
export async function parseResumePdf(pdf: Uint8Array): Promise<ResumeData> {
  const msg = await anthropic().messages.create({
    model: FAST,
    max_tokens: 4000,
    system: PARSE_SYSTEM,
    messages: [{
      role: "user",
      content: [
        { type: "document", source: { type: "base64", media_type: "application/pdf", data: Buffer.from(pdf).toString("base64") } },
        { type: "text", text: `This PDF is a resume. Return only JSON shaped like ${RESUME_SHAPE}` },
      ],
    }],
  });
  return parseJson(textOf(msg), resumeSchema) as ResumeData;
}

const tailorSchema = z.object({
  resume: resumeSchema,
  coverLetter: z.string(),
  missing: list,
});

export type TailorResult = Omit<z.infer<typeof tailorSchema>, "resume"> & {
  resume: ResumeData;
  model: string;
  inputTokens: number;
  outputTokens: number;
};

/** Write a resume and cover letter for one job, every bullet in Google XYZ format. */
export async function tailorForJob(input: {
  profile: ResumeData;
  job: { title: string; company: string; location: string; description: string; skills: string[] };
}): Promise<TailorResult> {
  const system = `You are HireFlow AI, an expert technical recruiter and resume writer for the Indian and global job market.

Rewrite the candidate's master profile into a one page resume tailored to the job, plus a cover letter.

Hard rules:
1. Every experience and project bullet follows Google's XYZ formula: "Accomplished [X] as measured by [Y], by doing [Z]". Lead with a strong past tense verb. One line each, 15 to 28 words.
2. Use ONLY facts present in the master profile. Never invent employers, titles, dates, degrees, skills, tools, or numbers.
3. If a bullet has no measurable result, write the best honest bullet without a number and add a short question to "missing" asking the candidate for that metric, for example "Fraud model at Acme: what share of fraud did it catch?".
4. Reorder and select experience, projects and skills so the most relevant to the job come first. Drop weak or irrelevant items to fit one page (at most 4 bullets per role, 3 per project, 3 projects).
5. Use the job's keywords where they are true for the candidate. Do not keyword stuff.
6. Cover letter: 220 to 280 words, plain text, addressed to the hiring team at the company, three short paragraphs: why this company and role, two proof points from the resume with numbers, a confident close. No cliches like "I am writing to express".
7. Return ONLY JSON: {"resume": ${RESUME_SHAPE}, "coverLetter": string, "missing": string[]}`;

  const user = `JOB
Title: ${input.job.title}
Company: ${input.job.company}
Location: ${input.job.location}
Key skills: ${input.job.skills.join(", ")}
Description:
"""${input.job.description.slice(0, 12000)}"""

MASTER PROFILE (JSON)
${JSON.stringify(input.profile)}`;

  const msg = await anthropic().messages.create({
    model: STRONG,
    max_tokens: 6000,
    system,
    messages: [{ role: "user", content: user }],
  });
  const parsed = parseJson(textOf(msg), tailorSchema);
  return {
    ...parsed,
    missing: parsed.missing ?? [],
    resume: parsed.resume as ResumeData,
    model: STRONG,
    inputTokens: msg.usage.input_tokens,
    outputTokens: msg.usage.output_tokens,
  };
}

/** Extract structured fields from a job description during ingestion (optional, costs tokens). */
export async function enrichJob(description: string) {
  const msg = await anthropic().messages.create({
    model: FAST,
    max_tokens: 400,
    messages: [{
      role: "user",
      content: `From this job description return only JSON {"experienceMin":number|null,"experienceMax":number|null,"skills":string[] (max 12, lowercase),"salaryMin":number|null,"salaryMax":number|null,"salaryCurrency":string|null}. Use null when not stated.\n\n"""${description.slice(0, 8000)}"""`,
    }],
  });
  return parseJson(textOf(msg), z.object({
    experienceMin: z.number().nullable(),
    experienceMax: z.number().nullable(),
    skills: z.array(z.string()),
    salaryMin: z.number().nullable(),
    salaryMax: z.number().nullable(),
    salaryCurrency: z.string().nullable(),
  }));
}

export const aiEnabled = () => Boolean(process.env.ANTHROPIC_API_KEY);
