/*
 * schema.org JobPosting: the structured data employers publish on job pages for search engines.
 * We read it from JSON-LD blocks and, for sites that use it (SmartRecruiters), from microdata.
 */
import { countryCode, countryName } from "./geo";
import { decodeEntities, type RawJob } from "./normalize";

type Json = Record<string, unknown>;
const asArray = <T,>(v: T | T[] | undefined | null): T[] => (v === undefined || v === null ? [] : Array.isArray(v) ? v : [v]);
const str = (v: unknown): string | null => (typeof v === "string" ? v : typeof v === "number" ? String(v) : null);

function isJobPosting(o: unknown): o is Json {
  if (!o || typeof o !== "object") return false;
  const t = (o as Json)["@type"];
  return asArray(t as string | string[]).some((x) => typeof x === "string" && /(^|\/)JobPosting$/i.test(x));
}

function collect(node: unknown, out: Json[]) {
  if (Array.isArray(node)) {
    for (const n of node) collect(n, out);
    return;
  }
  if (!node || typeof node !== "object") return;
  if (isJobPosting(node)) out.push(node as Json);
  const graph = (node as Json)["@graph"];
  if (graph) collect(graph, out);
}

/** Every JobPosting object in the page's JSON-LD script blocks. Malformed blocks are skipped. */
export function extractJsonLdJobPostings(html: string): Json[] {
  const out: Json[] = [];
  const re = /<script[^>]+type\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi;
  for (const m of html.matchAll(re)) {
    const body = m[1].trim().replace(/^<!\[CDATA\[|\]\]>$/g, "");
    try {
      collect(JSON.parse(body), out);
    } catch {
      // Some sites put raw newlines inside strings; try once more with them escaped.
      try {
        collect(JSON.parse(body.replace(/[\r\n\t]+/g, " ")), out);
      } catch {
        /* not JSON we can read */
      }
    }
  }
  return out;
}

function addressOf(place: unknown): { text: string; country: string | null } {
  const p = (place ?? {}) as Json;
  const a = ((p.address ?? p) as Json) || {};
  const countryRaw = a.addressCountry;
  const country = str(countryRaw) ?? str((countryRaw as Json | undefined)?.name) ?? null;
  // A bare country code ("IT") reads like a department; spell the country out.
  const countryText = country && /^[A-Za-z]{2,3}$/.test(country) ? countryName(countryCode(country)) ?? country : country;
  const parts = [str(a.addressLocality), str(a.addressRegion), countryText].filter(Boolean) as string[];
  const text = parts.join(", ") || str(p.name) || "";
  return { text, country: countryCode(country) };
}

function salaryOf(s: unknown): RawJob["salary"] {
  const b = s as Json | undefined;
  if (!b) return null;
  const v = (b.value ?? {}) as Json;
  const min = Number(v.minValue ?? v.value ?? NaN);
  const max = Number(v.maxValue ?? v.value ?? NaN);
  if (!Number.isFinite(min) && !Number.isFinite(max)) return null;
  const unit = String(v.unitText ?? b.unitText ?? "YEAR").toUpperCase();
  return {
    min: Number.isFinite(min) ? min : null,
    max: Number.isFinite(max) ? max : null,
    currency: str(b.currency),
    period: unit.includes("HOUR") ? "HOUR" : unit.includes("MONTH") ? "MONTH" : "YEAR",
  };
}

/** Map one JobPosting to our RawJob. Returns null for postings that have expired or lack a title. */
export function mapJobPosting(jp: Json, pageUrl: string, now = new Date()): RawJob | null {
  const title = str(jp.title)?.trim();
  if (!title) return null;
  const validThrough = str(jp.validThrough);
  if (validThrough && !Number.isNaN(Date.parse(validThrough)) && new Date(validThrough) < now) return null;

  const places = asArray(jp.jobLocation).map(addressOf).filter((p) => p.text);
  const remote = asArray(jp.jobLocationType as string | string[]).some((t) => /telecommute/i.test(String(t)));
  const codes = places.map((p) => p.country).filter(Boolean) as string[];
  const applicantCountries = asArray(jp.applicantLocationRequirements as Json | Json[]).map((r) => countryCode(str(r?.name)));
  const allCodes = [...codes, ...(applicantCountries.filter(Boolean) as string[])];
  const identifier = jp.identifier as Json | string | undefined;
  const id = str(typeof identifier === "object" ? identifier?.value : identifier);
  const posted = str(jp.datePosted);

  return {
    externalId: (id && id.length < 120 ? id : null) ?? pageUrl,
    title: decodeEntities(title),
    location: places.map((p) => p.text).join("; ") || (remote ? "Remote" : ""),
    workMode: remote ? "REMOTE" : undefined,
    employment: asArray(jp.employmentType as string | string[]).map((e) => String(e).replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase())).join(", ") || null,
    department: str((jp.occupationalCategory as unknown) ?? null),
    descriptionHtml: str(jp.description) ?? "",
    applyUrl: str(jp.url) ?? pageUrl,
    postedAt: posted && !Number.isNaN(Date.parse(posted)) ? new Date(posted) : null,
    country: allCodes.includes("IN") ? "IN" : allCodes[0] ?? null,
    salary: salaryOf(jp.baseSalary),
    experience: str((jp.experienceRequirements as Json | undefined)?.monthsOfExperience)
      ? `${Math.round(Number((jp.experienceRequirements as Json).monthsOfExperience) / 12)}+ years`
      : str(jp.experienceRequirements),
  };
}

/**
 * Microdata JobPosting (itemprop attributes), as used by SmartRecruiters job pages.
 * Reads the handful of properties we need; values come from content="" or the element text.
 */
export function microdataJobPosting(html: string): Json | null {
  if (!/itemtype=["'][^"']*schema\.org\/JobPosting/i.test(html) && !/itemprop=["']datePosted/i.test(html)) return null;
  const prop = (name: string): string | null => {
    const withContent = html.match(new RegExp(`itemprop=["']${name}["'][^>]*content=["']([^"']*)["']`, "i")) ?? html.match(new RegExp(`content=["']([^"']*)["'][^>]*itemprop=["']${name}["']`, "i"));
    if (withContent) return decodeEntities(withContent[1]);
    const withText = html.match(new RegExp(`itemprop=["']${name}["'][^>]*>([^<]*)<`, "i"));
    return withText ? decodeEntities(withText[1]).trim() || null : null;
  };
  // The description is a block of HTML: take everything inside the itemprop="description" element.
  let description = "";
  const start = html.search(/itemprop=["']description["']/i);
  if (start >= 0) {
    const open = html.indexOf(">", start) + 1;
    // SmartRecruiters ends the description sections where the apply section (id="st-apply") starts.
    const rest = html.slice(open);
    const end = rest.search(/<[^>]+id=["']st-apply["']/i);
    description = rest.slice(0, end > 0 ? end : 30_000);
  }
  return {
    "@type": "JobPosting",
    title: prop("title"),
    datePosted: prop("datePosted"),
    employmentType: prop("employmentType"),
    description,
    jobLocation: {
      address: { addressLocality: prop("addressLocality"), addressRegion: prop("addressRegion"), addressCountry: prop("addressCountry") },
    },
  };
}
