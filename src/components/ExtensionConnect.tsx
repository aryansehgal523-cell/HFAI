"use client";
import { useCallback, useEffect, useState } from "react";
import { Copy, KeyRound, Loader2 } from "lucide-react";
import { useToast } from "./Toast";
import { timeAgo } from "@/lib/utils";

type Tok = { id: string; name: string; lastUsedAt: string | null; createdAt: string };

/** Settings: create a one time code for the extension, and list or revoke connected browsers. */
export function ExtensionConnect() {
  const toast = useToast();
  const [code, setCode] = useState<{ code: string; expiresAt: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [tokens, setTokens] = useState<Tok[] | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    const res = await fetch("/api/ext/tokens");
    if (res.ok) setTokens((await res.json()).tokens);
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!code) return;
    const t = setInterval(() => { setNow(Date.now()); load(); }, 5000); // the browser appears once connected
    return () => clearInterval(t);
  }, [code, load]);

  async function create() {
    setBusy(true);
    const res = await fetch("/api/ext/code", { method: "POST" });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return toast(json.error ?? "Could not create a code", "error");
    setCode(json);
    setNow(Date.now());
  }
  async function revoke(id: string) {
    const res = await fetch(`/api/ext/tokens/${id}`, { method: "DELETE" });
    if (!res.ok) return toast("Could not revoke", "error");
    toast("Browser disconnected");
    load();
  }

  const secondsLeft = code ? Math.max(0, Math.round((new Date(code.expiresAt).getTime() - now) / 1000)) : 0;
  return (
    <div className="space-y-5">
      {code && secondsLeft > 0 ? (
        <div className="rounded-xl bg-cobalt-tint p-4">
          <p className="text-sm text-ink">Open the HireFlow extension and enter this code. It works once and expires in {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, "0")}.</p>
          <div className="mt-3 flex items-center gap-3">
            <code className="rounded-lg bg-white px-4 py-2 font-mono text-2xl font-semibold tracking-[0.2em] text-ink" aria-label={`Code ${code.code.split("").join(" ")}`}>{code.code}</code>
            <button onClick={async () => { await navigator.clipboard.writeText(code.code); toast("Code copied"); }} className="btn-ghost btn-sm"><Copy className="h-4 w-4" />Copy</button>
          </div>
        </div>
      ) : (
        <button onClick={create} disabled={busy} className="btn-primary btn-sm">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}Connect the Chrome extension</button>
      )}
      <div>
        <p className="text-sm font-medium text-ink">Connected browsers</p>
        {tokens === null ? <p className="text-sm text-slate">Loading…</p> : tokens.length === 0 ? (
          <p className="text-sm text-slate">None yet.</p>
        ) : (
          <ul className="mt-2 divide-y divide-line">
            {tokens.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="text-ink">{t.name} <span className="text-slate">· {t.lastUsedAt ? `last used ${timeAgo(t.lastUsedAt)}` : `connected ${timeAgo(t.createdAt)}`}</span></span>
                <button onClick={() => revoke(t.id)} className="btn-ghost btn-sm">Revoke</button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
