import Link from "next/link";
import { Suspense } from "react";
import { ArrowRight } from "lucide-react";
import { SearchBar } from "@/components/Filters";
import { HeroDemo } from "@/components/HeroDemo";
import { XyzCompare } from "@/components/XyzCompare";
import { Faq } from "@/components/Faq";
import { JobRow } from "@/components/JobRow";
import { searchJobs, siteStats } from "@/lib/jobs-query";

export const revalidate = 300;

const STEPS = [
  {
    title: "Find a real job",
    body: "We read company career pages several times a day. Closed, stale and reposted listings are hidden, and every Apply button goes to the company itself.",
  },
  {
    title: "Tailor in one click",
    body: "Your master resume is rewritten for that one job: the right projects first, the job's keywords where they are true, every bullet in XYZ format.",
  },
  {
    title: "Apply and track",
    body: "Download a clean, ATS safe PDF or Word file with a matching cover letter, apply on the company site, and track every application in one place.",
  },
];

const HIDDEN = [
  ["Posted more than 90 days ago and still open", "Usually a pipeline listing, not a real opening"],
  ["The same role reposted three or more times", "Often a ghost job kept up for appearances"],
  ["No working apply link on the company site", "We only list jobs you can actually apply to"],
  ["A description too thin to judge the role", "Common in scam and data harvesting posts"],
];

const FAQ = [
  { q: "Where do the jobs come from?", a: "Directly from company career pages and the public job boards of the hiring systems they use, such as Greenhouse, Lever and Ashby. We never copy listings from LinkedIn, Naukri or Indeed, and every job links to the company's own application page." },
  { q: "Will the AI invent experience I don't have?", a: "No. HireFlow only rearranges and rewrites facts from your master resume. If a bullet would be stronger with a number you haven't given us, it asks you for it rather than guessing." },
  { q: "What is a credit?", a: "One credit gives you a resume and cover letter tailored to one job, with unlimited edits and downloads for that job. Free accounts get 3 credits a month, Premium gets 30." },
  { q: "Do you apply to jobs for me?", a: "You stay in control. We prepare everything and send you to the company's application page; you review and press submit. Bots that auto apply get accounts banned and annoy recruiters." },
  { q: "Can I cancel any time?", a: "Yes. Cancel from your account page and Premium stays active until the end of the period you've paid for. See our refund policy for details." },
];

