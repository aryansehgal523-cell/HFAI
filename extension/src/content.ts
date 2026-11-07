/*
 * Content script: a small HireFlow button on application forms. Nothing is read or sent
 * until the user presses Autofill. We never press submit, never touch passwords or CAPTCHAs.
 */
import { FIELD_LABEL, isCustomQuestion, mapField, normalise, pickOption, valueFor, type FieldInfo, type FieldKey, type Profile } from "./fieldMap";

type Reply<T> = { ok: true; data: T } | { ok: false; error: string };
const send = <T,>(msg: object) => new Promise<Reply<T>>((resolve) => chrome.runtime.sendMessage(msg, resolve));

const W = window as unknown as { __hireflow?: boolean };
if (!W.__hireflow) {
  W.__hireflow = true;
  main();
}

type Control = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
type State = { profile: Profile; jobId: string | null; tailored: boolean; pageTitle: string; filled: Set<Element>; missing: Map<Element, string>; questions: Control[]; resumeDone: boolean };
let state: State | null = null;
let ui: { root: ShadowRoot; panel: HTMLElement; button: HTMLButtonElement } | null = null;

async function main() {
  const { enabled } = await chrome.storage.local.get("enabled");
  if (enabled === false) return;
  if (!looksLikeApplication()) {
    // Single page apps render the form later: wait for it.
    const mo = new MutationObserver(() => { if (looksLikeApplication()) { mo.disconnect(); mount(); } });
    mo.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => mo.disconnect(), 30_000);
    return;
  }
  mount();
}

function looksLikeApplication() {
  const inputs = document.querySelectorAll("input:not([type=hidden]):not([type=search]), textarea, select");
  return inputs.length >= 3 && Boolean(document.querySelector("input[type=email], input[type=file], input[type=tel], [name*=name i], [id*=name i]"));
}

// ─── UI (shadow DOM so the page's CSS cannot break it) ─────────

function mount() {
  if (ui) return;
  const host = document.createElement("div");
  host.id = "hireflow-autofill";
  host.style.cssText = "all: initial; position: fixed; right: 20px; bottom: 20px; z-index: 2147483647;";
  const root = host.attachShadow({ mode: "open" });
  root.innerHTML = `
    <style>
      :host { font-family: system-ui, -apple-system, Segoe UI, sans-serif; }
      button { font: 600 14px system-ui, sans-serif; border: 0; border-radius: 999px; cursor: pointer; }
      .fab { background: #3346f2; color: #fff; padding: 12px 18px; box-shadow: 0 10px 30px -10px rgba(15,26,46,.6); }
      .fab:focus-visible, .q button:focus-visible, .x:focus-visible { outline: 3px solid #ffb627; outline-offset: 2px; }
      .panel { display: none; width: 320px; max-height: 60vh; overflow: auto; margin-bottom: 10px; background: #fff; color: #0f1a2e; border: 1px solid #e2e5ee; border-radius: 16px; padding: 14px 16px; box-shadow: 0 20px 50px -20px rgba(15,26,46,.45); font-size: 14px; line-height: 1.45; }
      .panel.open { display: block; }
      .row { display: flex; justify-content: space-between; align-items: start; gap: 8px; }
      .x { background: transparent; color: #5b6478; padding: 2px 6px; font-size: 18px; }
      .ok { color: #0b7a59; font-weight: 600; } .warn { color: #a06800; } .err { color: #cd2b33; }
      .q { margin-top: 10px; padding-top: 10px; border-top: 1px solid #e2e5ee; }
      .q p { margin: 0 0 6px; } .q button { background: #ebedfe; color: #2232c9; padding: 6px 12px; font-size: 13px; }
      small { color: #5b6478; }
    </style>
    <div class="panel" role="status" aria-live="polite"></div>
    <button class="fab" type="button">Autofill with HireFlow</button>`;
  document.documentElement.appendChild(host);
  const panel = root.querySelector(".panel") as HTMLElement;
  const button = root.querySelector(".fab") as HTMLButtonElement;
  button.addEventListener("click", () => autofill());
  ui = { root, panel, button };
  watchSubmit();
}

function show(html: string) {
  if (!ui) return;
  ui.panel.innerHTML = `<div class="row"><div>${html}</div><button class="x" type="button" aria-label="Close">×</button></div>`;
  ui.panel.classList.add("open");
  ui.panel.querySelector(".x")?.addEventListener("click", () => ui!.panel.classList.remove("open"));
}
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

// ─── Reading the form ────────────────────────────────────────

function labelFor(el: Control): string {
  const byFor = el.id ? document.querySelector(`label[for="${CSS.escape(el.id)}"]`) : null;
  const wrap = el.closest("label");
  const labelledBy = el.getAttribute("aria-labelledby")?.split(/\s+/).map((id) => document.getElementById(id)?.textContent ?? "").join(" ");
  // Workday and many React forms put the question in a nearby element.
  const group = el.closest("fieldset")?.querySelector("legend")?.textContent
    ?? el.closest("[data-automation-id], .field, .application-question, .form-group, li, div")?.querySelector("label, legend, .label, [class*=label]")?.textContent;
  return (byFor?.textContent || wrap?.textContent || labelledBy || group || "").replace(/\s+/g, " ").trim().slice(0, 200);
}

