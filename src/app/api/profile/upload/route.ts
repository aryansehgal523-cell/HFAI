import { eq } from "drizzle-orm";
import { extractText } from "unpdf";
import mammoth from "mammoth";
import { db } from "@/db";
import { profiles } from "@/db/schema";
import { apiUser, error, json, rateLimit } from "@/lib/api";
import { aiEnabled, parseResume, parseResumePdf } from "@/lib/ai";
import { MAX_UPLOAD_BYTES, detailsFromResume, detectResumeFile } from "@/lib/resume-file";
import { mergeDetails } from "@/lib/profile-fields";
import { releaseQuota, takeQuota } from "@/lib/usage";

export const runtime = "nodejs";
export const maxDuration = 60;

const TOO_BIG = "That file is over 4 MB. Save it as a smaller PDF (File, Save as, Reduce size) or paste the text instead.";
const WRONG_TYPE = "We can read PDF and Word (.docx) files. Save your resume as one of those, or paste the text instead.";

/**
 * Upload a PDF or Word resume and fill the master profile from it.
 * The original file is never stored: only the parsed data and the extracted text are kept.
 */
export async function POST(req: Request) {
  const { user, res } = await apiUser();
  if (!user) return res;
  if (!rateLimit(`upload:${user.id}`, 5, 60_000)) return error("Slow down a little. Try again in a minute.", 429);
  if (!aiEnabled()) return error("Resume reading is not available right now. Paste your resume text instead.", 503);

  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > MAX_UPLOAD_BYTES + 64 * 1024) return error(TOO_BIG, 413);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return error("We did not receive a file. Choose your resume and try again.");
  }
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return error("We did not receive a file. Choose your resume and try again.");
  if (file.size > MAX_UPLOAD_BYTES) return error(TOO_BIG, 413);

  const bytes = new Uint8Array(await file.arrayBuffer());
  const kind = detectResumeFile(bytes);
  if (!kind) return error(WRONG_TYPE, 415);

  const quota = await takeQuota(user.id, "resume_upload");
  if (quota) return error(quota, 429);

  let rawText = "";
  try {
    let data;
    if (kind === "pdf") {
      // PDF.js takes ownership of the buffer it reads, so each reader gets its own copy.
      const [parsed, text] = await Promise.all([
        parseResumePdf(bytes.slice()),
        extractText(bytes.slice(), { mergePages: true }).then((r) => r.text).catch(() => ""),
      ]);
      data = parsed;
      rawText = text.trim();
    } else {
      rawText = (await mammoth.extractRawText({ buffer: Buffer.from(bytes) })).value.trim();
      if (rawText.length < 50) {
        await releaseQuota(user.id, "resume_upload");
        return error("We could not find any text in that Word file. Paste your resume text instead.", 422);
      }
      data = await parseResume(rawText);
    }

    const [existing] = await db.select().from(profiles).where(eq(profiles.userId, user.id)).limit(1);
    const applicationDetails = mergeDetails(existing?.applicationDetails, detailsFromResume(data, rawText));
    const values = {
      data,
      rawResume: rawText || null,
      headline: data.headline ?? null,
      location: data.contact?.location ?? null,
      phone: data.contact?.phone ?? null,
      applicationDetails,
    };
    await db
      .insert(profiles)
      .values({ userId: user.id, ...values })
      .onConflictDoUpdate({ target: profiles.userId, set: values });

    return json({ data, applicationDetails, fileKind: kind });
  } catch (e) {
    console.error("resume upload failed", e);
    await releaseQuota(user.id, "resume_upload");
    return error("We could not read that resume. Try again, or use “Paste text instead” below.", 502);
  }
}
