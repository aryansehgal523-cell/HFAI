import { z } from "zod";
import { extError, extJson, extOptions, extUser } from "@/lib/ext-auth";
import { answerApplicationQuestion, aiEnabled } from "@/lib/ai";
import { resumeForJob } from "@/lib/ext-data";
import { getJob } from "@/lib/jobs-query";
import { releaseQuota, takeQuota } from "@/lib/usage";

export const OPTIONS = extOptions;
export const maxDuration = 60;
const schema = z.object({ question: z.string().trim().min(5).max(600), jobId: z.string().nullable().optional(), maxWords: z.number().int().min(20).max(400).default(150) });

/** Premium: answer a custom form question from the user's real resume (50 a day). */
export async function POST(req: Request) {
  const auth = await extUser(req);
  if (!auth) return extError(req, "Connect the extension again from HireFlow Settings.", 401);
  if (auth.user.plan !== "PREMIUM") return extError(req, "Writing answers with AI is part of Premium.", 402);
  if (!aiEnabled()) return extError(req, "AI answers are not available right now.", 503);
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return extError(req, "Select a question on the form first.");
  const found = await resumeForJob(auth.user.id, parsed.data.jobId ?? null);
  if (!found) return extError(req, "Add your resume on HireFlow first.", 412);
  const quota = await takeQuota(auth.user.id, "ext_answer");
  if (quota) return extError(req, quota, 429);
  try {
    const job = parsed.data.jobId ? await getJob(parsed.data.jobId) : null;
    const r = await answerApplicationQuestion({
      question: parsed.data.question, maxWords: parsed.data.maxWords, resume: found.resume,
      job: job ? { title: job.job.title, company: job.company.name, description: job.job.description } : null,
    });
    return extJson(req, { answer: r.answer });
  } catch (e) {
    console.error("ext answer failed", e);
    await releaseQuota(auth.user.id, "ext_answer");
    return extError(req, "Could not write an answer. Try again.", 502);
  }
}
