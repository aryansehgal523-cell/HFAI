import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { subscriptions, users } from "@/db/schema";
import { apiUser, error, json } from "@/lib/api";
import { razorpay, razorpayEnabled } from "@/lib/razorpay";

const schema = z.object({ confirm: z.literal("DELETE") });

/**
 * DPDP Act: erase the account and all personal data. Payment rows are deleted with the user;
 * keep invoices in your accounting system (Zoho Books etc.) for GST record keeping.
 */
export async function POST(req: Request) {
  const { user, res } = await apiUser();
  if (!user) return res;
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return error('Type DELETE to confirm');

  const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.userId, user.id)).limit(1);
  if (sub && ["active", "authenticated", "pending"].includes(sub.status) && razorpayEnabled()) {
    try {
      await razorpay().subscriptions.cancel(sub.razorpaySubId, false);
    } catch (e) {
      console.error("cancel on delete failed", e);
      return error("We could not cancel your subscription. Contact support before deleting.", 502);
    }
  }
  await db.delete(users).where(eq(users.id, user.id)); // cascades to every table
  return json({ ok: true });
}
