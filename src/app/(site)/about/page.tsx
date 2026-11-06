import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "About" };

export default function About() {
  return (
    <div className="container-x py-16">
      <div className="mx-auto max-w-[64ch]">
        <h1 className="text-5xl font-semibold sm:text-6xl">Job hunting shouldn&apos;t feel like shouting into a void</h1>
        <div className="mt-10 space-y-6 text-lg leading-relaxed text-ink-soft">
          <p>Most job seekers in India send the same resume to dozens of listings, many of which closed weeks ago or were never real. Recruiters skim each resume for a few seconds, and an ATS filters out most of them before a person ever looks.</p>
          <p>HireFlow AI fixes both ends. We collect jobs directly from company career pages and hide the stale ones. Then, for every job you choose, we rewrite your resume around what that role asks for, with each line stating what you achieved, how it was measured and how you did it.</p>
          <p>We started HireFlow in New Delhi as engineers who went through the same search. We hold ourselves to two rules: every job links to the real employer, and the AI never invents anything about you.</p>
        </div>
        <div className="mt-12 flex flex-wrap gap-3">
          <Link href="/jobs" className="btn-primary">Find jobs</Link>
          <Link href="/contact" className="btn-ghost">Get in touch</Link>
        </div>
      </div>
    </div>
  );
}
