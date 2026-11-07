import { z } from "zod";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { coachMessages, coachThreads } from "@/db/schema";
import { apiUser, error, rateLimit } from "@/lib/api";
import { aiEnabled, streamCoachReply } from "@/lib/ai";
import { COACH_SYSTEM, IN_HAND_TOOL, buildCoachContext, runInHandTool } from "@/lib/coach";
import { releaseQuota, takeQuota } from "@/lib/usage";

export const runtime = "nodejs";
export const maxDuration = 60;

const schema = z.object({ content: z.string().trim().min(1, "Type a message").max(4000, "Keep messages under 4,000 characters") });

/** Send a message to the coach; the reply streams back as plain text. Premium only. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { user, res } = await apiUser();
  if (!user) return res;
  if (user.plan !== "PREMIUM") return error("The AI coach is part of Premium.", 402);
  if (!rateLimit(`coach:${user.id}`, 10, 60_000)) return error("Slow down a little. Try again in a minute.", 429);
  if (!aiEnabled()) return error("The coach is not available right now.", 503);
  const { id } = await ctx.params;
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return error(parsed.error.issues[0]?.message ?? "Invalid message");

  const [thread] = await db.select().from(coachThreads).where(and(eq(coachThreads.id, id), eq(coachThreads.userId, user.id))).limit(1);
  if (!thread) return error("Conversation not found", 404);
  const quota = await takeQuota(user.id, "coach_message");
  if (quota) return error(quota, 429);

  const history = await db.select({ role: coachMessages.role, content: coachMessages.content }).from(coachMessages)
    .where(eq(coachMessages.threadId, thread.id)).orderBy(asc(coachMessages.createdAt));
  await db.insert(coachMessages).values({ threadId: thread.id, userId: user.id, role: "user", content: parsed.data.content });
  const context = await buildCoachContext(user.id, thread.jobId);

  const encoder = new TextEncoder();
  const body = new ReadableStream({
    async start(controller) {
      try {
        const result = await streamCoachReply({
          system: `${COACH_SYSTEM}\n\n${context.text}`,
          messages: [
            ...history.slice(-30).map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
            { role: "user" as const, content: parsed.data.content },
          ],
          tools: [IN_HAND_TOOL],
          runTool: (name, args) => (name === "estimate_in_hand" ? runInHandTool(args) : JSON.stringify({ error: "Unknown tool" })),
          onText: (d) => controller.enqueue(encoder.encode(d)),
        });
        await db.insert(coachMessages).values({
          threadId: thread.id, userId: user.id, role: "assistant", content: result.text || "(no reply)",
          inputTokens: result.inputTokens, outputTokens: result.outputTokens,
        });
        await db.update(coachThreads).set({ updatedAt: new Date() }).where(eq(coachThreads.id, thread.id));
      } catch (e) {
        console.error("coach reply failed", e);
        await releaseQuota(user.id, "coach_message");
        controller.enqueue(encoder.encode("\n\nThe coach could not finish that reply. Please try again in a minute."));
      } finally {
        controller.close();
      }
    },
  });
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" } });
}
