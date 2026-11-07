"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, MessageSquarePlus, Send, Trash2 } from "lucide-react";
import { useToast } from "./Toast";
import { cn } from "@/lib/utils";

type Msg = { role: "user" | "assistant"; content: string };
type Thread = { id: string; title: string; updatedAt: string };
const QUICK: { kind: string; label: string; needsJob?: boolean; prompt: string }[] = [
  { kind: "interview", label: "Prepare me for this interview", needsJob: true, prompt: "Prepare me for this interview. List the questions I am most likely to get for this job, and for each one give a model answer in STAR format built only from my real experience." },
  { kind: "mock", label: "Mock interview me", needsJob: true, prompt: "Mock interview me for this job. Ask me one question at a time, wait for my answer, then give specific feedback and a stronger version before asking the next question." },
  { kind: "calls", label: "Why am I not getting calls?", prompt: "Why am I not getting calls? Look at my resume score, my tracker numbers and my target roles, and tell me the three changes that would make the biggest difference." },
  { kind: "week", label: "Plan my week", prompt: "Plan my job search for this week: how many applications, which kinds of roles, referral requests, practice and follow ups, day by day." },
  { kind: "negotiate", label: "Help me negotiate this offer", prompt: "Help me negotiate this offer. Ask me for the CTC and its breakup if you need them, estimate the in hand pay under both tax regimes, and give me a script for the conversation." },
];