export default async function Home() {
  const [stats, latest] = await Promise.all([
    siteStats().catch(() => ({ open: 0, companies: 0, today: 0 })),
    searchJobs({ page: 1 }).catch(() => ({ rows: [] })),
  ]);
  const fmt = (n: number) => n.toLocaleString("en-IN");

  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(60rem_30rem_at_85%_10%,rgba(51,70,242,0.10),transparent_60%)]" />
        <div className="container-x grid items-center gap-14 pb-20 pt-14 md:pt-20 lg:grid-cols-[1.05fr_1fr]">
          <div>
            <h1 className="text-[44px] font-semibold leading-[1.02] sm:text-[60px] lg:text-[68px]" style={{ fontVariationSettings: '"wdth" 92' }}>
              Real jobs.
              <br />
              <span className="text-ink-soft">A new resume for every&nbsp;one.</span>
            </h1>
            <p className="mt-6 max-w-[34rem] text-lg text-slate">
              HireFlow finds fresh openings straight from company career pages, then rewrites your resume in Google&apos;s XYZ format and drafts a cover letter for each job you choose.
            </p>

            <div className="mt-8">
              <Suspense>
                <SearchBar target="/jobs" hero />
              </Suspense>
            </div>
            <p className="mt-4 text-sm text-slate">Free to search. 3 tailored resumes a month on us, no card needed.</p>
          </div>
          <HeroDemo />
        </div>
      </section>

      {/* Live numbers */}
      <section className="border-y border-line bg-white">
        <div className="container-x py-8">
          <p className="max-w-4xl font-display text-xl leading-snug text-ink-soft sm:text-2xl">
            <span className="font-semibold text-ink">{fmt(stats.open)}</span> open jobs from{" "}
            <span className="font-semibold text-ink">{fmt(stats.companies)}</span> companies right now,{" "}
            <span className="font-semibold text-ink">{fmt(stats.today)}</span> added in the last 24 hours. Every one links to the company&apos;s own career page.
          </p>
        </div>
      </section>

      {/* How it works: a real sequence */}
      <section className="container-x py-24">
        <h2 className="max-w-2xl text-4xl font-semibold sm:text-5xl">From search to submitted in about ten minutes</h2>
        <ol className="mt-14 grid gap-10 md:grid-cols-3 md:gap-8">
          {STEPS.map((s, i) => (
            <li key={s.title} className="relative">
              <div className="flex items-center gap-3">
                <span className="grid h-9 w-9 place-items-center rounded-full bg-ink font-display text-sm font-semibold text-white">{i + 1}</span>
                {i < STEPS.length - 1 && <span className="hidden h-px flex-1 bg-line md:block" />}
              </div>
              <h3 className="mt-5 text-2xl font-semibold">{s.title}</h3>
              <p className="mt-3 text-slate">{s.body}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* XYZ resume */}
      <section id="resume" className="scroll-mt-20 bg-white py-24">
        <div className="container-x grid gap-12 lg:grid-cols-[0.85fr_1.15fr] lg:items-center">
          <div>
            <h2 className="text-4xl font-semibold sm:text-5xl">Bullets that read like results</h2>
            <p className="mt-5 text-lg text-slate">
              Google&apos;s recruiters popularised a simple formula: <em>accomplished X, as measured by Y, by doing Z.</em> HireFlow rewrites every line of your resume this way, for each job you apply to.
            </p>
            <dl className="mt-8 space-y-4">
              {[
                ["bg-cobalt", "X", "The outcome you delivered"],
                ["bg-marigold", "Y", "The number that proves it"],
                ["bg-mint", "Z", "The skills and tools you used"],
              ].map(([c, k, v]) => (
                <div key={k} className="flex items-center gap-4">
                  <dt className={`grid h-9 w-9 place-items-center rounded-lg font-display font-semibold text-ink ${c} ${k === "X" ? "text-white" : ""}`}>{k}</dt>
                  <dd className="text-ink">{v}</dd>
                </div>
              ))}
            </dl>
          </div>
          <XyzCompare />
        </div>
      </section>

      {/* Ghost jobs */}
      <section className="container-x py-24">
        <div className="grid gap-12 lg:grid-cols-[0.85fr_1.15fr]">
          <div>
            <h2 className="text-4xl font-semibold sm:text-5xl">We hide the jobs that aren&apos;t really there</h2>
            <p className="mt-5 text-lg text-slate">
              Every listing gets a freshness check each time we crawl. Anything that looks stale or fake is kept out of your results, so your time goes to openings that exist.
            </p>
          </div>
          <ul className="divide-y divide-line border-y border-line">
            {HIDDEN.map(([t, d]) => (
              <li key={t} className="grid gap-1 py-5 sm:grid-cols-[1fr_1fr] sm:gap-6">
                <span className="font-medium text-ink">{t}</span>
                <span className="text-slate">{d}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Latest jobs */}
      <section className="bg-white py-24">
        <div className="container-x">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <h2 className="text-4xl font-semibold sm:text-5xl">Just posted</h2>
            <Link href="/jobs" className="inline-flex items-center gap-1.5 font-medium text-cobalt hover:underline">
              See all jobs <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="mt-8 border-t border-line">
            {latest.rows.slice(0, 5).map((j) => (
              <JobRow key={j.id} job={j} showSave={false} />
            ))}
            {latest.rows.length === 0 && <p className="py-10 text-slate">Jobs will appear here after the first crawl runs.</p>}
          </div>
        </div>
      </section>

      {/* Pricing teaser */}
      <section className="container-x py-24">
        <div className="grid gap-10 lg:grid-cols-2 lg:items-center">
          <div>
            <h2 className="text-4xl font-semibold sm:text-5xl">₹599 a month for 30 tailored applications</h2>
            <p className="mt-5 text-lg text-slate">
              That&apos;s about ₹20 per job for a rewritten resume, a cover letter and an ATS check. Searching and tracking stay free forever.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/pricing" className="btn-ink">Compare plans</Link>
              <Link href="/signup" className="btn-ghost">Start free</Link>
            </div>
          </div>
          <div className="panel overflow-hidden">
            {[
              ["Job search, filters, alerts and tracker", "Free", "Free"],
              ["Tailored resumes and cover letters", "3 a month", "30 a month"],
              ["XYZ rewriting and ATS score", "Included", "Included"],
              ["Word and PDF downloads", "PDF only", "PDF and Word"],
              ["Price", "₹0", "₹599 / month"],
            ].map(([f, a, b], i) => (
              <div key={f} className={`grid grid-cols-[1.6fr_1fr_1fr] gap-3 px-5 py-4 text-sm ${i % 2 ? "bg-paper/60" : ""}`}>
                <span className="text-ink">{f}</span>
                <span className="text-slate">{a}</span>
                <span className="font-medium text-ink">{b}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="container-x pb-8">
        <h2 className="text-4xl font-semibold sm:text-5xl">Questions people ask</h2>
        <div className="mt-10">
          <Faq items={FAQ} />
        </div>
      </section>

      {/* Final CTA */}
      <section className="container-x pt-16">
        <div className="light-scope relative overflow-hidden rounded-[28px] bg-ink px-6 py-16 text-center sm:px-12">
          <div className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-cobalt/40 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-28 right-0 h-72 w-72 rounded-full bg-marigold/25 blur-3xl" />
          <h2 className="relative mx-auto max-w-2xl text-4xl font-semibold text-white sm:text-5xl">Your next application deserves its own resume</h2>
          <p className="relative mx-auto mt-4 max-w-lg text-white/70">Paste your resume once. We&apos;ll handle the rewriting for every job after that.</p>
          <Link href="/signup" className="btn relative mt-8 bg-white text-ink hover:bg-paper">Create my free account</Link>
        </div>
      </section>
    </>
  );
}
