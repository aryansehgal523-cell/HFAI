"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, ExternalLink, Loader2, Mail, Sparkles, X } from "lucide-react";
import { useToast } from "./Toast";
import { mailtoLink } from "@/lib/referrals/draft";
import { cn } from "@/lib/utils";

export type ComposerPerson = { id: string; name: string; firstName: string; position: string | null; profileUrl: string | null; email: string | null };
type Draft = { id: string; subject: string | null; message: string; followUpMessage: string | null; status: string; followUpAt: string | null };

/**
 * Draft, edit and hand off a referral request. HireFlow never sends anything: the user
 * copies the message or opens LinkedIn or their email app, then tells us if they sent it.
 */
export function ReferralComposer({ jobId, jobTitle, company, person, onClose, asOf }: {
  jobId: string; jobTitle: string; company: string; person: ComposerPerson; onClose: () => void; asOf?: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const dialog = useRef<HTMLDivElement>(null);
  const [tone, setTone] = useState<"friendly" | "formal">("friendly");
  const [channel, setChannel] = useState<"linkedin" | "email">("linkedin");
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [message, setMessage] = useState("");
  const [subject, setSubject] = useState("");
  const [askSent, setAskSent] = useState(false);
  const [sent, setSent] = useState<string | null>(null);

  // Escape closes; focus moves into the dialog and is kept there.
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    dialog.current?.querySelector<HTMLElement>("button, textarea, input")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab" && dialog.current) {
        const f = [...dialog.current.querySelectorAll<HTMLElement>("button:not([disabled]), a[href], textarea, input, select")];
        if (!f.length) return;
        if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("keydown", onKey); prev?.focus(); };
  }, [onClose]);

  async function generate() {
    setBusy(true);
    const res = await fetch("/api/referrals/draft", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobId, connectionId: person.id, tone, channel }),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return toast(json.error ?? "Could not write the draft. Try again.", "error");
    setDraft(json.request);
    setMessage(json.request.message);
    setSubject(json.request.subject ?? "");
  }

  async function save(status?: "sent") {
    if (!draft) return null;
    const res = await fetch(`/api/referrals/${draft.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...(asOf ? { "x-hf-as-of": asOf } : {}) },
      body: JSON.stringify({ message, subject: channel === "email" ? subject : null, ...(status ? { status } : {}) }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) { toast(json.error ?? "Could not save", "error"); return null; }
    return json.request as Draft;
  }

  async function handOff(kind: "copy" | "linkedin" | "email") {
    if (kind === "copy") {
      await navigator.clipboard.writeText(channel === "email" && subject ? `${subject}\n\n${message}` : message);
      toast("Message copied");
    } else {
      await navigator.clipboard.writeText(message).catch(() => {});
      if (kind === "linkedin" && person.profileUrl) {
        window.open(person.profileUrl, "_blank", "noopener,noreferrer");
        toast("Message copied. Paste it into a LinkedIn message.");
      }
      if (kind === "email" && person.email) window.location.href = mailtoLink(person.email, subject, message);
    }
    await save();
    setAskSent(true);
  }

  async function markSent() {
    const r = await save("sent");
    if (!r) return;
    setAskSent(false);
    setSent(r.followUpAt);
    router.refresh();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-0 sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={dialog} role="dialog" aria-modal="true" aria-labelledby="composer-title" className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-t-3xl bg-white p-6 shadow-2xl sm:rounded-3xl sm:p-7">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="composer-title" className="text-xl font-semibold">Ask {person.firstName} for a referral</h2>
            <p className="mt-0.5 text-sm text-slate">{jobTitle} at {company}{person.position ? ` · ${person.firstName} is ${person.position}` : ""}</p>
          </div>
          <button onClick={onClose} className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-slate hover:bg-paper hover:text-ink" aria-label="Close"><X className="h-5 w-5" /></button>
        </div>

        {sent !== null ? (
          <div className="mt-6 rounded-2xl bg-mint-tint p-5" role="status">
            <p className="flex items-center gap-2 font-medium text-mint-ink"><Check className="h-5 w-5" />Marked as sent</p>
            <p className="mt-1 text-sm text-ink">
              We will remind you to follow up{sent ? ` on ${new Date(sent).toLocaleDateString("en-IN", { day: "numeric", month: "long" })}` : ""} if {person.firstName} has not replied. Track it on your referrals page.
            </p>
            <div className="mt-4 flex gap-2">
              <a href="/referrals" className="btn-ink btn-sm">Open referrals</a>
              <button onClick={onClose} className="btn-ghost btn-sm">Done</button>
            </div>
          </div>
        ) : !draft ? (
          <div className="mt-6 space-y-5">
            <fieldset>
              <legend className="label">Send it as</legend>
              <div className="flex flex-wrap gap-2">
                <button type="button" className="chip" data-on={channel === "linkedin"} aria-pressed={channel === "linkedin"} onClick={() => setChannel("linkedin")}>LinkedIn message</button>
                <button type="button" className="chip" data-on={channel === "email"} aria-pressed={channel === "email"} onClick={() => setChannel("email")} disabled={!person.email}>Email</button>
              </div>
              {!person.email && <p className="mt-1.5 text-xs text-slate">We do not have {person.firstName}&apos;s email, so LinkedIn it is.</p>}
            </fieldset>
            <fieldset>
              <legend className="label">Tone</legend>
              <div className="flex gap-2">
                {(["friendly", "formal"] as const).map((t) => (
                  <button key={t} type="button" className="chip" data-on={tone === t} aria-pressed={tone === t} onClick={() => setTone(t)}>{t === "friendly" ? "Friendly" : "Formal"}</button>
                ))}
              </div>
            </fieldset>
            <button onClick={generate} disabled={busy} className="btn-primary w-full">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {busy ? "Writing your message…" : "Write my message"}
            </button>
            <p className="text-xs text-slate">Uses your tailored resume for this job if you have one. Nothing is sent until you send it.</p>
          </div>
        ) : (
          <div className="mt-6 space-y-4">
            {channel === "email" && (
              <label className="block">
                <span className="label">Subject</span>
                <input className="field" value={subject} onChange={(e) => setSubject(e.target.value)} />
              </label>
            )}
            <label className="block">
              <span className="label">Your message</span>
              <textarea className="field text-[15px] leading-relaxed" rows={10} value={message} onChange={(e) => setMessage(e.target.value)} />
            </label>
            <p className={cn("text-right text-xs", channel === "linkedin" && message.length > 600 ? "text-rose" : "text-slate")} aria-live="polite">
              {channel === "linkedin" ? `${message.length} / 600 characters` : `${message.split(/\s+/).filter(Boolean).length} / 150 words`}
            </p>

            {askSent ? (
              <div className="rounded-2xl bg-cobalt-tint p-4" role="group" aria-label="Did you send it?">
                <p className="font-medium text-ink">Did you send it?</p>
                <div className="mt-3 flex gap-2">
                  <button onClick={markSent} className="btn-primary btn-sm"><Check className="h-4 w-4" />Yes, I sent it</button>
                  <button onClick={() => setAskSent(false)} className="btn-ghost btn-sm">Not yet</button>
                </div>
              </div>
            ) : (
              <div className="grid gap-2 sm:grid-cols-3">
                <button onClick={() => handOff("copy")} className="btn-ghost"><Copy className="h-4 w-4" />Copy</button>
                {person.profileUrl && <button onClick={() => handOff("linkedin")} className="btn-ghost"><ExternalLink className="h-4 w-4" />Open LinkedIn</button>}
                {person.email && channel === "email" && <button onClick={() => handOff("email")} className="btn-ghost"><Mail className="h-4 w-4" />Open in email</button>}
              </div>
            )}
            {draft.followUpMessage && (
              <details className="rounded-xl bg-paper p-4 text-sm">
                <summary className="cursor-pointer font-medium text-ink">Follow up message for later</summary>
                <p className="mt-2 whitespace-pre-line text-ink-soft">{draft.followUpMessage}</p>
              </details>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
