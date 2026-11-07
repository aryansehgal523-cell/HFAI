"use client";
import Link from "next/link";
import { useState } from "react";
import { ExternalLink, Lock, Send, Users } from "lucide-react";
import { ReferralComposer, type ComposerPerson } from "./ReferralComposer";
import { cn } from "@/lib/utils";

export type NetworkPerson = ComposerPerson & { relationship: string | null; reason: string; tier: number; requestStatus: string | null };

const REL: Record<string, string> = { alumni: "Alumni", ex_colleague: "Ex colleague", friend: "Friend", family: "Family", other: "Contact" };
const STATUS: Record<string, string> = {
  drafted: "Draft saved", sent: "Request sent", replied: "Replied", referred: "Referred you", declined: "Declined", no_response: "No response",
};

/**
 * "Your network at {company}" on the job page. Premium users get names and the referral
 * composer; free users get only a count and initials (names never reach their browser).
 */
export function NetworkCard(props: {
  jobId: string;
  jobTitle: string;
  company: string;
  premium: boolean;
  hasNetwork: boolean;
  count: number;
  initials: string[];
  people: NetworkPerson[]; // empty for free users
  alumniUrl: string | null;
}) {
  const [asking, setAsking] = useState<NetworkPerson | null>(null);
  const { company, count } = props;

  return (
    <section aria-labelledby="network-title" className="panel p-6">
      <h2 id="network-title" className="flex items-center gap-2 text-lg font-semibold">
        <Users className="h-5 w-5 text-cobalt" aria-hidden />Your network at {company}
      </h2>

      {!props.hasNetwork ? (
        <div className="mt-3">
          <p className="text-sm text-slate">Upload your LinkedIn connections once and we will show who you know at every company, ranked by who can help most.</p>
          <Link href="/referrals" className="btn-ghost btn-sm mt-4">Connect your network</Link>
        </div>
      ) : count === 0 ? (
        <p className="mt-3 text-sm text-slate">No one in your network works here yet.</p>
      ) : !props.premium ? (
        <div className="mt-3">
          <div className="flex items-center gap-3">
            <div className="flex -space-x-2" aria-hidden>
              {props.initials.map((i, n) => (
                <span key={n} className="grid h-9 w-9 place-items-center rounded-full border-2 border-white bg-cobalt-tint text-sm font-semibold text-cobalt">{i}</span>
              ))}
            </div>
            <p className="text-sm text-ink"><span className="font-semibold">{count} {count === 1 ? "person" : "people"}</span> you know work here.</p>
          </div>
          <p className="mt-3 text-sm text-slate">See who they are, who to ask first, and get a personal referral request drafted from your resume.</p>
          <Link href="/pricing" className="btn-primary btn-sm mt-4"><Lock className="h-4 w-4" />Unlock with Premium</Link>
        </div>
      ) : (
        <ul className="mt-4 space-y-3">
          {props.people.slice(0, 8).map((p) => (
            <li key={p.id} className="rounded-xl border border-line p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-ink">{p.name}</p>
                  {p.position && <p className="truncate text-sm text-slate">{p.position}</p>}
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {p.relationship && <span className="rounded-md bg-mint-tint px-2 py-0.5 text-xs text-mint-ink">{REL[p.relationship] ?? p.relationship}</span>}
                    <span className={cn("rounded-md px-2 py-0.5 text-xs", p.tier <= 2 ? "bg-cobalt-tint text-ink" : "bg-paper text-slate")}>{p.reason}</span>
                  </div>
                </div>
              </div>
              {p.requestStatus ? (
                <p className="mt-2 text-xs font-medium text-mint-ink">{STATUS[p.requestStatus] ?? p.requestStatus} · <Link href="/referrals" className="underline underline-offset-2">Track</Link></p>
              ) : (
                <button onClick={() => setAsking(p)} className="btn-ghost btn-sm mt-3 w-full"><Send className="h-4 w-4" />Ask for a referral</button>
              )}
            </li>
          ))}
          {props.people.length > 8 && <li className="text-xs text-slate">And {props.people.length - 8} more on your <Link href="/referrals" className="underline">referrals page</Link>.</li>}
        </ul>
      )}

      {props.alumniUrl && (
        <a href={props.alumniUrl} target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex items-center gap-1.5 text-sm text-cobalt underline-offset-2 hover:underline">
          Find alumni at {company} on LinkedIn <ExternalLink className="h-3.5 w-3.5" aria-hidden />
        </a>
      )}

      {asking && (
        <ReferralComposer jobId={props.jobId} jobTitle={props.jobTitle} company={company} person={asking} onClose={() => setAsking(null)} />
      )}
    </section>
  );
}
