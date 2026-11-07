import { after } from "next/server";
import { computeMatchesForUser } from "@/lib/match-store";
import { db } from "@/db";
import { profiles } from "@/db/schema";
import { apiUser, error, json } from "@/lib/api";
import { preferencesSchema } from "@/lib/profile-fields";
import { recordMasterScore } from "@/lib/score-store";

/** Save job preferences (target roles, cities, work mode, salary...). Used by matching. */
export async function PUT(req: Request) {
  const { user, res } = await apiUser();
  if (!user) return res;
  const parsed = preferencesSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return error(parsed.error.issues[0]?.message ?? "Check your preferences and try again");
  // Dedupe while keeping the user's order.
  const preferences = {
    ...parsed.data,
    targetRoles: [...new Set(parsed.data.targetRoles)],
    cities: [...new Set(parsed.data.cities)],
    workModes: [...new Set(parsed.data.workModes)],
  };
  const [row] = await db
    .insert(profiles)
    .values({ userId: user.id, preferences })
    .onConflictDoUpdate({ target: profiles.userId, set: { preferences } })
    .returning({ data: profiles.data });
  const score = row?.data ? await recordMasterScore(user.id, row.data) : null;
  if (row?.data) after(() => computeMatchesForUser(user.id).catch((e) => console.error("match recompute failed", e)));
  return json({ preferences, score });
}
