import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import type { ResumeData } from "@/db/schema";

const FAST = process.env.ANTHROPIC_FAST_MODEL ?? "claude-haiku-5-5";
const STRONG = process.env.ANTHROPIC_STRONG_MODEL ?? "claude-sonnet-5-5";

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

/**
 * Ask for JSON and validate it. Models occasionally answer in prose or slip a field, so on a
 * parse or schema failure we retry once, showing the model its reply and the reason it failed.
 * Token usage covers both attempts.
 */
/**
 * Effort per task. Current Sonnet and Haiku models think adaptively by default, and thinking
 * tokens count towards max_tokens, so extraction runs at low effort and every call gets a
 * generous ceiling (you pay for tokens used, not the ceiling).
 */
type Effort = "low" | "medium" | "high";
const MAX_TOKENS = 16000; // non-streaming ceiling; stays under SDK HTTP timeouts

async function callJson<T>(
  params: { model: string; effort: Effort; system?: string; messages: Anthropic.MessageParam[] },
  schema: z.ZodType<T>,
): Promise<{ data: T; inputTokens: number; outputTokens: number }> {
  let inputTokens = 0;
  let outputTokens = 0;
  let messages = params.messages;
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    const { effort, ...rest } = params;
    // output_config is newer than this SDK's types; the API accepts it, so pass it through.
    const msg = await anthropic().messages.create({
      ...rest,
      max_tokens: MAX_TOKENS,
      messages,
      output_config: { effort },
    } as Anthropic.MessageCreateParamsNonStreaming);
    inputTokens += msg.usage.input_tokens;
    outputTokens += msg.usage.output_tokens;
    const text = textOf(msg);
    try {
      return { data: parseJson(text, schema), inputTokens, outputTokens };
    } catch (e) {
      lastError = e;
      // Development only: never log model output (it contains resume content) in production.
      if (process.env.NODE_ENV !== "production") {
        console.warn(`[ai] unusable reply (attempt ${attempt + 1}, stop=${msg.stop_reason}, out=${msg.usage.output_tokens}, blocks=${msg.content.map((b) => b.type).join("+")}):`, text.slice(0, 300));
      }
      const reason = e instanceof z.ZodError ? e.issues.slice(0, 3).map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") : "it was not a JSON object";
      messages = [
        ...params.messages,
        { role: "assistant", content: text || "(empty)" },
        { role: "user", content: `That reply could not be used because ${reason}. Reply again with ONLY the JSON object, nothing before or after it.` },
      ];
    }
  }
  throw lastError;
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
  const { data } = await callJson({
    model: FAST,
    effort: "low",
    system: PARSE_SYSTEM,
    messages: [{ role: "user", content: `Return only JSON shaped like ${RESUME_SHAPE}\n\nResume:\n"""${raw.slice(0, 20000)}"""` }],
  }, resumeSchema);
  return data as ResumeData;
}

/**
 * Parse a PDF resume directly. Claude reads the PDF itself (text and layout), so
 * two column layouts and scanned PDFs without a text layer still work.
 */
export async function parseResumePdf(pdf: Uint8Array): Promise<ResumeData> {
  const { data } = await callJson({
    model: FAST,
    effort: "low",
    system: PARSE_SYSTEM,
    messages: [{
      role: "user",
      content: [
        { type: "document", source: { type: "base64", media_type: "application/pdf", data: Buffer.from(pdf).toString("base64") } },
        { type: "text", text: `This PDF is a resume. Return only JSON shaped like ${RESUME_SHAPE}` },
      ],
    }],
  }, resumeSchema);
  return data as ResumeData;
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

  const { data: parsed, inputTokens, outputTokens } = await callJson({
    model: STRONG,
    effort: "high",
    system,
    messages: [{ role: "user", content: user }],
  }, tailorSchema);
  return {
    ...parsed,
    missing: parsed.missing ?? [],
    resume: parsed.resume as ResumeData,
    model: STRONG,
    inputTokens,
    outputTokens,
  };
}

/** Extract structured fields from a job description during ingestion (optional, costs tokens). */
export async function enrichJob(description: string) {
  const { data } = await callJson({
    model: FAST,
    effort: "low",
    messages: [{
      role: "user",
      content: `From this job description return only JSON {"experienceMin":number|null,"experienceMax":number|null,"skills":string[] (max 12, lowercase),"salaryMin":number|null,"salaryMax":number|null,"salaryCurrency":string|null}. Use null when not stated.\n\n"""${description.slice(0, 8000)}"""`,
    }],
  }, z.object({
    experienceMin: z.number().nullable(),
    experienceMax: z.number().nullable(),
    skills: z.array(z.string()),
    salaryMin: z.number().nullable(),
    salaryMax: z.number().nullable(),
    salaryCurrency: z.string().nullable(),
  }));
  return data;
}

export const aiEnabled = () => Boolean(process.env.ANTHROPIC_API_KEY);

// ─── Referral requests ───────────────────────────────────────

const referralSchema = z.object({
  subject: opt,
  message: z.string().min(20),
  followUp: z.string().min(10),
});

export type ReferralDraft = z.infer<typeof referralSchema> & { model: string; inputTokens: number; outputTokens: number };

/**
 * Draft a personal referral request. The caller passes only true facts about the
 * relationship (src/lib/referrals/draft.ts relationshipFact) and enforces the length.
 */
