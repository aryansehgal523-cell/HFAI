import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, ShieldCheck } from "lucide-react";

export const metadata: Metadata = {
  title: "Chrome extension: one click autofill",
  description: "Fill job applications on Greenhouse, Lever, Ashby, Workday and more in one click with your HireFlow profile and tailored resume. You review and submit.",
};

const STEPS = [
  ["Install the extension", "Coming soon to the Chrome Web Store. Until then, load it in developer mode (below)."],
  ["Connect it", "In HireFlow, open Account and billing, press “Connect the Chrome extension”, and type the 8 character code into the extension."],
  ["Open an application", "On Greenhouse, Lever, Ashby, Workday, SmartRecruiters or Darwinbox you will see a small HireFlow button. On any other site, click the extension icon and choose “Autofill this page”."],
  ["Press Autofill, then review", "Your details and the tailored resume for that job are filled in. Green fields were filled; yellow ones need you. Check everything and press submit yourself."],
];

export default function ExtensionPage() {
  return (
    <div className="container-x max-w-4xl py-14">
      <h1 className="text-4xl font-semibold sm:text-5xl">Fill applications in one click</h1>
      <p className="mt-4 max-w-2xl text-lg text-slate">
        The HireFlow Chrome extension fills job application forms with your profile, attaches the resume tailored to that job, and helps you answer the “why this company” questions from your real experience.
      </p>

      <ol className="mt-10 grid gap-4 sm:grid-cols-2">
        {STEPS.map(([title, body], i) => (
          <li key={title} className="panel p-5">
            <span className="grid h-8 w-8 place-items-center rounded-full bg-ink text-sm font-semibold text-white" aria-hidden>{i + 1}</span>
            <h2 className="mt-3 text-lg font-semibold">{title}</h2>
            <p className="mt-1 text-[15px] text-slate">{body}</p>
          </li>
        ))}
      </ol>

      <section aria-labelledby="plans-title" className="mt-12 grid gap-4 sm:grid-cols-2">
        <h2 id="plans-title" className="sr-only">What each plan includes</h2>
        <div className="panel p-5">
          <p className="font-semibold">Free</p>
          <ul className="mt-3 space-y-2 text-[15px] text-ink-soft">
            <li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-slate" />Contact details on 3 applications a month</li>
          </ul>
        </div>
        <div className="panel p-5">
          <p className="font-semibold">Premium</p>
          <ul className="mt-3 space-y-2 text-[15px] text-ink-soft">
            {["Every field we can match: experience, CTC, notice period, education, eligibility", "Attaches your tailored resume as a PDF", "“Write with AI” for custom questions, from your real resume", "Marks the job as applied in your tracker"].map((t) => (
              <li key={t} className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-mint" />{t}</li>
            ))}
          </ul>
          <Link href="/pricing" className="btn-primary btn-sm mt-4">See Premium</Link>
        </div>
      </section>

      <section aria-labelledby="privacy-title" className="mt-12 rounded-2xl bg-mint-tint p-6">
        <h2 id="privacy-title" className="flex items-center gap-2 text-xl font-semibold"><ShieldCheck className="h-5 w-5 text-mint-ink" />Privacy, in short</h2>
        <ul className="mt-3 list-disc space-y-1.5 pl-5 text-[15px] text-ink-soft">
          <li>It reads only the form on the page you choose to fill, and only after you press Autofill.</li>
          <li>It sends us the page address (to find the job) and, if you ask for an AI answer, that question. Nothing else from the page.</li>
          <li>It never presses submit, never solves CAPTCHAs and never touches password fields.</li>
          <li>You can disconnect it any time in Account and billing. <Link href="/privacy" className="underline underline-offset-2">Full privacy policy</Link>.</li>
        </ul>
      </section>

      <section aria-labelledby="dev-title" className="mt-12">
        <h2 id="dev-title" className="text-xl font-semibold">Install in developer mode</h2>
        <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-[15px] text-ink-soft">
          <li>Get the extension folder from your HireFlow team (or build it with <code className="rounded bg-paper px-1">npm run ext:build</code>).</li>
          <li>Open <code className="rounded bg-paper px-1">chrome://extensions</code> and switch on <strong>Developer mode</strong>.</li>
          <li>Press <strong>Load unpacked</strong> and choose the <code className="rounded bg-paper px-1">extension/dist</code> folder.</li>
          <li>Pin the HireFlow icon, then connect it from Account and billing.</li>
        </ol>
      </section>
    </div>
  );
}
