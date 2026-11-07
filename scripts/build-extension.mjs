/*
 * Build the Chrome extension into extension/dist.
 *   npm run ext:build                                   (talks to http://localhost:3000)
 *   HIREFLOW_API=https://your-domain npm run ext:build   (production)
 * Then chrome://extensions → Developer mode → Load unpacked → choose extension/dist.
 */
import { build } from "esbuild";
import { copyFileSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1")), "..");
const EXT = path.join(ROOT, "extension");
const OUT = path.join(EXT, "dist");
const API = (process.env.HIREFLOW_API ?? "http://localhost:3000").replace(/\/$/, "");
const apiOrigin = new URL(API).origin;

// The job sites we fill, plus the local test pages served by `npm run ext:test-forms`.
const ATS = [
  "https://boards.greenhouse.io/*", "https://job-boards.greenhouse.io/*", "https://jobs.lever.co/*", "https://jobs.eu.lever.co/*",
  "https://jobs.ashbyhq.com/*", "https://*.myworkdayjobs.com/*", "https://jobs.smartrecruiters.com/*", "https://*.darwinbox.in/*",
];
const LOCAL_TEST = API.startsWith("http://localhost") ? ["http://localhost:5178/*"] : [];

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

await build({
  entryPoints: { background: path.join(EXT, "src/background.ts"), content: path.join(EXT, "src/content.ts"), popup: path.join(EXT, "src/popup.ts") },
  outdir: OUT,
  bundle: true,
  format: "iife",
  target: "chrome114",
  minify: process.env.NODE_ENV === "production",
  define: { __API__: JSON.stringify(API) },
  logLevel: "info",
});

const manifest = {
  manifest_version: 3,
  name: "HireFlow autofill",
  version: "1.0.0",
  description: "Fill job applications in one click with your HireFlow profile and tailored resume. You always review and submit.",
  action: { default_popup: "popup.html", default_title: "HireFlow autofill" },
  background: { service_worker: "background.js" },
  permissions: ["storage", "activeTab", "scripting"],
  host_permissions: [`${apiOrigin}/*`, ...ATS, ...LOCAL_TEST],
  content_scripts: [{ matches: [...ATS, ...LOCAL_TEST], js: ["content.js"], run_at: "document_idle" }],
};
writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2));
copyFileSync(path.join(EXT, "popup.html"), path.join(OUT, "popup.html"));
console.log(`\nExtension built in extension/dist for ${API}`);