export async function draftReferral(input: {
  senderName: string;
  person: { firstName: string; position: string | null };
  relationshipFact: string | null;
  job: { title: string; company: string; link: string };
  resume: ResumeData;
  tone: "friendly" | "formal";
  channel: "linkedin" | "email";
}): Promise<ReferralDraft> {
  const limit = input.channel === "linkedin" ? "under 550 characters in total (LinkedIn's limit is 600)" : "under 140 words";
  const system = `You write short, personal referral requests for Indian job seekers. The user will read, edit and send it themselves.

Rules:
1. Greet the person by first name.
2. Mention how they know each other ONLY using the relationship fact given. If it is "none", do not claim any shared history.
3. Name the exact role and company, and include this link exactly once: ${input.job.link}
4. Give two specific proof points from the resume, each with a number where the resume has one, in XYZ style (what was achieved, measured how, by doing what). Use only facts in the resume. Never invent.
5. Make one small, clear ask: "Would you be open to referring me, or pointing me to the right person?" (you may adapt the wording to the tone).
6. Offer to send the resume.
7. ${input.channel === "email" ? "Also write a short subject line." : "No subject line."} Keep the message ${limit}. Plain text, no emoji, no hashtags.
8. Tone: ${input.tone === "friendly" ? "warm and casual, like a message to someone you know" : "polite and professional"}.
9. Also write "followUp": a two sentence nudge to send 5 days later if there is no reply.

Return ONLY JSON: {"subject": string|null, "message": string, "followUp": string}`;

  const user = `Sender: ${input.senderName}
Person: ${input.person.firstName}${input.person.position ? `, ${input.person.position}` : ""}
Relationship fact: ${input.relationshipFact ?? "none"}
Role: ${input.job.title} at ${input.job.company}
Link: ${input.job.link}

RESUME (JSON)
${JSON.stringify({ headline: input.resume.headline, summary: input.resume.summary, experience: input.resume.experience.slice(0, 3), projects: input.resume.projects.slice(0, 2) })}`;

  const { data, inputTokens, outputTokens } = await callJson({ model: STRONG, effort: "medium", system, messages: [{ role: "user", content: user }] }, referralSchema);
  return { ...data, model: STRONG, inputTokens, outputTokens };
}

// ─── Job match verdicts (Premium, daily) ─────────────────────

const verdictSchema = z.object({
  verdicts: z.array(z.object({
    id: z.string(),
    verdict: z.enum(["strong", "good", "stretch"]),
    reason: z.string().min(5),
  })),
});

/** One verdict and one sentence per job, from the candidate's real profile. */
export async function rerankMatches(
  profile: { resume: ResumeData | null; years?: number; targetRoles?: string[]; cities?: string[]; expectedSalaryLpa?: number },
  jobs: { id: string; title: string; company: string; location: string; experience: string; skills: string[]; summary: string }[],
) {
  const r = profile.resume;
  const summary = {
    headline: r?.headline, years: profile.years, wants: profile.targetRoles, cities: profile.cities, expectedLpa: profile.expectedSalaryLpa,
    recentRoles: r?.experience.slice(0, 3).map((e) => `${e.title} at ${e.company}`),
    skills: r?.skills.flatMap((s) => s.items).slice(0, 30),
  };
  const { data } = await callJson({
    model: FAST,
    effort: "low",
    system: "You are a careful career adviser for Indian job seekers. Judge fit honestly from the facts given. Never invent facts about the candidate or the job.",
    messages: [{
      role: "user",
      content: `Candidate: ${JSON.stringify(summary)}

For EACH job below give a verdict: "strong" (clearly qualified, should apply today), "good" (qualified with small gaps) or "stretch" (worth a shot but real gaps), and ONE plain sentence (under 25 words) naming the main reason. Use the job ids exactly.

Jobs: ${JSON.stringify(jobs)}

Return only JSON: {"verdicts":[{"id":string,"verdict":"strong"|"good"|"stretch","reason":string}]}`,
    }],
  }, verdictSchema);
  return data.verdicts;
}

// ─── AI coach (streaming, with the in hand estimate tool) ─────

/**
 * Stream a coach reply. Text is passed to onText as it arrives; if the model calls a tool,
 * we run it and continue (at most 3 rounds). Returns the full text and token usage.
 */
export async function streamCoachReply(input: {
  system: string;
  messages: Anthropic.MessageParam[];
  tools: Anthropic.Tool[];
  runTool: (name: string, args: unknown) => string;
  onText: (delta: string) => void;
}) {
  let messages = input.messages;
  let text = "";
  let inputTokens = 0;
  let outputTokens = 0;
  for (let round = 0; round < 3; round++) {
    const stream = anthropic().messages.stream({
      model: STRONG,
      max_tokens: 16000,
      system: input.system,
      tools: input.tools,
      messages,
      output_config: { effort: "medium" },
    } as Anthropic.MessageCreateParamsNonStreaming);
    stream.on("text", (d) => { text += d; input.onText(d); });
    const msg = await stream.finalMessage();
    inputTokens += msg.usage.input_tokens;
    outputTokens += msg.usage.output_tokens;
    if (msg.stop_reason !== "tool_use") break;
    const results: Anthropic.ToolResultBlockParam[] = msg.content
      .filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use")
      .map((b) => ({ type: "tool_result", tool_use_id: b.id, content: input.runTool(b.name, b.input) }));
    messages = [...messages, { role: "assistant", content: msg.content }, { role: "user", content: results }];
  }
  return { text, inputTokens, outputTokens, model: STRONG };
}
