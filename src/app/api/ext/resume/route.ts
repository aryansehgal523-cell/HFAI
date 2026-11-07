import { extError, extOptions, extUser, corsHeaders } from "@/lib/ext-auth";
import { resumeForJob } from "@/lib/ext-data";
import { getJob } from "@/lib/jobs-query";
import { pdfFileName, renderResumePdf } from "@/lib/resume-pdf";

export const runtime = "nodejs";
export const OPTIONS = extOptions;

/** Premium: the resume PDF to attach (tailored for this job if there is one). */
export async function GET(req: Request) {
  const auth = await extUser(req);
  if (!auth) return extError(req, "Connect the extension again from HireFlow Settings.", 401);
  if (auth.user.plan !== "PREMIUM") return extError(req, "Attaching your resume is part of Premium.", 402);
  const jobId = new URL(req.url).searchParams.get("jobId");
  const found = await resumeForJob(auth.user.id, jobId);
  if (!found) return extError(req, "Add your resume on HireFlow first.", 412);
  const job = jobId ? await getJob(jobId) : null;
  const pdf = await renderResumePdf(found.resume, job ? `${found.resume.name ?? "Resume"}, ${job.job.title}` : found.resume.name ?? "Resume");
  return new Response(new Uint8Array(pdf), {
    headers: {
      ...corsHeaders(req),
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${pdfFileName(found.resume.name, found.tailored ? job?.company.name : undefined)}"`,
      "Cache-Control": "no-store",
    },
  });
}
