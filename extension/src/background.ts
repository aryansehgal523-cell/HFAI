/*
 * Service worker. Holds the token and is the only part that talks to the HireFlow API,
 * so the token never enters the job site's page. Content scripts and the popup message it.
 */
const API = __API__;

type Msg =
  | { type: "connect"; code: string }
  | { type: "disconnect" }
  | { type: "me" }
  | { type: "autofill"; url: string; title: string }
  | { type: "resume"; jobId: string | null }
  | { type: "answer"; question: string; jobId: string | null; maxWords?: number }
  | { type: "applied"; url: string; title: string; company: string; jobId: string | null }
  | { type: "inject"; tabId: number };

async function token(): Promise<string | null> {
  const { token } = (await chrome.storage.local.get("token")) as { token?: string };
  return token ?? null;
}

async function api(path: string, init: RequestInit = {}) {
  const t = await token();
  if (!t && path !== "/api/ext/connect") throw new Error("Connect HireFlow first: open the extension and enter the code from Settings.");
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(t ? { Authorization: `Bearer ${t}` } : {}), ...(init.headers ?? {}) },
  });
  if (res.status === 401 && path !== "/api/ext/connect") await chrome.storage.local.remove("token");
  return res;
}

async function json(res: Response) {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `HireFlow returned ${res.status}`);
  return body;
}

function toBase64(buf: ArrayBuffer) {
  let s = "";
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

async function handle(msg: Msg): Promise<unknown> {
  switch (msg.type) {
    case "connect": {
      const r = await json(await api("/api/ext/connect", { method: "POST", body: JSON.stringify({ code: msg.code, name: `Chrome on ${navigator.platform || "this computer"}` }) }));
      await chrome.storage.local.set({ token: r.token, enabled: true });
      return r.user;
    }
    case "disconnect":
      await chrome.storage.local.remove("token");
      return { ok: true };
    case "me":
      return json(await api("/api/ext/me"));
    case "autofill": {
      // Find the job first (free, no quota), then fetch the data to fill (counts for free users).
      const found = await json(await api("/api/ext/findjob", { method: "POST", body: JSON.stringify({ url: msg.url, title: msg.title }) }));
      const profile = await json(await api("/api/ext/profile"));
      return { profile, job: found.job, tailored: found.tailored };
    }
    case "resume": {
      const res = await api(`/api/ext/resume${msg.jobId ? `?jobId=${encodeURIComponent(msg.jobId)}` : ""}`);
      if (!res.ok) await json(res);
      const name = res.headers.get("content-disposition")?.match(/filename="([^"]+)"/)?.[1] ?? "resume.pdf";
      return { name, base64: toBase64(await res.arrayBuffer()) };
    }
    case "answer":
      return json(await api("/api/ext/answer", { method: "POST", body: JSON.stringify({ question: msg.question, jobId: msg.jobId, maxWords: msg.maxWords ?? 150 }) }));
    case "applied":
      return json(await api("/api/ext/applied", { method: "POST", body: JSON.stringify(msg) }));
    case "inject":
      await chrome.scripting.executeScript({ target: { tabId: msg.tabId }, files: ["content.js"] });
      return { ok: true };
  }
}

chrome.runtime.onMessage.addListener((msg: Msg, _sender, reply) => {
  handle(msg).then((data) => reply({ ok: true, data }), (e: Error) => reply({ ok: false, error: e.message }));
  return true; // async reply
});

export {};
