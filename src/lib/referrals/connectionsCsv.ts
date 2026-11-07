/*
 * Parsers for contact files the user uploads. Pure functions, unit tested.
 *  - LinkedIn's Connections.csv (Settings > Data privacy > Get a copy of your data)
 *  - A simple alumni sheet: name, company, position, linkedin, batch
 */

export const MAX_ROWS = 30_000;

/** RFC 4180 CSV: quoted fields, "" escapes, commas and newlines inside quotes, CRLF or LF. */
export function parseCsv(text: string): string[][] {
  const s = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text; // UTF-8 BOM
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"') {
        if (s[i + 1] === '"') { field += '"'; i++; }
        else quoted = false;
      } else field += c;
      continue;
    }
    if (c === '"' && field === "") quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows;
}

export type ParsedConnection = {
  firstName: string;
  lastName: string;
  profileUrl: string | null;
  email: string | null;
  company: string;
  position: string | null;
  connectedOn: Date | null;
  batch?: string | null;
};

export type ParseResult = { rows: ParsedConnection[]; skipped: number; truncated: boolean; error?: string };

const clean = (v: string | undefined) => (v ?? "").replace(/\s+/g, " ").trim();
const orNull = (v: string) => (v ? v : null);

/** LinkedIn writes dates like "07 Nov 2026" (older exports used "11/7/26"). */
export function parseConnectedOn(v: string): Date | null {
  const t = v.trim();
  if (!t) return null;
  let m = t.match(/^(\d{1,2})\s+([A-Za-z]{3})[a-z]*\s+(\d{4})$/);
  if (m) {
    const month = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].indexOf(m[2].toLowerCase());
    if (month >= 0) return new Date(Date.UTC(Number(m[3]), month, Number(m[1])));
  }
  m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (m) {
    const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    return new Date(Date.UTC(y, Number(m[1]) - 1, Number(m[2])));
  }
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function normaliseProfileUrl(v: string): string | null {
  const t = v.trim();
  if (!t) return null;
  const m = t.match(/linkedin\.com\/in\/([^/?#\s]+)/i);
  if (m) return `https://www.linkedin.com/in/${decodeURIComponent(m[1]).toLowerCase()}`;
  return /^https?:\/\//i.test(t) ? t : null;
}

/**
 * LinkedIn's file starts with a few note lines ("Notes:", a sentence about emails...) before
 * the real header. Find the row that contains "First Name" and read the columns by name.
 */
export function parseLinkedInConnections(text: string): ParseResult {
  const all = parseCsv(text);
  const headerIdx = all.findIndex((r) => r.some((c) => clean(c).toLowerCase() === "first name"));
  if (headerIdx === -1) {
    return { rows: [], skipped: 0, truncated: false, error: "This does not look like LinkedIn's Connections.csv. Open the file from LinkedIn's email and upload Connections.csv." };
  }
  const header = all[headerIdx].map((h) => clean(h).toLowerCase());
  const col = (name: string) => header.indexOf(name);
  const c = {
    first: col("first name"), last: col("last name"), url: col("url"), email: col("email address"),
    company: col("company"), position: col("position"), on: col("connected on"),
  };
  const rows: ParsedConnection[] = [];
  let skipped = 0;
  let truncated = false;
  for (const r of all.slice(headerIdx + 1)) {
    if (r.every((x) => !clean(x))) continue; // blank line
    const firstName = clean(r[c.first]);
    const company = c.company >= 0 ? clean(r[c.company]) : "";
    if (!firstName || !company) { skipped++; continue; } // no name or no employer: nothing to match on
    if (rows.length >= MAX_ROWS) { truncated = true; break; }
    rows.push({
      firstName,
      lastName: clean(r[c.last]),
      profileUrl: c.url >= 0 ? normaliseProfileUrl(r[c.url] ?? "") : null,
      email: c.email >= 0 ? orNull(clean(r[c.email]).toLowerCase()) : null,
      company,
      position: c.position >= 0 ? orNull(clean(r[c.position])) : null,
      connectedOn: c.on >= 0 ? parseConnectedOn(r[c.on] ?? "") : null,
    });
  }
  return { rows, skipped, truncated };
}

/** Alumni sheet from a placement cell or alumni group: name, company, position, linkedin, batch. */
export function parseAlumniCsv(text: string): ParseResult {
  const all = parseCsv(text).filter((r) => r.some((x) => clean(x)));
  if (all.length === 0) return { rows: [], skipped: 0, truncated: false, error: "The file is empty." };
  const header = all[0].map((h) => clean(h).toLowerCase());
  const find = (...names: string[]) => header.findIndex((h) => names.includes(h));
  const c = {
    name: find("name", "full name"), first: find("first name"), last: find("last name"),
    company: find("company", "current company", "organisation", "organization"),
    position: find("position", "title", "role", "designation"),
    url: find("linkedin", "linkedin url", "profile", "url"), batch: find("batch", "year", "graduation year", "class"),
    email: find("email", "email address"),
  };
  if (c.company === -1 || (c.name === -1 && c.first === -1)) {
    return { rows: [], skipped: 0, truncated: false, error: "Your sheet needs at least these columns: name, company. Optional: position, linkedin, batch." };
  }
  const rows: ParsedConnection[] = [];
  let skipped = 0;
  let truncated = false;
  for (const r of all.slice(1)) {
    let firstName = c.first >= 0 ? clean(r[c.first]) : "";
    let lastName = c.last >= 0 ? clean(r[c.last]) : "";
    if (c.name >= 0) {
      const parts = clean(r[c.name]).split(" ");
      firstName = parts[0] ?? "";
      lastName = parts.slice(1).join(" ");
    }
    const company = clean(r[c.company]);
    if (!firstName || !company) { skipped++; continue; }
    if (rows.length >= MAX_ROWS) { truncated = true; break; }
    rows.push({
      firstName, lastName, company,
      position: c.position >= 0 ? orNull(clean(r[c.position])) : null,
      profileUrl: c.url >= 0 ? normaliseProfileUrl(r[c.url] ?? "") : null,
      email: c.email >= 0 ? orNull(clean(r[c.email]).toLowerCase()) : null,
      connectedOn: null,
      batch: c.batch >= 0 ? orNull(clean(r[c.batch])) : null,
    });
  }
  return { rows, skipped, truncated };
}
