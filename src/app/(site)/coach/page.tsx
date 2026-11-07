import type { Metadata } from "next";
import Link from "next/link";
import { and, asc, desc, eq } from "drizzle-orm";
import { Lock } from "lucide-react";
import { db } from "@/db";
import { coachMessages, coachThreads } from "@/db/schema";
import { requireUser } from "@/lib/session";
import { getJob } from "@/lib/jobs-query";
import { CoachChat } from "@/components/CoachChat";

export const metadata: Metadata = { title: "AI coach" };

const SAMPLES = [
  {
    title: "Why am I not getting calls?",
    q: "I have applied to 40 jobs and got 1 call. Why?",
    a: "Your resume scores 54. Two things hold it back: 7 of your 9 bullets have no number, and recruiters searching for Backend Engineer roles look for Kafka and Docker, which your resume does not mention. You also applied mostly to roles asking for 3 to 5 years while you have 1. Fix the bullets first, then aim at 0 to 2 year roles where you match at least 70%.",
  },
  {
    title: "Interview prep",
    q: "Prepare me for the Data Analyst interview at Kestrel Pay.",
    a: "Expect SQL first. Likely question: “Tell me about an analysis that changed a decision.” Your STAR answer: at Acme you found that 18% of churn came from failed UPI retries (situation and task), built a weekly retry dashboard in Power BI (action), and the product team cut churn by 4 points in a quarter (result).",
  },
  {
    title: "Negotiating an offer",
    q: "I got 18 LPA. Is that good, and what will I take home?",
    a: "On the new regime, 18 LPA is about ₹1.22 lakh a month in hand (an estimate: your salary breakup changes it). For 3 years of backend experience in Bengaluru that is in the fair range. Ask once, politely, for 20: “I'm excited about the role. Based on my scope and the market for this stack, is there room to get closer to 20?”",
  },
];

export default async function CoachPage({ searchParams }: { searchParams: Promise<{ t?: string; job?: string }> }) {
  const user = await requireUser("/coach");
  const sp = await searchParams;

  if (user.plan !== "PREMIUM") {
    return (
      <div className="container-x max-w-4xl py-12">
        <h1 className="text-4xl font-semibold">AI coach</h1>
        <p className="mt-2 max-w-2xl text-slate">A coach that knows your resume, your score and your tracker. Prepare for interviews, practise with a mock interview, find out why calls are not coming, and negotiate offers with real in hand numbers.</p>
        <div className="mt-8 space-y-4">
          {SAMPLES.map((s) => (
            <article key={s.title} className="panel p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate">Sample: {s.title}</p>
              <p className="ml-auto mt-3 w-fit max-w-[85%] rounded-2xl bg-cobalt px-4 py-3 text-[15px] text-white">{s.q}</p>
              <p className="mt-3 max-w-[85%] rounded-2xl bg-paper px-4 py-3 text-[15px] leading-relaxed text-ink">{s.a}</p>
            </article>
          ))}
        </div>
        <div className="light-scope mt-8 flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-ink px-6 py-5 text-white">
          <p><span className="font-semibold">The coach is part of Premium.</span> <span className="text-white/70">Up to 60 messages a day, with your own resume and jobs.</span></p>
          <Link href="/pricing" className="btn bg-white text-ink hover:bg-paper"><Lock className="h-4 w-4" />See Premium</Link>
        </div>
      </div>
    );
  }

  const [threads, active, found] = await Promise.all([
    db.select({ id: coachThreads.id, title: coachThreads.title, updatedAt: coachThreads.updatedAt }).from(coachThreads)
      .where(eq(coachThreads.userId, user.id)).orderBy(desc(coachThreads.updatedAt)).limit(50),
    sp.t ? db.select().from(coachThreads).where(and(eq(coachThreads.id, sp.t), eq(coachThreads.userId, user.id))).limit(1).then((r) => r[0]) : Promise.resolve(undefined),
    sp.job ? getJob(sp.job) : Promise.resolve(null),
  ]);
  const messages = active
    ? await db.select({ role: coachMessages.role, content: coachMessages.content }).from(coachMessages).where(eq(coachMessages.threadId, active.id)).orderBy(asc(coachMessages.createdAt))
    : [];
  const jobId = active?.jobId ?? found?.job.id ?? null;
  const jobInfo = jobId ? (found && found.job.id === jobId ? found : await getJob(jobId)) : null;

  return (
    <div className="container-x py-10">
      <h1 className="mb-6 text-4xl font-semibold">AI coach</h1>
      <CoachChat
        key={active?.id ?? `new-${sp.job ?? ""}`}
        threads={threads.map((t) => ({ ...t, updatedAt: t.updatedAt.toISOString() }))}
        activeId={active?.id ?? null}
        initialMessages={messages.map((m) => ({ role: m.role as "user" | "assistant", content: m.content }))}
        job={jobInfo ? { id: jobInfo.job.id, title: `${jobInfo.job.title}, ${jobInfo.company.name}` } : null}
      />
    </div>
  );
}
