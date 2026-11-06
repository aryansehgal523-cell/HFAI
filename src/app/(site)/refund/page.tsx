import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/LegalPage";
import { COMPANY } from "@/config/company";

export const metadata: Metadata = { title: "Refund and cancellation policy" };

export default function Refund() {
  const c = COMPANY;
  return (
    <LegalPage title="Refund and cancellation policy" intro="We want paying for HireFlow to feel safe. Here is exactly how cancelling and refunds work.">
      <h2>Cancelling Premium</h2>
      <ul>
        <li>Cancel any time from <Link href="/settings">Account and billing</Link>. No calls, no emails needed.</li>
        <li>Your plan stays active, with any remaining credits, until the end of the period you have already paid for. You will not be charged again.</li>
        <li>Cancelling in Razorpay or revoking your UPI AutoPay mandate also stops renewal; your plan then ends at the close of the current period.</li>
      </ul>

      <h2>Refunds</h2>
      <table>
        <thead><tr><th>Situation</th><th>What happens</th></tr></thead>
        <tbody>
          <tr><td>You were charged and have used no Premium credits in that period</td><td>Full refund if you ask within 7 days of the charge</td></tr>
          <tr><td>A renewal happened that you forgot to cancel, and you used no credits since</td><td>Full refund if you ask within 7 days of the renewal</td></tr>
          <tr><td>You were charged twice, or charged after cancelling</td><td>Full refund of the extra charge, at any time</td></tr>
          <tr><td>A tailoring failed because of a technical error</td><td>The credit is returned automatically</td></tr>
          <tr><td>You used credits in the period</td><td>No refund for that period, as the service was delivered. You can still cancel future renewals.</td></tr>
          <tr><td>Top up packs that have been partly used</td><td>No refund</td></tr>
        </tbody>
      </table>

      <h2>How to request a refund</h2>
      <p>Write to <a href={`mailto:${c.supportEmail}`}>{c.supportEmail}</a> or use the <Link href="/contact">contact form</Link> with the topic &quot;Billing&quot;, from the email on your account, with your invoice number. We reply within 2 working days.</p>
      <p>Approved refunds go back to the original payment method through Razorpay and usually reach you within 5 to 7 working days, depending on your bank.</p>

      <h2>Delivery</h2>
      <p>HireFlow is a digital service. Premium and top up credits are delivered instantly to your account after payment; nothing is shipped physically.</p>
    </LegalPage>
  );
}
