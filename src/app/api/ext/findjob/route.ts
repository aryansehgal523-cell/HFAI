import { z } from "zod";
import { extError, extJson, extOptions, extUser } from "@/lib/ext-auth";
import { findJobByUrl, resumeForJob } from "@/lib/ext-data";

export const OPTIONS = extOptions;
const schema = z.object({ url: z.string().url().max(2000), title: z.string().max(300).optional() });

/** Which HireFlow job is this application page for, and is there a tailored resume? */
export async function POST(req: Request) {
  const auth = await extUser(req);
  if (!auth) return extError(req, "Connect the extension again from HireFlow Settings.", 401);
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return extError(req, "Invalid page address");
  const job = await findJobByUrl(parsed.data.url);
  const resume = job ? await resumeForJob(auth.user.id, job.id) : null;
  return extJson(req, { job, tailored: Boolean(resume?.tailored) });
}
