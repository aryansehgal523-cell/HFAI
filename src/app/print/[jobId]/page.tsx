import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { tailorings } from "@/db/schema";
import { requireUser } from "@/lib/session";
import { getJob } from "@/lib/jobs-query";
import { ResumeSheet } from "@/components/ResumeSheet";
import { AutoPrint } from "./AutoPrint";

export async function generateMetadata({ params }: { params: Promise<{ jobId: string }> }) {
  const found = await getJob((await params).jobId);
  // The page title becomes the default PDF file name in most browsers.
  return { title: { absolute: found ? `Resume_${found.company.name}_${found.job.title}`.replace(/[^a-zA-Z0-9]+/g, "_") : "Resume" } };
}

export default async function PrintPage({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  const user = await requireUser(`/print/${jobId}`);
  const [t] = await db.select().from(tailorings).where(and(eq(tailorings.userId, user.id), eq(tailorings.jobId, jobId))).limit(1);
  if (!t) notFound();
  return (
    <div className="min-h-screen bg-paper py-10 print:bg-white print:py-0">
      <p className="no-print mx-auto mb-6 max-w-[800px] px-4 text-center text-sm text-slate">
        In the print dialog choose <strong>Save as PDF</strong>, paper size A4, and turn off headers and footers.
      </p>
      <ResumeSheet data={t.resume} className="border border-line shadow-lg" />
      <AutoPrint />
    </div>
  );
}
