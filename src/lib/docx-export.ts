"use client";
import { AlignmentType, BorderStyle, Document, Packer, Paragraph, TextRun, TabStopType } from "docx";
import type { ResumeData } from "@/db/schema";

const FONT = "Calibri";
const t = (text: string, opts: { bold?: boolean; size?: number; color?: string } = {}) =>
  new TextRun({ text, font: FONT, size: opts.size ?? 21, bold: opts.bold, color: opts.color });

const heading = (text: string) =>
  new Paragraph({
    spacing: { before: 220, after: 80 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "222222", space: 1 } },
    children: [t(text.toUpperCase(), { bold: true, size: 22 })],
  });

const bullet = (text: string) => new Paragraph({ bullet: { level: 0 }, spacing: { after: 40 }, children: [t(text)] });

const rowWithDate = (left: TextRun[], right: string) =>
  new Paragraph({
    tabStops: [{ type: TabStopType.RIGHT, position: 10200 }],
    spacing: { before: 100, after: 40 },
    children: [...left, t(`\t${right}`, { color: "444444" })],
  });

function download(blob: Blob, name: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

const fileSafe = (s: string) => s.replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_|_$/g, "");

export async function downloadResumeDocx(r: ResumeData, company: string, role: string) {
  const contact = [r.contact?.email, r.contact?.phone, r.contact?.location, ...(r.contact?.links ?? [])].filter(Boolean).join("  |  ");
  const children: Paragraph[] = [
    new Paragraph({ alignment: AlignmentType.CENTER, children: [t(r.name ?? "", { bold: true, size: 36 })] }),
  ];
  if (r.headline) children.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [t(r.headline, { size: 22 })] }));
  if (contact) children.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [t(contact, { size: 19, color: "444444" })] }));
  if (r.summary) children.push(heading("Summary"), new Paragraph({ children: [t(r.summary)] }));

  if (r.experience.length) {
    children.push(heading("Experience"));
    for (const e of r.experience) {
      children.push(rowWithDate([t(e.title, { bold: true }), t(e.company ? `, ${e.company}` : "")], [e.start, e.end].filter(Boolean).join(" to ")));
      e.bullets.forEach((b) => children.push(bullet(b)));
    }
  }
  if (r.projects.length) {
    children.push(heading("Projects"));
    for (const p of r.projects) {
      children.push(new Paragraph({ spacing: { before: 100, after: 40 }, children: [t(p.name, { bold: true }), t(p.tech?.length ? `  |  ${p.tech.join(", ")}` : "", { color: "444444" })] }));
      p.bullets.forEach((b) => children.push(bullet(b)));
    }
  }
  if (r.education.length) {
    children.push(heading("Education"));
    for (const ed of r.education) {
      children.push(rowWithDate([t(ed.degree, { bold: true }), t(`, ${ed.school}${ed.score ? `, ${ed.score}` : ""}`)], [ed.start, ed.end].filter(Boolean).join(" to ")));
    }
  }
  if (r.skills.length) {
    children.push(heading("Skills"));
    r.skills.forEach((s) => children.push(new Paragraph({ spacing: { after: 40 }, children: [t(`${s.group}: `, { bold: true }), t(s.items.join(", "))] })));
  }
  if (r.achievements.length) {
    children.push(heading("Achievements"));
    r.achievements.forEach((a) => children.push(bullet(a)));
  }

  const doc = new Document({
    sections: [{ properties: { page: { margin: { top: 720, bottom: 720, left: 850, right: 850 } } }, children }],
  });
  download(await Packer.toBlob(doc), `${fileSafe(r.name ?? "Resume")}_${fileSafe(company)}_${fileSafe(role)}.docx`);
}

export async function downloadLetterDocx(letter: string, name: string, company: string) {
  const doc = new Document({
    sections: [{
      properties: { page: { margin: { top: 1000, bottom: 1000, left: 1100, right: 1100 } } },
      children: letter.split(/\n{2,}/).map((p) => new Paragraph({ spacing: { after: 200 }, children: [t(p.replace(/\n/g, " "), { size: 22 })] })),
    }],
  });
  download(await Packer.toBlob(doc), `${fileSafe(name)}_${fileSafe(company)}_Cover_Letter.docx`);
}
