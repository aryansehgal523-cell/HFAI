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

const resumeSchema = z.object({
  name: z.string().optional(),
  headline: z.string().optional(),
  contact: z
    .object({
      email: z.string().optional(),
      phone: z.string().optional(),
      location: z.string().optional(),
      links: z.array(z.string()).optional(),
    })
    .optional(),
  summary: z.string().optional(),
  experience: z.array(z.object({
    company: z.string(), title: z.string(), location: z.string().optional(),
    start: z.string().optional(), end: z.string().optional(), bullets: z.array(z.string()),
  })).default([]),
  projects: z.array(z.object({
    name: z.string(), tech: z.array(z.string()).optional(), link: z.string().optional(), bullets: z.array(z.string()),
  })).default([]),
  education: z.array(z.object({
    school: z.string(), degree: z.string(), start: z.string().optional(), end: z.string().optional(), score: z.string().optional(),
  })).default([]),
  skills: z.array(z.object({ group: z.string(), items: z.array(z.string()) })).default([]),
  achievements: z.array(z.string()).default([]),
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

/** Turn pasted resume text into the structured master profile. */
export async function parseResume(raw: string): Promise<ResumeData> {
  const msg = await anthropic().messages.create({
    model: FAST,
    max_tokens: 4000,
    system:
      "You convert resumes into JSON. Copy facts exactly as written. Never invent employers, dates, numbers, skills or links. Omit fields that are absent.",
    messages: [{ role: "user", content: `Return only JSON shaped like ${RESUME_SHAPE}\n\nResume:\n"""${raw.slice(0, 20000)}"""` }],
  });
  return parseJson(textOf(msg), resumeSchema) as ResumeData;
}

const tailorSchema = z.object({
  resume: resumeSchema,
  coverLetter: z.string(),
  missing: z.array(z.string()).default([]),
});

export type TailorResult = z.infer<typeof tailorSchema> & {
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
