import { z } from "zod";
import { after } from "next/server";
import { computeMatchesForUser } from "@/lib/match-store";

import { db } from "@/db";
import { profiles } from "@/db/schema";
import { apiUser, error, json, rateLimit } from "@/lib/api";
import { eq } from "drizzle-orm";
import { aiEnabled, parseResume } from "@/lib/ai";
import { detailsFromResume } from "@/lib/resume-file";
import { mergeDetails } from "@/lib/profile-fields";
import { recordMasterScore } from "@/lib/score-store";

const schema = z.object({ text: z.string().min(200, "Paste your full resume (at least a few lines)").max(30000) });

/** Parse pasted resume text into the structured master profile. Free for all users. */
export async function POST(req: Request) {
  const { user, res } = await apiUser();
  if (!user) return res;
  if (!rateLimit(`parse:${user.id}`, 10, 24 * 60 * 60 * 1000)) return error("Daily limit reached for resume imports", 429);
  if (!aiEnabled()) return error("AI is not configured on this server (missing ANTHROPIC_API_KEY)", 503);

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return error(parsed.error.issues[0]?.message ?? "Invalid request");

  try {
    const data = await parseResume(parsed.data.text);
    const [existing] = await db.select().from(profiles).where(eq(profiles.userId, user.id)).limit(1);
    const applicationDetails = mergeDetails(existing?.applicationDetails, detailsFromResume(data, parsed.data.text));
    const values = {
      rawResume: parsed.data.text, data, applicationDetails,
      headline: data.headline ?? null, location: data.contact?.location ?? null, phone: data.contact?.phone ?? null,
    };
    await db.insert(profiles).values({ userId: user.id, ...values }).onConflictDoUpdate({ target: profiles.userId, set: values });
    const score = await recordMasterScore(user.id, data);
    after(() => computeMatchesForUser(user.id).catch((e) => console.error("match recompute failed", e)));
    return json({ data, applicationDetails, score });
  } catch (e) {
    console.error("parseResume failed", e);
    return error("We could not read that resume. Check the text and try again.", 502);
  }
}
