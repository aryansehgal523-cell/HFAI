import { apiUser, error } from "@/lib/api";
import { resumeForJob } from "@/lib/ext-data";
import { getJob } from "@/lib/jobs-query";
import { pdfFileName, renderResumePdf } from "@/lib/resume-pdf";

export const runtime = "nodejs";

/** Download the resume as a real PDF: tailored for ?jobId= if one exists, otherwise the master. */
export async function GET(req: Request) {
  const { user, res } = await apiUser();
  if (!user) return res;
  const jobId = new URL(req.url).searchParams.get("jobId");
  const found = await resumeForJob(user.id, jobId);
  if (!found) return error("Add your master resume first.", 412);
  const job = jobId ? await getJob(jobId) : null;
  const pdf = await renderResumePdf(found.resume, job ? `${found.resume.name ?? "Resume"}, ${job.job.title}` : found.resume.name ?? "Resume");
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${pdfFileName(found.resume.name, found.tailored ? job?.company.name : undefined)}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