/** Safe, tiny markdown: paragraphs, "- " lists and **bold**. No HTML from the model is ever rendered. */
function Rich({ text }: { text: string }) {
  const blocks = text.split(/\n{2,}/);
  const inline = (s: string) => s.split(/(\*\*[^*]+\*\*)/g).map((part, i) => (part.startsWith("**") && part.endsWith("**") ? <strong key={i}>{part.slice(2, -2)}</strong> : <span key={i}>{part}</span>));
  return (
    <div className="space-y-3">
      {blocks.map((b, i) => {
        const lines = b.split("\n");
        if (lines.every((l) => /^\s*([-*•]|\d+\.)\s/.test(l))) {
          return <ul key={i} className="list-disc space-y-1 pl-5">{lines.map((l, j) => <li key={j}>{inline(l.replace(/^\s*([-*•]|\d+\.)\s/, ""))}</li>)}</ul>;
        }
        return <p key={i} className="whitespace-pre-line">{inline(b.replace(/^#+\s*/gm, ""))}</p>;
      })}
    </div>
  );
}

export function CoachChat({ threads, activeId, initialMessages, job }: {
  threads: Thread[];
  activeId: string | null;
  initialMessages: Msg[];
  job: { id: string; title: string } | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const [messages, setMessages] = useState<Msg[]>(initialMessages);
  const [threadId, setThreadId] = useState<string | null>(activeId);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [messages]);

  async function ensureThread(kind = "chat") {
    if (threadId) return threadId;
    const res = await fetch("/api/coach/threads", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, jobId: job?.id ?? null }) });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) { toast(json.error ?? "Could not start a conversation", "error"); return null; }
    setThreadId(json.thread.id);
    window.history.replaceState(null, "", `/coach?t=${json.thread.id}`);
    return json.thread.id as string;
  }

  async function send(text: string, kind?: string) {
    const content = text.trim();
    if (!content || busy) return;
    const id = await ensureThread(kind);
    if (!id) return;
    setInput("");
    setBusy(true);
    setWaiting(true);
    setMessages((m) => [...m, { role: "user", content }, { role: "assistant", content: "" }]);
    try {
      const res = await fetch(`/api/coach/threads/${id}/messages`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content }) });
      if (!res.ok || !res.body) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? "The coach could not reply. Try again.");
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = dec.decode(value, { stream: true });
        if (chunk) setWaiting(false);
        setMessages((m) => { const copy = [...m]; copy[copy.length - 1] = { role: "assistant", content: copy[copy.length - 1].content + chunk }; return copy; });
      }
      router.refresh();
    } catch (e) {
      setMessages((m) => m.slice(0, -2));
      setInput(content);
      toast(e instanceof Error ? e.message : "Something went wrong", "error");
    } finally {
      setBusy(false);
      setWaiting(false);
    }
  }

  async function remove(id: string) {
    const res = await fetch(`/api/coach/threads/${id}`, { method: "DELETE" });
    if (!res.ok) return toast("Could not delete", "error");
    if (id === threadId) router.push("/coach");
    router.refresh();
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
      <aside aria-label="Conversations" className="space-y-2">
        <Link href="/coach" className="btn-ghost btn-sm w-full"><MessageSquarePlus className="h-4 w-4" />New conversation</Link>
        <ul className="space-y-1">
          {threads.map((t) => (
            <li key={t.id} className="group flex items-center gap-1">
              <Link href={`/coach?t=${t.id}`} aria-current={t.id === threadId ? "page" : undefined} className={cn("min-w-0 flex-1 truncate rounded-lg px-3 py-2 text-sm", t.id === threadId ? "bg-ink text-white" : "text-ink-soft hover:bg-white")}>{t.title}</Link>
              <button onClick={() => remove(t.id)} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-slate opacity-60 hover:text-rose group-hover:opacity-100 focus:opacity-100" aria-label={`Delete ${t.title}`}><Trash2 className="h-3.5 w-3.5" /></button>
            </li>
          ))}
        </ul>
      </aside>

      <section aria-label="Chat" className="panel flex min-h-[60vh] flex-col">
        {job && <p className="border-b border-line px-5 py-3 text-sm text-slate">About <span className="font-medium text-ink">{job.title}</span>. The coach can see this job and your tailored resume for it.</p>}
        <div className="flex-1 space-y-5 overflow-y-auto p-5" aria-live="polite">
          {messages.length === 0 ? (
            <div>
              <p className="font-display text-xl font-semibold">What would help right now?</p>
              <p className="mt-1 text-sm text-slate">The coach knows your resume, score, preferences and tracker. Start with one of these or ask anything.</p>
              <div className="mt-5 flex flex-wrap gap-2">
                {QUICK.filter((q) => !q.needsJob || job).map((q) => (
                  <button key={q.kind} onClick={() => send(q.prompt, q.kind)} disabled={busy} className="chip">{q.label}</button>
                ))}
              </div>
              {!job && <p className="mt-4 text-xs text-slate">Interview prep and mock interviews work best from a job page: open a job and press “Ask the coach about this job”.</p>}
            </div>
          ) : (
            messages.map((m, i) => (
              <div key={i} className={cn("max-w-[85%] rounded-2xl px-4 py-3 text-[15px] leading-relaxed", m.role === "user" ? "ml-auto bg-cobalt text-white" : "bg-paper text-ink")}>
                {m.role === "assistant" && !m.content && waiting ? (
                  <span className="inline-flex items-center gap-2 text-slate"><Loader2 className="h-4 w-4 animate-spin" aria-hidden />Thinking…</span>
                ) : m.role === "assistant" ? <Rich text={m.content} /> : <p className="whitespace-pre-line">{m.content}</p>}
              </div>
            ))
          )}
          <div ref={end} />
        </div>
        <form onSubmit={(e) => { e.preventDefault(); send(input); }} className="flex items-end gap-2 border-t border-line p-3">
          <label htmlFor="coach-input" className="sr-only">Message the coach</label>
          <textarea
            id="coach-input" rows={2} value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask anything about your search, an interview or an offer"
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); } }}
            className="field max-h-40 min-h-[48px] flex-1 resize-y"
          />
          <button type="submit" disabled={busy || !input.trim()} className="btn-primary h-12 px-4" aria-label="Send">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}</button>
        </form>
        <p className="px-4 pb-3 text-[11px] text-slate">The coach can be wrong. Salary numbers are estimates; check legal and tax questions with a professional.</p>
      </section>
    </div>
  );
}