/** For radio buttons and checkboxes, the question is the group's legend or label, not the option's text. */
function questionLabel(el: Control): string {
  const t = (el as HTMLInputElement).type;
  if (t !== "radio" && t !== "checkbox") return labelFor(el);
  const group = el.closest("fieldset, [role=radiogroup], [role=group]");
  const legend = group?.querySelector("legend")?.textContent
    ?? group?.getAttribute("aria-label")
    ?? (group?.getAttribute("aria-labelledby") ? document.getElementById(group.getAttribute("aria-labelledby")!)?.textContent : null);
  // A lone checkbox ("I am willing to relocate") is its own question.
  return (legend ?? (t === "checkbox" ? labelFor(el) : "")).replace(/\s+/g, " ").trim().slice(0, 200);
}

function info(el: Control): FieldInfo {
  const type = el instanceof HTMLSelectElement ? "select" : el instanceof HTMLTextAreaElement ? "textarea" : (el.type || "text").toLowerCase();
  return {
    label: questionLabel(el), name: el.name, id: el.id, placeholder: (el as HTMLInputElement).placeholder,
    aria: el.getAttribute("aria-label") ?? undefined, type,
    options: el instanceof HTMLSelectElement ? [...el.options].map((o) => o.text) : undefined,
    required: el.required || el.getAttribute("aria-required") === "true",
  };
}

function controls(): Control[] {
  return [...document.querySelectorAll<Control>("input, select, textarea")].filter((el) => {
    const t = (el as HTMLInputElement).type?.toLowerCase();
    if (["hidden", "password", "submit", "button", "image", "reset", "search"].includes(t)) return false;
    if (el.closest("#hireflow-autofill")) return false;
    if (/captcha/i.test(`${el.name} ${el.id} ${el.className}`) || el.closest("[class*=captcha i], [id*=captcha i]")) return false;
    if (el.disabled || (el as HTMLInputElement).readOnly) return false;
    const r = el.getBoundingClientRect();
    return t === "file" || t === "radio" || t === "checkbox" || (r.width > 0 && r.height > 0);
  });
}

// ─── Writing values so frameworks notice ─────────────────────

function setNative(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(el, value); // bypasses React's tracked value
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
  el.dispatchEvent(new Event("blur", { bubbles: true }));
}

