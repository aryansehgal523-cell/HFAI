import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/LegalPage";
import { COMPANY } from "@/config/company";

export const metadata: Metadata = { title: "For employers and our crawler" };

export default function Bot() {
  return (
    <LegalPage title="For employers" intro="HireFlow lists your public job openings so more qualified candidates find them, and sends every applicant to your own career page.">
      <h2>How we collect listings</h2>
      <p>Our crawler, HireFlowBot, reads public job board feeds published by applicant tracking systems such as Greenhouse, Lever and Ashby, a few times a day. It identifies itself with the user agent <code>HireFlowBot/1.0</code> and a contact address, makes one request per company per crawl, and respects robots.txt for any page it reads directly.</p>

      <h2>What we show</h2>
      <ul>
        <li>The job title, location, description and salary as you published them.</li>
        <li>A clear link to apply on your site. We never collect applications on your behalf.</li>
        <li>Listings are removed within hours of being taken down from your career page.</li>
      </ul>

      <h2>Removing or correcting your listings</h2>
      <p>Use the <Link href="/contact">contact form</Link> with the topic &quot;Remove my company&apos;s jobs&quot;, or email <a href={`mailto:${COMPANY.supportEmail}`}>{COMPANY.supportEmail}</a>. We act on removal requests within 48 hours.</p>

      <h2>Featured listings</h2>
      <p>Want your roles in front of more candidates? Write to us about featured listings and direct job posting.</p>
    </LegalPage>
  );
}
