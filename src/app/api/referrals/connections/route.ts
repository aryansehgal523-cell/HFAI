import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { connections } from "@/db/schema";
import { apiUser, error, json, rateLimit } from "@/lib/api";
import { normaliseProfileUrl } from "@/lib/referrals/connectionsCsv";
import { RELATIONSHIPS, importConnections } from "@/lib/referrals/store";

const manual = z.object({
  firstName: z.string().trim().min(1, "Add their first name").max(80),
  lastName: z.string().trim().max(120).default(""),
  company: z.string().trim().min(2, "Add the company they work at").max(160),
  position: z.string().trim().max(200).optional(),
  profileUrl: z.string().trim().max(300).optional(),
  email: z.string().trim().max(200).refine((v) => v === "" || /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v), "Check the email address").optional(),
  relationship: z.enum(RELATIONSHIPS).default("other"),
});

/** Add one person by hand. */
export async function POST(req: Request) {
  const { user, res } = await apiUser();
  if (!user) return res;
  if (!rateLimit(`conn-add:${user.id}`, 60, 60 * 60 * 1000)) return error("Slow down a little and try again.", 429);
  const parsed = manual.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return error(parsed.error.issues[0]?.message ?? "Check the details and try again");
  const d = parsed.data;
  const url = d.profileUrl ? normaliseProfileUrl(d.profileUrl) : null;
  if (d.profileUrl && !url) return error("Paste their LinkedIn profile link, like linkedin.com/in/name");
  await importConnections(user.id, [{
    firstName: d.firstName, lastName: d.lastName, company: d.company, position: d.position || null,
    profileUrl: url, email: d.email ? d.email.toLowerCase() : null, connectedOn: null,
  }], "manual", d.relationship);
  return json({ ok: true }, 201);
}

/** Delete all of the user's connections (Settings). Referral requests keep their snapshot. */
export async function DELETE(req: Request) {
  const { user, res } = await apiUser();
  if (!user) return res;
  const body = await req.json().catch(() => ({}));
  if (body?.confirm !== "DELETE") return error("Type DELETE to confirm");
  const gone = await db.delete(connections).where(eq(connections.userId, user.id)).returning({ id: connections.id });
  return json({ deleted: gone.length });
}
