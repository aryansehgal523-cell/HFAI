import type { Metadata } from "next";
import { ContactForm } from "@/components/ContactForm";
import { COMPANY } from "@/config/company";

export const metadata: Metadata = { title: "Contact" };

export default function Contact() {
  const c = COMPANY;
  return (
    <div className="container-x py-16">
      <div className="grid gap-12 lg:grid-cols-[0.9fr_1.1fr]">
        <div>
          <h1 className="text-5xl font-semibold">Talk to us</h1>
          <p className="mt-4 max-w-md text-lg text-slate">Questions about your account, billing, or a job listing. A real person reads every message.</p>

          <dl className="mt-10 space-y-6 text-[15px]">
            <div>
              <dt className="font-semibold">Support</dt>
              <dd className="text-slate"><a className="text-cobalt" href={`mailto:${c.supportEmail}`}>{c.supportEmail}</a></dd>
            </div>
            <div id="grievance" className="scroll-mt-24">
              <dt className="font-semibold">Grievance officer</dt>
              <dd className="text-slate">
                {c.grievanceOfficer.name}<br />
                <a className="text-cobalt" href={`mailto:${c.grievanceOfficer.email}`}>{c.grievanceOfficer.email}</a><br />
                {c.grievanceOfficer.hours}. Acknowledged within 24 hours, resolved within 15 days.
              </dd>
            </div>
            <div>
              <dt className="font-semibold">Registered office</dt>
              <dd className="text-slate">{c.legalName}<br />{c.address}<br />CIN: {c.cin}<br />GSTIN: {c.gstin}</dd>
            </div>
          </dl>
        </div>
        <ContactForm />
      </div>
    </div>
  );
}
