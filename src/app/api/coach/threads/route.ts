import { z } from "zod";
import { db } from "@/db";
import { coachThreads } from "@/db/schema";
import { apiUser, error, json } from "@/lib/api";
import { COACH_KINDS } from "@/lib/coach";
import { getJob } from "@/lib/jobs-query";

const schema = z.object({
  kind: z.enum(Object.keys(COACH_KINDS) as [keyof typeof COACH_KINDS, ...(keyof typeof COACH_KINDS)[]]).default("chat"),
  jobId: z.string().min(1).nullable().optional(),
});

/** Start a coach conversation, optionally about one job. Premium only. */
export async function POST(req: Request) {
  const { user, res } = await apiUser();
  if (!user) return res;
  if (user.plan !== "PREMIUM") return error("The AI coach is part of Premium.", 402);
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return error("Invalid request");
  const job = parsed.data.jobId ? await getJob(parsed.data.jobId) : null;
  if (parsed.data.jobId && !job) return error("Job not found", 404);
  const base = COACH_KINDS[parsed.data.kind].title;
  const title = job ? `${base}: ${job.job.title}, ${job.company.name}` : base;
  const [row] = await db.insert(coachThreads).values({ userId: user.id, title: title.slice(0, 140), kind: parsed.data.kind, jobId: job?.job.id ?? null }).returning();
  return json({ thread: row }, 201);
}
