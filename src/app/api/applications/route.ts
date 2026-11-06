import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { applications, jobs } from "@/db/schema";
import { apiUser, error, json } from "@/lib/api";

const schema = z.object({
  jobId: z.string().min(1),
  status: z.enum(["SAVED", "APPLIED", "INTERVIEWING", "OFFER", "REJECTED", "HIDDEN"]).default("SAVED"),
});

/** Save a job to the tracker, or move it to another status. */
export async function POST(req: Request) {
  const { user, res } = await apiUser();
  if (!user) return res;
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return error("Invalid request");

  const [job] = await db.select({ id: jobs.id }).from(jobs).where(eq(jobs.id, parsed.data.jobId)).limit(1);
  if (!job) return error("Job not found", 404);

  const appliedAt = parsed.data.status === "APPLIED" ? new Date() : undefined;
  const [row] = await db
    .insert(applications)
    .values({ userId: user.id, jobId: job.id, status: parsed.data.status, appliedAt })
    .onConflictDoUpdate({
      target: [applications.userId, applications.jobId],
      set: { status: parsed.data.status, ...(appliedAt ? { appliedAt } : {}) },
    })
    .returning();
  return json(row);
}
