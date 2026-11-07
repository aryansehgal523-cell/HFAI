import { z } from "zod";
import { db } from "@/db";
import { applications } from "@/db/schema";
import { extError, extJson, extOptions, extUser } from "@/lib/ext-auth";
import { findJobByUrlOrId, upsertManualJob } from "@/lib/ext-data";

export const OPTIONS = extOptions;
const schema = z.object({ url: z.string().url().max(2000), title: z.string().max(300).default(""), company: z.string().max(200).default(""), jobId: z.string().nullable().optional() });

/** After the user submits: mark the job applied in the tracker (adding it if HireFlow did not know it). */
export async function POST(req: Request) {
  const auth = await extUser(req);
  if (!auth) return extError(req, "Connect the extension again from HireFlow Settings.", 401);
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return extError(req, "Invalid request");
  const known = await findJobByUrlOrId(parsed.data.url, parsed.data.jobId);
  const jobId = known?.id ?? (await upsertManualJob(parsed.data));
  const now = new Date();
  await db.insert(applications).values({ userId: auth.user.id, jobId, status: "APPLIED", appliedAt: now })
    .onConflictDoUpdate({ target: [applications.userId, applications.jobId], set: { status: "APPLIED", appliedAt: now } });
  return extJson(req, { ok: true, jobId, added: !known });
}
