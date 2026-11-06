import { z } from "zod";
import { db } from "@/db";
import { profiles } from "@/db/schema";
import { apiUser, error, json, rateLimit } from "@/lib/api";
import { aiEnabled, parseResume } from "@/lib/ai";

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
    await db
      .insert(profiles)
      .values({ userId: user.id, rawResume: parsed.data.text, data, headline: data.headline, location: data.contact?.location, phone: data.contact?.phone })
      .onConflictDoUpdate({ target: profiles.userId, set: { rawResume: parsed.data.text, data } });
    return json({ data });
  } catch (e) {
    console.error("parseResume failed", e);
    return error("We could not read that resume. Check the text and try again.", 502);
  }
}
