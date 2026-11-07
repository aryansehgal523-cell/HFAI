import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/LegalPage";
import { COMPANY } from "@/config/company";

export const metadata: Metadata = { title: "Privacy policy" };

export default function Privacy() {
  const c = COMPANY;
  return (
    <LegalPage
      title="Privacy policy"
      intro={`This policy explains what personal data ${c.legalName} ("${c.brand}", "we") collects when you use our website and services, why we collect it, and the choices and rights you have. We process personal data in line with India's Digital Personal Data Protection Act, 2023 and the rules made under it, and the Information Technology Act, 2000.`}
    >
      <h2>1. Who we are</h2>
      <p>{c.legalName} ({c.cin}) is the Data Fiduciary for your personal data. Our registered office is at {c.address}. You can reach us at <a href={`mailto:${c.privacyEmail}`}>{c.privacyEmail}</a>.</p>

      <h2>2. What we collect</h2>
      <table>
        <thead><tr><th>Data</th><th>Examples</th><th>Why we need it</th></tr></thead>
        <tbody>
          <tr><td>Account data</td><td>Name, email, password (stored only as a secure hash), Google profile name and photo if you sign in with Google</td><td>To create and secure your account</td></tr>
          <tr><td>Resume data</td><td>Work history, education, skills, projects, contact details you include in your resume, and the plain text we extract from a file you upload</td><td>To build your master resume, score it and tailor it to jobs you choose</td></tr>
          <tr><td>Uploaded resume files</td><td>The PDF or Word file you upload</td><td>Read once to fill your profile, then discarded. We never store the original file</td></tr>
          <tr><td>Application details</td><td>Phone, city, state, PIN code, profile links, years of experience, current and expected CTC, notice period, work authorisation, relocation, earliest start date, and optional gender, disability and veteran answers (default &ldquo;Prefer not to say&rdquo;)</td><td>To fill job application forms when you ask us to. Optional answers are only used when you choose to fill them</td></tr>
          <tr><td>Job preferences</td><td>Roles you want, preferred cities, work mode, expected salary, notice period</td><td>To rank jobs for you and score your resume against the roles you want</td></tr>
          <tr><td>Your network</td><td>Contacts you upload from LinkedIn&apos;s Connections.csv or an alumni sheet, or add by hand: name, company, position, profile link, email if LinkedIn included it, when you connected, and how you know them</td><td>To show who you know at each company and draft referral requests. Only you can see them; they are never shown to or used for anyone else, and we never contact them</td></tr>
          <tr><td>Referral requests</td><td>The messages you draft, who they are for, their status, follow up dates and your notes</td><td>To track your referral requests and remind you to follow up</td></tr>
          <tr><td>Job matches</td><td>A match score, reasons and, on Premium, an AI verdict for jobs, computed from your resume and preferences</td><td>To rank jobs for you. Never shared with employers</td></tr>
          <tr><td>Coach conversations</td><td>What you and the AI coach write, with the context it used (your resume, preferences, score and tracker numbers)</td><td>To give you advice and keep your conversation history. You can delete a conversation at any time</td></tr>
          <tr><td>Resume scores</td><td>Your resume score and its breakdown each time it changes</td><td>To show your progress over time</td></tr>
          <tr><td>Usage records</td><td>When you used a metered feature such as a resume upload</td><td>To apply fair use limits</td></tr>
          <tr><td>Activity data</td><td>Jobs you save, statuses in your tracker, tailored resumes and cover letters</td><td>To run the tracker and show your history</td></tr>
          <tr><td>Payment data</td><td>Plan, amount, Razorpay payment and subscription IDs, invoice numbers</td><td>To bill you, issue GST invoices and meet tax law</td></tr>
          <tr><td>Technical data</td><td>IP address, browser type, essential cookies, and usage analytics if you allow them</td><td>Security, fraud prevention and keeping you signed in</td></tr>
          <tr><td>Messages</td><td>What you send through our contact form or email</td><td>To answer you</td></tr>
        </tbody>
      </table>
      <p>We do not collect card numbers, UPI PINs or bank details. These are entered directly with Razorpay, our payment processor, and never reach our servers.</p>

      <h2>3. Consent and legitimate uses</h2>
      <p>We process your personal data on the basis of the consent you give when you create an account, and for legitimate uses permitted by law, such as complying with tax and accounting obligations. You can withdraw consent at any time by deleting your account; this does not affect processing that happened before withdrawal.</p>

      <h2>4. How we use AI</h2>
      <p>To parse and tailor your resume we send the relevant resume text, or the resume file you upload, and the job description to our AI provider, Anthropic, through its commercial API. Under its commercial terms, Anthropic does not use this data to train its models. We only send what is needed for the request you make. We never use AI to invent facts about you, and we never sell your resume.</p>

      <h2>5. Who we share data with</h2>
      <ul>
        <li><strong>Service providers</strong> who process data on our behalf under contract: cloud hosting and database (Vercel and Supabase), AI processing (Anthropic), payments (Razorpay), email delivery, and Google Analytics if you allow analytics.</li>
        <li><strong>Employers</strong>: never automatically. When you apply, you do so on the employer&apos;s own website and choose what to send.</li>
        <li><strong>Authorities</strong> when required by law, a court order or to protect rights and safety.</li>
      </ul>
      <p>We do not sell or rent personal data. Some providers may store data outside India; where they do, we rely on their contractual commitments to protect it, and we will follow any transfer restrictions notified by the Government of India.</p>

      <h2 id="cookies">6. Cookies and analytics</h2>
      <table>
        <thead><tr><th>Cookie</th><th>Type</th><th>Purpose</th><th>Consent</th></tr></thead>
        <tbody>
          <tr><td>next-auth session and csrf cookies</td><td>Essential</td><td>Keep you signed in and protect forms from forgery</td><td>Not required</td></tr>
          <tr><td>hf-consent-v1, theme (browser storage)</td><td>Essential</td><td>Remember your cookie choice and light or dark theme</td><td>Not required</td></tr>
          <tr><td>_ga, _ga_*</td><td>Analytics (Google Analytics 4)</td><td>Count visits and see which features are used, with IP anonymisation</td><td>Only if you choose &quot;Allow analytics&quot;</td></tr>
        </tbody>
      </table>
      <p>We never use advertising or cross site tracking cookies. You can change your choice at any time with <strong>Cookie settings</strong> in the footer; withdrawing consent stops analytics and deletes its cookies.</p>

      <h2>7. How long we keep data</h2>
      <ul>
        <li>Account, resume, application details, preferences and tracker data: until you delete your account.</li>
        <li>Your network: until you delete it (Account and billing, Delete all my connections) or your account. Uploading a newer file updates it in place.</li>
        <li>Uploaded resume files: not kept. The file is read in memory and discarded as soon as your profile is filled.</li>
        <li>Usage records: up to 13 months, then deleted.</li>
        <li>Payment and invoice records: 8 years, as required by Indian tax and company law. These are kept in our accounting system even after account deletion.</li>
        <li>Security logs: up to 1 year.</li>
      </ul>

      <h2>8. Your rights</h2>
      <p>Under the DPDP Act you have the right to:</p>
      <ul>
        <li>Access a summary of your personal data and how it is processed. <Link href="/settings">Download your data</Link> any time from your account.</li>
        <li>Correct and update your data. Edit your <Link href="/profile">master resume</Link> and account details directly.</li>
        <li>Erase your data. Use <strong>Delete my account</strong> in <Link href="/settings">Account and billing</Link>.</li>
        <li>Nominate another person to exercise your rights in case of death or incapacity, by writing to us.</li>
        <li>Grievance redressal, described below, and to complain to the Data Protection Board of India.</li>
      </ul>

      <h2>9. Security</h2>
      <p>Data is encrypted in transit (HTTPS) and at rest by our database provider. Passwords are hashed with bcrypt. Access to production data is limited to staff who need it. If a breach affects you, we will inform you and the Data Protection Board as the law requires.</p>

      <h2>10. Children</h2>
      <p>HireFlow is meant for job seekers aged 18 and over. We do not knowingly process data of children. If you believe a child has created an account, contact us and we will delete it.</p>

      <h2 id="grievance">11. Grievance officer</h2>
      <p>
        {c.grievanceOfficer.name}<br />
        Email: <a href={`mailto:${c.grievanceOfficer.email}`}>{c.grievanceOfficer.email}</a><br />
        {c.address}<br />
        Available {c.grievanceOfficer.hours}. We acknowledge complaints within 24 hours and resolve them within 15 days.
      </p>

      <h2>12. Changes</h2>
      <p>We will post any changes here and update the effective date. For material changes we will email you before they take effect.</p>
    </LegalPage>
  );
}
