import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { referralRequests } from "@/db/schema";
import { apiUser, error, json } from "@/lib/api";
import { followUpDate } from "@/lib/referrals/draft";
import { referralNow } from "@/lib/referrals/store";

const STATUSES = ["drafted", "sent", "replied", "referred", "declined", "no_response"] as const;

const patch = z.object({
  message: z.string().trim().min(1).max(4000).optional(),
  subject: z.string().trim().max(200).nullable().optional(),
  status: z.enum(STATUSES).optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  followUpAt: z.string().datetime().nullable().optional(),
});

/** Edit the draft, move it between statuses, add notes or change the follow up date. */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { user, res } = await apiUser();
  if (!user) return res;
  const { id } = await ctx.params;
  const parsed = patch.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return error(parsed.error.issues[0]?.message ?? "Invalid request");

  const [current] = await db.select().from(referralRequests).where(and(eq(referralRequests.id, id), eq(referralRequests.userId, user.id))).limit(1);
  if (!current) return error("Not found", 404);

  const d = parsed.data;
  const set: Partial<typeof referralRequests.$inferInsert> = { updatedAt: new Date() };
  if (d.message !== undefined) set.message = d.message;
  if (d.subject !== undefined) set.subject = d.subject;
  if (d.notes !== undefined) set.notes = d.notes;
  if (d.followUpAt !== undefined) set.followUpAt = d.followUpAt ? new Date(d.followUpAt) : null;
  if (d.status) {
    set.status = d.status;
    if (d.status === "sent" && !current.sentAt) {
      const now = referralNow(req.headers.get("x-hf-as-of"));
      set.sentAt = now;
      if (d.followUpAt === undefined) set.followUpAt = followUpDate(now);
    }
    // A reply or a decision ends the follow up.
    if (["replied", "referred", "declined"].includes(d.status) && d.followUpAt === undefined) set.followUpAt = null;
  }
  const [row] = await db.update(referralRequests).set(set).where(eq(referralRequests.id, id)).returning();
  return json({ request: row });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { user, res } = await apiUser();
  if (!user) return res;
  const { id } = await ctx.params;
  const [row] = await db.delete(referralRequests).where(and(eq(referralRequests.id, id), eq(referralRequests.userId, user.id))).returning({ id: referralRequests.id });
  return row ? json({ ok: true }) : error("Not found", 404);
}
