import Link from "next/link";
import { Logo } from "./Logo";
import { CookieSettingsLink } from "./CookieSettingsLink";

const cols = [
  {
    title: "Product",
    links: [["/jobs", "Find jobs"], ["/#resume", "XYZ resume builder"], ["/pricing", "Pricing"], ["/dashboard", "Application tracker"]],
  },
  {
    title: "Company",
    links: [["/about", "About"], ["/contact", "Contact"], ["/bot", "For employers and our crawler"]],
  },
  {
    title: "Legal",
    links: [["/terms", "Terms of service"], ["/privacy", "Privacy policy"], ["/refund", "Refund and cancellation"], ["/contact#grievance", "Grievance officer"]],
  },
];

export function Footer() {
  const company = process.env.NEXT_PUBLIC_COMPANY_NAME ?? "HireFlow AI Private Limited";
  return (
    <footer className="light-scope mt-24 bg-ink text-white/70">
      <div className="container-x grid gap-12 py-16 md:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div className="max-w-xs">
          <Logo light />
          <p className="mt-4 text-sm leading-relaxed">
            Real jobs from company career pages, and a resume written for each one. Made in New Delhi.
          </p>
        </div>
        {cols.map((c) => (
          <div key={c.title}>
            <h3 className="font-sans text-sm font-semibold tracking-normal text-white">{c.title}</h3>
            <ul className="mt-4 space-y-2.5 text-sm">
              {c.links.map(([href, label]) => (
                <li key={href}>
                  <Link href={href} className="transition hover:text-white">{label}</Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-white/10">
        <div className="container-x flex flex-col gap-2 py-6 text-xs text-white/50 sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} {company}. All rights reserved.</p>
          <p className="flex flex-wrap gap-x-4 gap-y-1"><span>Prices in INR, inclusive of 18% GST. Payments secured by Razorpay.</span><CookieSettingsLink className="underline underline-offset-2 hover:text-white" /></p>
        </div>
      </div>
    </footer>
  );
}
