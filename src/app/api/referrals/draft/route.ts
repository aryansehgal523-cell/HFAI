import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { connections, profiles, referralRequests, tailorings } from "@/db/schema";
import { apiUser, error, json, rateLimit } from "@/lib/api";
import { aiEnabled, draftReferral } from "@/lib/ai";
import { getJob } from "@/lib/jobs-query";
import { enforceDraft, relationshipFact } from "@/lib/referrals/draft";
import { releaseQuota, takeQuota } from "@/lib/usage";

export const maxDuration = 60;

const schema = z.object({
  jobId: z.string().min(1),
  connectionId: z.string().min(1),
  tone: z.enum(["friendly", "formal"]).default("friendly"),
  channel: z.enum(["linkedin", "email"]).default("linkedin"),
});

/** Premium: draft a referral request to one person for one job. HireFlow never sends it. */
export async function POST(req: Request) {
  const { user, res } = await apiUser();
  if (!user) return res;
  if (user.plan !== "PREMIUM") return error("Referral requests are part of Premium. Upgrade to draft one.", 402);
  if (!rateLimit(`ref-draft:${user.id}`, 15, 60_000)) return error("Slow down a little. Try again in a minute.", 429);
  if (!aiEnabled()) return error("Drafting is not available right now. Try again later.", 503);

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return error("Choose a person and a job");
  const { jobId, connectionId, tone, channel } = parsed.data;

  const [found, [conn], [profile], [tailored]] = await Promise.all([
    getJob(jobId),
    db.select().from(connections).where(and(eq(connections.id, connectionId), eq(connections.userId, user.id))).limit(1),
    db.select({ data: profiles.data }).from(profiles).where(eq(profiles.userId, user.id)).limit(1),
    db.select({ resume: tailorings.resume }).from(tailorings).where(and(eq(tailorings.userId, user.id), eq(tailorings.jobId, jobId))).limit(1),
  ]);
  if (!found) return error("Job not found", 404);
  if (!conn) return error("Person not found", 404);
  const resume = tailored?.resume ?? profile?.data;
  if (!resume) return error("Add your master resume first, so the message can mention what you have done.", 412);
  if (channel === "email" && !conn.email) return error(`We do not have an email for ${conn.firstName}. Choose a LinkedIn message instead.`);

  const quota = await takeQuota(user.id, "referral_draft");
  if (quota) return error(quota, 429);

  try {
    const college = profile?.data?.education?.[0]?.school ?? null;
    const fact = relationshipFact(conn, college);
    const link = found.job.applyUrl;
    const draft = await draftReferral({
      senderName: user.name ?? resume.name ?? "",
      person: { firstName: conn.firstName, position: conn.position },
      relationshipFact: fact,
      job: { title: found.job.title, company: found.company.name, link },
      resume,
      tone,
      channel,
    });
    const message = enforceDraft(draft.message, { channel, link, firstName: conn.firstName });
    const followUp = enforceDraft(draft.followUp, { channel, link, firstName: conn.firstName });
    const [row] = await db.insert(referralRequests).values({
      userId: user.id, jobId, connectionId: conn.id,
      personName: `${conn.firstName} ${conn.lastName}`.trim(), personPosition: conn.position, personUrl: conn.profileUrl, personEmail: conn.email,
      channel, tone, subject: channel === "email" ? draft.subject ?? `Referral for ${found.job.title} at ${found.company.name}` : null,
      message, followUpMessage: followUp, status: "drafted",
      model: draft.model, inputTokens: draft.inputTokens, outputTokens: draft.outputTokens,
    }).returning();
    return json({ request: row });
  } catch (e) {
    console.error("referral draft failed", e);
    await releaseQuota(user.id, "referral_draft");
    return error("We could not write the draft. Try again in a minute.", 502);
  }
}
