import { eq } from "drizzle-orm";
import { db } from "@/db";
import { applications, coachMessages, coachThreads, connections, jobMatches, payments, profiles, referralRequests, resumeScores, subscriptions, tailorings, usageEvents } from "@/db/schema";
import { apiUser } from "@/lib/api";

/** DPDP Act: let users download everything we hold about them. */
export async function GET() {
  const { user, res } = await apiUser();
  if (!user) return res;
  const [profile, apps, tails, subs, pays, usage, conns, refs, scores, matches, threads, messages] = await Promise.all([
    db.select().from(profiles).where(eq(profiles.userId, user.id)),
    db.select().from(applications).where(eq(applications.userId, user.id)),
    db.select().from(tailorings).where(eq(tailorings.userId, user.id)),
    db.select().from(subscriptions).where(eq(subscriptions.userId, user.id)),
    db.select().from(payments).where(eq(payments.userId, user.id)),
    db.select({ kind: usageEvents.kind, createdAt: usageEvents.createdAt }).from(usageEvents).where(eq(usageEvents.userId, user.id)),
    db.select().from(connections).where(eq(connections.userId, user.id)),
    db.select().from(referralRequests).where(eq(referralRequests.userId, user.id)),
    db.select().from(resumeScores).where(eq(resumeScores.userId, user.id)),
    db.select().from(jobMatches).where(eq(jobMatches.userId, user.id)),
    db.select().from(coachThreads).where(eq(coachThreads.userId, user.id)),
    db.select().from(coachMessages).where(eq(coachMessages.userId, user.id)),
  ]);
  const { passwordHash: _omit, ...account } = user;
  const body = JSON.stringify({ exportedAt: new Date().toISOString(), account, profile: profile[0] ?? null, applications: apps, tailorings: tails, subscriptions: subs, payments: pays, usage, connections: conns, referralRequests: refs, resumeScores: scores, jobMatches: matches, coachThreads: threads, coachMessages: messages }, null, 2);
  return new Response(body, {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="hireflow-data-${new Date().toISOString().slice(0, 10)}.json"`,
    },
  });
}
