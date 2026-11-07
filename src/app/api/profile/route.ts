import { z } from "zod";
import { db } from "@/db";
import { profiles, type ResumeData } from "@/db/schema";
import { apiUser, error, json } from "@/lib/api";
import { applicationDetailsSchema } from "@/lib/profile-fields";
import { recordMasterScore } from "@/lib/score-store";

const item = z.looseObject({});
const schema = z.object({
  headline: z.string().max(200).optional(),
  location: z.string().max(120).optional(),
  phone: z.string().max(30).optional(),
  data: z.looseObject({
    experience: z.array(item),
    projects: z.array(item),
    education: z.array(item),
    skills: z.array(item),
    achievements: z.array(z.string()),
  }),
  applicationDetails: applicationDetailsSchema.optional(),
});

/** Save the structured master profile after the user edits it. */
export async function PUT(req: Request) {
  const { user, res } = await apiUser();
  if (!user) return res;
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return error(issue?.path[0] === "applicationDetails" ? `Application details: ${issue.message}` : "Profile data is incomplete");
  }
  const values = { ...parsed.data, data: parsed.data.data as unknown as ResumeData };
  await db
    .insert(profiles)
    .values({ userId: user.id, ...values })
    .onConflictDoUpdate({ target: profiles.userId, set: values });
  const score = await recordMasterScore(user.id, values.data);
  return json({ ok: true, score });
}
