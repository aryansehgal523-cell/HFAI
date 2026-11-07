/* Popup: connect with the code from Settings, see your plan, switch autofill on or off. */

type Reply<T> = { ok: true; data: T } | { ok: false; error: string };
const send = <T,>(msg: object) => new Promise<Reply<T>>((resolve) => chrome.runtime.sendMessage(msg, resolve));
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

async function render() {
  const { token, enabled } = await chrome.storage.local.get(["token", "enabled"]);
  $("connect").hidden = Boolean(token);
  $("account").hidden = !token;
  $("dashboard").setAttribute("href", `${__API__}/dashboard`);
  $("settings").setAttribute("href", `${__API__}/settings`);
  if (!token) return;
  ($("enabled") as HTMLInputElement).checked = enabled !== false;
  const me = await send<{ name: string; plan: string; credits: number; freeAutofillsLeft: number | null }>({ type: "me" });
  if (!me.ok) { $("who").textContent = me.error; return render(); }
  $("who").textContent = me.data.name ?? "Signed in";
  $("plan").textContent = me.data.plan === "PREMIUM"
    ? `Premium · ${me.data.credits} credits left`
    : `Free · ${me.data.freeAutofillsLeft} contact autofills left this month`;
}

$("connect-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const code = ($("code") as HTMLInputElement).value.trim();
  $("connect-error").textContent = "";
  const r = await send({ type: "connect", code });
  if (!r.ok) { $("connect-error").textContent = r.error; return; }
  render();
});
$("enabled").addEventListener("change", (e) => chrome.storage.local.set({ enabled: (e.target as HTMLInputElement).checked }));
$("fill-now").addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;
  const r = await send({ type: "inject", tabId: tab.id });
  $("fill-status").textContent = r.ok ? "Look for the HireFlow button at the bottom right of the page." : "This page cannot be filled (Chrome blocks extensions here).";
});
$("disconnect").addEventListener("click", async () => { await send({ type: "disconnect" }); render(); });

render();

export {};
