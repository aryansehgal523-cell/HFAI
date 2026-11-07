import type { Metadata } from "next";
import Link from "next/link";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { connections, payments, subscriptions } from "@/db/schema";
import { requireUser } from "@/lib/session";
import { formatINR } from "@/lib/utils";
import { splitGst } from "@/lib/plans";
import { CancelPlan, DeleteAccount, DeleteConnections, TopUp } from "@/components/SettingsActions";
import { ExtensionConnect } from "@/components/ExtensionConnect";

export const metadata: Metadata = { title: "Account and billing" };

export default async function Settings() {
  const user = await requireUser("/settings");
  const [[sub], pays, [{ conns }]] = await Promise.all([
    db.select().from(subscriptions).where(eq(subscriptions.userId, user.id)).limit(1),
    db.select().from(payments).where(eq(payments.userId, user.id)).orderBy(desc(payments.createdAt)).limit(24),
    db.select({ conns: sql<number>`count(*)::int` }).from(connections).where(eq(connections.userId, user.id)),
  ]);

  return (
    <div className="container-x max-w-3xl py-12">
      <h1 className="text-4xl font-semibold">Account and billing</h1>

      <Card title="Account">
        <dl className="grid gap-4 text-[15px] sm:grid-cols-2">
          <div><dt className="text-sm text-slate">Name</dt><dd>{user.name ?? "Not set"}</dd></div>
          <div><dt className="text-sm text-slate">Email</dt><dd>{user.email}</dd></div>
          <div><dt className="text-sm text-slate">Sign in method</dt><dd>{user.passwordHash ? "Email and password" : "Google"}</dd></div>
          <div><dt className="text-sm text-slate">Member since</dt><dd>{user.createdAt.toLocaleDateString("en-IN", { month: "long", year: "numeric" })}</dd></div>
        </dl>
      </Card>

      <Card title="Plan">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="font-display text-2xl font-semibold">{user.plan === "PREMIUM" ? "Premium" : "Free"}</p>
            <p className="text-sm text-slate">
              {user.credits} credits left.{" "}
              {sub?.status === "active" && sub.currentPeriodEnd
                ? sub.cancelAtPeriodEnd
                  ? `Ends on ${sub.currentPeriodEnd.toLocaleDateString("en-IN")}.`
                  : `Renews on ${sub.currentPeriodEnd.toLocaleDateString("en-IN")} (${sub.interval}).`
                : null}
              {sub?.status === "pending" && " Your last renewal failed; Razorpay will retry. Check your UPI mandate or card."}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {user.plan === "PREMIUM" ? (
              <>
                <TopUp />
                {sub && !sub.cancelAtPeriodEnd && ["active", "authenticated"].includes(sub.status) && <CancelPlan endsAt={sub.currentPeriodEnd?.toISOString() ?? null} />}
              </>
            ) : (
              <Link href="/pricing" className="btn-primary btn-sm">Upgrade to Premium</Link>
            )}
          </div>
        </div>
      </Card>

      <Card title="Payments and invoices">
        {pays.length === 0 ? (
          <p className="text-slate">No payments yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-slate">
                <tr><th className="pb-2 font-medium">Date</th><th className="pb-2 font-medium">Invoice</th><th className="pb-2 font-medium">Item</th><th className="pb-2 text-right font-medium">Amount</th><th className="pb-2 text-right font-medium">GST (18%)</th></tr>
              </thead>
              <tbody>
                {pays.map((p) => {
                  const { gst } = splitGst(p.amount);
                  return (
                    <tr key={p.id} className="border-t border-line">
                      <td className="py-2.5">{p.createdAt.toLocaleDateString("en-IN")}</td>
                      <td className="py-2.5 tabular-nums">{p.invoiceNumber}</td>
                      <td className="py-2.5">{p.kind === "topup" ? "10 credit top up" : "Premium plan"}</td>
                      <td className="py-2.5 text-right tabular-nums">{formatINR(p.amount)}</td>
                      <td className="py-2.5 text-right tabular-nums text-slate">{formatINR(gst)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-4 text-xs text-slate">Need a GST invoice with your company&apos;s GSTIN? <Link href="/contact" className="underline">Contact billing</Link>.</p>
      </Card>

      <Card title="Chrome extension">
        <p className="mb-4 text-[15px] text-slate">Fill job application forms in one click with your details and the right resume. <Link href="/extension" className="text-cobalt underline underline-offset-2">How it works</Link></p>
        <ExtensionConnect />
      </Card>

      <Card title="Your network">
        <p className="mb-4 text-[15px] text-slate">The LinkedIn connections and contacts you uploaded for the referral engine. Only you can see them.</p>
        <DeleteConnections count={conns} />
      </Card>

      <Card title="Your data">
        <p className="text-[15px] text-slate">Download a copy of everything we store about you, or delete your account and all its data. These are your rights under India&apos;s Digital Personal Data Protection Act.</p>
        <div className="mt-5 flex flex-wrap items-start gap-3">
          <a href="/api/account/export" className="btn-ghost btn-sm">Download my data</a>
          <DeleteAccount />
        </div>
      </Card>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="panel mt-6 p-6 sm:p-7">
      <h2 className="mb-5 text-xl font-semibold">{title}</h2>
      {children}
    </section>
  );
}
