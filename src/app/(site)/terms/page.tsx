import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/LegalPage";
import { COMPANY } from "@/config/company";

export const metadata: Metadata = { title: "Terms of service" };

export default function Terms() {
  const c = COMPANY;
  return (
    <LegalPage title="Terms of service" intro={`These terms are an agreement between you and ${c.legalName} ("${c.brand}", "we", "us"). By creating an account or using the service you agree to them. If you do not agree, do not use ${c.brand}.`}>
      <h2>1. The service</h2>
      <p>{c.brand} lets you search job listings collected from public company career pages, track your applications, and generate resumes and cover letters tailored to specific jobs using artificial intelligence. We are not an employer, recruitment agency or placement agency, we do not guarantee interviews or jobs, and we never charge candidates to apply for a job.</p>

      <h2>2. Eligibility and accounts</h2>
      <ul>
        <li>You must be at least 18 years old and able to form a binding contract under Indian law.</li>
        <li>Keep your login details secure. You are responsible for activity on your account.</li>
        <li>One person, one account. Accounts may not be shared or resold.</li>
      </ul>

      <h2>3. Job listings</h2>
      <p>Listings come from employers&apos; public career pages and are provided as is. We filter stale and suspicious listings but cannot guarantee that every job is accurate, available or genuine. Always verify details on the employer&apos;s own site. Never pay anyone who asks for money to give you a job, and report such listings to us.</p>

      <h2>4. Your content and AI output</h2>
      <ul>
        <li>You own the resume content you provide and the documents generated for you.</li>
        <li>You give us a limited licence to store and process your content only to provide the service to you.</li>
        <li>AI generated text can contain mistakes. You are responsible for reviewing every resume and cover letter before you send it, and for making sure it is truthful. Do not submit claims you cannot back up.</li>
        <li>You must not upload content that you do not have the right to use, or that is unlawful, defamatory or misleading.</li>
      </ul>

      <h2>5. Plans, credits and payment</h2>
      <ul>
        <li>The Free plan includes 3 credits every 30 days. Premium includes 30 credits every 30 days. One credit creates a tailored resume and cover letter for one job.</li>
        <li>Credits reset every 30 days, do not roll over and have no cash value. Top up credits expire with the plan period in which they were bought.</li>
        <li>Premium renews automatically each month or year through Razorpay using the payment mandate you set up (UPI AutoPay, card or e mandate) until you cancel.</li>
        <li>Prices are in Indian rupees and include GST at 18%. We may change prices with at least 30 days&apos; notice; changes apply from your next renewal.</li>
        <li>Refunds are covered by our <Link href="/refund">refund and cancellation policy</Link>.</li>
      </ul>

      <h2>6. Acceptable use</h2>
      <p>You agree not to: scrape or copy the service or its listings in bulk; use bots to create accounts or generate documents; resell access; attempt to break, overload or reverse engineer the service; use it to harass anyone or to send spam; or use it in violation of any law.</p>

      <h2>7. Intellectual property</h2>
      <p>The {c.brand} name, logo, website design, software and the compilation of listings belong to us or our licensors. Job descriptions remain the property of the employers who published them.</p>

      <h2>8. Suspension and termination</h2>
      <p>You can delete your account at any time from <Link href="/settings">Account and billing</Link>. We may suspend or close accounts that break these terms, with notice where practical. If we close your account without cause, we will refund the unused part of any prepaid period.</p>

      <h2>9. Disclaimers and liability</h2>
      <p>The service is provided &quot;as is&quot; without warranties of any kind to the extent permitted by law. To the extent permitted by law, our total liability for any claim relating to the service is limited to the amount you paid us in the 3 months before the claim. We are not liable for indirect or consequential losses, including lost job opportunities.</p>

      <h2>10. Indemnity</h2>
      <p>You agree to compensate us for claims arising from content you submit or your breach of these terms.</p>

      <h2>11. Governing law and disputes</h2>
      <p>These terms are governed by the laws of India. Courts in {c.jurisdiction} have exclusive jurisdiction. Before going to court, please contact our grievance officer so we can try to resolve the issue.</p>

      <h2>12. Contact</h2>
      <p>{c.legalName}, {c.address}. Email <a href={`mailto:${c.supportEmail}`}>{c.supportEmail}</a>. Grievance officer: {c.grievanceOfficer.name}, <a href={`mailto:${c.grievanceOfficer.email}`}>{c.grievanceOfficer.email}</a>.</p>
    </LegalPage>
  );
}