function fillOne(el: Control, key: FieldKey, value: string): boolean {
  if (el instanceof HTMLSelectElement) {
    const i = pickOption([...el.options].map((o) => o.text), value, key);
    if (i < 0) return false;
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set?.call(el, el.options[i].value);
    el.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }
  const input = el as HTMLInputElement;
  if (input.type === "radio") {
    const group = [...document.querySelectorAll<HTMLInputElement>(`input[type=radio][name="${CSS.escape(input.name)}"]`)];
    const i = pickOption(group.map((r) => labelFor(r) || r.value), value, key);
    if (i < 0) return false;
    group[i].click();
    return true;
  }
  if (input.type === "checkbox") {
    const want = value === "Yes";
    if (value !== "Yes" && value !== "No") return false;
    if (input.checked !== want) input.click();
    return true;
  }
  if (input.type === "date" && !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  if (input.type === "number" && Number.isNaN(Number(value))) return false;
  if (input.value && input.value.trim() !== "") return true; // never overwrite what the user typed
  setNative(input, value);
  return true;
}

function mark(el: Element, kind: "ok" | "missing") {
  const h = el as HTMLElement;
  h.style.outline = kind === "ok" ? "2px solid #12b886" : "2px solid #ffb627";
  h.style.outlineOffset = "2px";
}

// ─── Autofill ────────────────────────────────────────────────

async function autofill() {
  if (!ui) return;
  ui.button.disabled = true;
  ui.button.textContent = "Filling…";
  try {
    if (!state) {
      const r = await send<{ profile: Profile; job: { id: string } | null; tailored: boolean }>({ type: "autofill", url: location.href, title: document.title });
      if (!r.ok) { show(`<span class="err">${esc(r.error)}</span>`); return; }
      // Capture the job title now: after submit, many sites replace the heading with "Thank you".
      const pageTitle = (document.querySelector("h1")?.textContent ?? document.title).replace(/\s+/g, " ").trim().slice(0, 200);
      state = { profile: r.data.profile, jobId: r.data.job?.id ?? null, tailored: r.data.tailored, pageTitle, filled: new Set(), missing: new Map(), questions: [], resumeDone: false };
      sessionStorage.setItem("hireflow-autofill", "1");
      observeSteps();
    }
    await fillPage();
  } finally {
    ui.button.disabled = false;
    ui.button.textContent = "Autofill with HireFlow";
  }
}

async function fillPage() {
  if (!state) return;
  const s = state;
  const premium = s.profile.plan === "PREMIUM";
  const seenRadio = new Set<string>();
  for (const el of controls()) {
    if (s.filled.has(el)) continue;
    const f = info(el);
    if (f.type === "radio") { if (seenRadio.has((el as HTMLInputElement).name)) continue; seenRadio.add((el as HTMLInputElement).name); }
    const key = mapField(f);
    if (key === "resume") {
      if (!s.resumeDone && premium) {
        const r = await send<{ name: string; base64: string }>({ type: "resume", jobId: s.jobId });
        if (r.ok) {
          const bytes = Uint8Array.from(atob(r.data.base64), (c) => c.charCodeAt(0));
          const dt = new DataTransfer();
          dt.items.add(new File([bytes], r.data.name, { type: "application/pdf" }));
          (el as HTMLInputElement).files = dt.files;
          el.dispatchEvent(new Event("input", { bubbles: true }));
          el.dispatchEvent(new Event("change", { bubbles: true }));
          s.resumeDone = true;
          s.filled.add(el);
          mark(el.closest("div") ?? el, "ok");
        }
      } else if (!premium && f.required) s.missing.set(el, "resume (attach it yourself, or upgrade)");
      continue;
    }
    if (key) {
      const v = valueFor(key, s.profile);
      if (v && fillOne(el, key, v)) { s.filled.add(el); mark(el, "ok"); continue; }
    }
    if (isCustomQuestion(f) && !s.questions.includes(el)) s.questions.push(el);
    else if (f.required && !(el as HTMLInputElement).value) {
      s.missing.set(el, key ? FIELD_LABEL[key] : normalise(f.label).slice(0, 40) || "a required field");
      mark(el, "missing");
    }
  }
  summarise();
}

function summarise() {
  if (!state) return;
  const s = state;
  const premium = s.profile.plan === "PREMIUM";
  const needs = [...new Set(s.missing.values())];
  let html = `<div class="ok">Filled ${s.filled.size} ${s.filled.size === 1 ? "field" : "fields"}.</div>`;
  if (needs.length) html += `<div class="warn">${needs.length} ${needs.length === 1 ? "needs" : "need"} you: ${esc(needs.slice(0, 5).join(", "))}.</div>`;
  html += `<small>${s.tailored ? "Your tailored resume for this job was used. " : ""}Check everything, then submit the form yourself.</small>`;
  if (!premium) html += `<div><small>Free plan: contact details only. Premium attaches your resume and writes answers.</small></div>`;
  s.questions.slice(0, 4).forEach((q, i) => {
    html += `<div class="q"><p>${esc(labelFor(q).slice(0, 120))}</p>${premium ? `<button type="button" data-q="${i}">Write with AI</button>` : "<small>Premium writes this from your resume.</small>"}</div>`;
  });
  show(html);
  ui?.panel.querySelectorAll<HTMLButtonElement>("[data-q]").forEach((b) => b.addEventListener("click", () => writeAnswer(s.questions[Number(b.dataset.q)], b)));
}

async function writeAnswer(el: Control, b: HTMLButtonElement) {
  if (!state) return;
  b.disabled = true;
  b.textContent = "Writing…";
  const maxLen = Number((el as HTMLTextAreaElement).maxLength) || 0;
  const maxWords = maxLen > 0 ? Math.max(20, Math.min(300, Math.floor(maxLen / 7))) : 150;
  const r = await send<{ answer: string }>({ type: "answer", question: labelFor(el), jobId: state.jobId, maxWords });
  if (!r.ok) { b.textContent = r.error.slice(0, 60); b.disabled = false; return; }
  setNative(el as HTMLTextAreaElement, maxLen > 0 ? r.data.answer.slice(0, maxLen) : r.data.answer);
  mark(el, "ok");
  b.textContent = "Added. Edit it on the form.";
}

/** Multi page forms (Workday): fill each step when its fields appear. */
function observeSteps() {
  let t: ReturnType<typeof setTimeout> | undefined;
  new MutationObserver(() => {
    clearTimeout(t);
    t = setTimeout(() => { if (state && controls().some((el) => !state!.filled.has(el) && mapField(info(el)))) fillPage(); }, 600);
  }).observe(document.body, { childList: true, subtree: true });
}

// ─── After the user submits ──────────────────────────────────

function watchSubmit() {
  let reported = false;
  const report = async () => {
    if (reported || !state) return;
    reported = true;
    const company = document.querySelector('meta[property="og:site_name"]')?.getAttribute("content") ?? location.hostname.split(".").slice(-2, -1)[0] ?? "";
    const r = await send<{ added: boolean }>({ type: "applied", url: location.href, title: state.pageTitle, company, jobId: state.jobId });
    show(r.ok ? `<span class="ok">Added to your HireFlow tracker.</span>` : `<span class="err">${esc(r.error)}</span>`);
  };
  document.addEventListener("submit", () => setTimeout(report, 1500), true);
  // Some forms submit with fetch and then show a confirmation screen instead.
  new MutationObserver(() => {
    if (state && /thank you for (applying|your application)|application (has been )?(submitted|received)|we('| ha)ve received your application/i.test(document.body.innerText.slice(0, 20_000))) report();
  }).observe(document.body, { childList: true, subtree: true });
}
