/*
 * Server side PDF of a resume: the same ATS safe single column layout as ResumeSheet and the
 * Word export, as real text (selectable, parseable). Used for downloads and the extension.
 */
import type { ResumeData } from "@/db/schema";

// The 14 standard PDF fonts only cover Windows-1252, so swap characters they cannot draw.
const SWAPS: [RegExp, string][] = [[/₹\s?/g, "Rs. "], [/[‐-‒−]/g, "-"], [/→/g, "->"], [/[•●▪]/g, "-"]];
export function pdfSafe(s: string | undefined | null): string {
  let t = (s ?? "").normalize("NFKC");
  for (const [re, to] of SWAPS) t = t.replace(re, to);
  // Keep printable Windows-1252 characters (which include curly quotes and dashes); drop the rest.
  return t.replace(/[^\x09\x0A\x0D\x20-\x7E -ÿ–—‘’“”…€]/g, "");
}

type Node = Record<string, unknown> | string;

export function resumeDocDefinition(r: ResumeData, title: string) {
  const section = (name: string, body: Node[]): Node[] =>
    body.length ? [{ text: name.toUpperCase(), style: "h2", margin: [0, 12, 0, 2] }, { canvas: [{ type: "line", x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 0.8 }], margin: [0, 0, 0, 5] }, ...body] : [];
  const dates = (a?: string, b?: string) => [a, b].filter(Boolean).map(pdfSafe).join(" to ");
  const contact = [r.contact?.email, r.contact?.phone, r.contact?.location, ...(r.contact?.links ?? [])].filter(Boolean).map(pdfSafe).join("  |  ");

  return {
    info: { title: pdfSafe(title), author: pdfSafe(r.name), creator: "HireFlow AI" },
    pageSize: "A4",
    pageMargins: [40, 40, 40, 40],
    defaultStyle: { font: "Helvetica", fontSize: 10, lineHeight: 1.25 },
    styles: { h1: { fontSize: 18, bold: true }, h2: { fontSize: 10.5, bold: true, characterSpacing: 0.6 }, muted: { color: "#444444" } },
    content: [
      { text: pdfSafe(r.name) || "Your name", style: "h1", alignment: "center" },
      ...(r.headline ? [{ text: pdfSafe(r.headline), alignment: "center", margin: [0, 2, 0, 0] }] : []),
      ...(contact ? [{ text: contact, alignment: "center", fontSize: 9, style: "muted", margin: [0, 3, 0, 0] }] : []),
      ...section("Summary", r.summary ? [{ text: pdfSafe(r.summary) }] : []),
      ...section("Experience", r.experience.flatMap((e) => [
        { columns: [{ text: [{ text: pdfSafe(e.title), bold: true }, pdfSafe([e.company, e.location].filter(Boolean).map((x) => `, ${x}`).join(""))] }, { text: dates(e.start, e.end), alignment: "right", width: "auto", style: "muted" }], margin: [0, 4, 0, 1] },
        { ul: e.bullets.map(pdfSafe), margin: [0, 0, 0, 3] },
      ])),
      ...section("Projects", r.projects.flatMap((p) => [
        { text: [{ text: pdfSafe(p.name), bold: true }, p.tech?.length ? { text: `  |  ${pdfSafe(p.tech.join(", "))}`, style: "muted" } : ""], margin: [0, 4, 0, 1] },
        { ul: p.bullets.map(pdfSafe), margin: [0, 0, 0, 3] },
      ])),
      ...section("Education", r.education.map((ed) => ({
        columns: [{ text: [{ text: pdfSafe(ed.degree), bold: true }, pdfSafe(`, ${ed.school}${ed.score ? `, ${ed.score}` : ""}`)] }, { text: dates(ed.start, ed.end), alignment: "right", width: "auto", style: "muted" }],
        margin: [0, 2, 0, 2],
      }))),
      ...section("Skills", r.skills.map((s) => ({ text: [{ text: `${pdfSafe(s.group)}: `, bold: true }, pdfSafe(s.items.join(", "))], margin: [0, 1, 0, 1] }))),
      ...section("Achievements", r.achievements.length ? [{ ul: r.achievements.map(pdfSafe) }] : []),
    ],
  };
}

/** Render to bytes. pdfmake is loaded lazily and locked down: no local files, no URLs. */
export async function renderResumePdf(r: ResumeData, title: string): Promise<Buffer> {
  const pdfmake = (await import("pdfmake")).default as unknown as {
    setFonts: (f: unknown) => void;
    setUrlAccessPolicy: (cb: (url: string) => boolean) => void;
    setLocalAccessPolicy: (cb: (path: string) => boolean) => void;
    createPdf: (def: unknown) => { getBuffer: () => Promise<Buffer> };
  };
  // Allow only the built in standard fonts (pdfmake resolves them like local files); nothing else.
  const STANDARD = new Set(["Helvetica", "Helvetica-Bold", "Helvetica-Oblique", "Helvetica-BoldOblique"]);
  pdfmake.setUrlAccessPolicy(() => false);
  pdfmake.setLocalAccessPolicy((path) => STANDARD.has(path));
  pdfmake.setFonts({ Helvetica: { normal: "Helvetica", bold: "Helvetica-Bold", italics: "Helvetica-Oblique", bolditalics: "Helvetica-BoldOblique" } });
  return pdfmake.createPdf(resumeDocDefinition(r, title)).getBuffer();
}

export function pdfFileName(name: string | undefined, company?: string) {
  const slug = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `${slug(name || "resume") || "resume"}${company ? `-${slug(company)}` : ""}-resume.pdf`;
}
