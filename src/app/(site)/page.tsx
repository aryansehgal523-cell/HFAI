import Link from "next/link";
import { Suspense } from "react";
import { ArrowRight } from "lucide-react";
import { SearchBar } from "@/components/Filters";
import { HeroDemo } from "@/components/HeroDemo";
import { XyzCompare } from "@/components/XyzCompare";
import { Faq } from "@/components/Faq";
import { JobRow } from "@/components/JobRow";
import { searchJobs, siteStats } from "@/lib/jobs-query";
import { PLANS, perApplicationRupees, rupees } from "@/lib/plans";

export const revalidate = 300;

const STEPS = [
  {
    title: "Apply first",
    body: "Fresh openings straight from company career pages, ranked for you. Every job shows a match score and the reasons behind it, so you reach the right roles before the crowd does.",
  },
  {
    title: "Apply right",
    body: "A resume rewritten for each job in XYZ format, a resume score you can watch go up, and one click autofill that fills the application with the right resume attached.",
  },
  {
    title: "Get referred",
    body: "See who you know at every company, who to ask first, and send a personal referral request built from your resume. Then track who replied.",
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
  { q: "Do you apply to jobs for me?", a: "You stay in control. The Chrome extension fills the form and attaches your resume, but you review it and press submit yourself. Bots that auto apply get accounts banned and annoy recruiters." },
  { q: "Is my LinkedIn network safe with you?", a: "Your contacts are visible only to you and are never used for anyone else. We never message them or scrape LinkedIn: you upload LinkedIn's own export, and you send every referral request yourself. You can delete your network at any time." },
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
              HireFlow finds fresh openings straight from company career pages, ranks them for you, rewrites your resume for each job, and shows you who can refer you.
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
        <h2 className="max-w-2xl text-4xl font-semibold sm:text-5xl">Apply first. Apply right. Get referred.</h2>
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

      {/* Referral engine */}
      <section id="referrals" className="container-x scroll-mt-20 py-24">
        <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
          <div>
            <h2 className="text-4xl font-semibold sm:text-5xl">A referral beats a hundred cold applications</h2>
            <p className="mt-5 text-lg text-slate">
              Upload your LinkedIn connections once. On every job, HireFlow shows who you know at that company, ranks who can help most, and drafts a short, personal request that links your best results to the role.
            </p>
            <ul className="mt-6 space-y-2 text-ink-soft">
              <li>• Alumni and ex colleagues first, then team leads, then recruiters</li>
              <li>• Messages written from your real resume, never invented</li>
              <li>• Follow up reminders, and a clear view of who replied</li>
            </ul>
            <Link href="/referrals" className="btn-ink mt-8">Connect your network</Link>
          </div>
          <div className="panel p-6" aria-hidden>
            <p className="text-sm font-semibold">Your network at Kestrel Pay</p>
            {[["Ishaan Gupta", "Staff Engineer", "Ex colleague", "Leads a team in this area"], ["Deepa Krishnan", "Backend Developer", "Alumni", "Works in the same area as this role"], ["Kavya Rao", "Talent Acquisition Lead", "", "Recruiter, can tell you about the role"]].map(([n, p, rel, why]) => (
              <div key={n} className="mt-3 rounded-xl border border-line p-3">
                <p className="font-medium text-ink">{n}</p>
                <p className="text-sm text-slate">{p}</p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {rel && <span className="rounded-md bg-mint-tint px-2 py-0.5 text-xs text-mint-ink">{rel}</span>}
                  <span className="rounded-md bg-cobalt-tint px-2 py-0.5 text-xs text-ink">{why}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Chrome extension */}
      <section className="bg-white py-24">
        <div className="container-x grid gap-12 lg:grid-cols-2 lg:items-center">
          <div className="order-2 lg:order-1 panel p-6" aria-hidden>
            <p className="text-sm text-mint-ink">Filled 18 fields.</p>
            <p className="text-sm text-marigold-deep">2 need you: salary history, start date.</p>
            <p className="mt-2 text-xs text-slate">Your tailored resume for this job was used. Check everything, then submit the form yourself.</p>
            <div className="mt-4 border-t border-line pt-3">
              <p className="text-sm text-ink">Why do you want to work here?</p>
              <span className="mt-2 inline-block rounded-full bg-cobalt-tint px-3 py-1 text-xs font-medium text-cobalt">Write with AI</span>
            </div>
          </div>
          <div className="order-1 lg:order-2">
            <h2 className="text-4xl font-semibold sm:text-5xl">Fill the application in one click</h2>
            <p className="mt-5 text-lg text-slate">
              The HireFlow Chrome extension fills Greenhouse, Lever, Ashby, Workday and other application forms with your details, attaches the resume tailored to that job, and helps you answer the custom questions. You always review and press submit.
            </p>
            <Link href="/extension" className="btn-ink mt-8">See how it works</Link>
          </div>
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
            <h2 className="text-4xl font-semibold sm:text-5xl">{rupees(PLANS.monthly.price)} a month for {PLANS.monthly.monthlyCredits} tailored applications</h2>
            <p className="mt-5 text-lg text-slate">
              That&apos;s about ₹{perApplicationRupees()} per job for a rewritten resume, a cover letter and a resume score, plus the referral engine, autofill and your AI coach. Searching and tracking stay free forever.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/pricing" className="btn-ink">Compare plans</Link>
              <Link href="/signup" className="btn-ghost">Start free</Link>
            </div>
          </div>
          <div className="panel overflow-hidden">
            {[
              ["Job search, filters, alerts and tracker", "Free", "Free"],
              ["Tailored resumes and cover letters", `${PLANS.free.monthlyCredits} a month`, `${PLANS.monthly.monthlyCredits} a month`],
              ["Resume score and match score", "Included", "Before and after, plus AI verdicts"],
              ["Referral engine", "See how many you know", "Names, drafts and tracking"],
              ["Autofill and AI coach", "Try autofill 3 times a month", "Included"],
              ["Word and PDF downloads", "PDF only", "PDF and Word"],
              ["Price", "₹0", `${rupees(PLANS.monthly.price)} / month`],
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
