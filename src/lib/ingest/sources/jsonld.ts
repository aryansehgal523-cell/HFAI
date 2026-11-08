/*
 * Any careers site that publishes schema.org JobPosting data (JSON-LD) for search engines.
 * Token: the careers host (e.g. "careers.example.com"). We read the sitemaps listed in its robots.txt
 * (or /sitemap.xml), keep URLs that look like job pages (ats_config.urlPattern when detection found one),
 * then open new job pages and read their JobPosting blocks. Every request obeys robots.txt.
 */
import { allowedByRobots, getText, robotsFor } from "../http";
import { extractJsonLdJobPostings, mapJobPosting } from "../jobposting";
import { detectCountry } from "../geo";
import type { RawJob } from "../normalize";
import type { Connector } from "../types";

/** A path segment that introduces a job page, followed by more path. */
const JOB_SEGMENT = /\/(jobs?|job-?details?|job-?description|positions?|openings?|vacanc(y|ies)|requisitions?|opportunit(y|ies)|careers?\/(job|position|opening)s?)\/./i;

/**
 * Does this URL look like one job's page? Checked on the path only (hosts like jobs.example.com would
 * otherwise match everything), and the last segment must look like an id or a job slug.
 */
export function looksLikeJobUrl(url: string): boolean {
  let path: string;
  try {
    path = new URL(url).pathname;
  } catch {
    return false;
  }
  if (!JOB_SEGMENT.test(path)) return false;
  const last = path.replace(/\/+$/, "").split("/").pop() ?? "";
  return /\d{3,}/.test(last) || (last.length >= 12 && last.includes("-"));
}

type UrlFilter = { test(url: string): boolean };
const DEFAULT_JOB_URL: UrlFilter = { test: looksLikeJobUrl };
const MAX_SITEMAP_FILES = 25;
const MAX_URLS = 5000;

export type SitemapEntry = { loc: string; lastmod: number };

/** Parse a sitemap or sitemap index. Returns child sitemaps and page URLs separately. */
export function parseSitemap(xml: string): { sitemaps: string[]; pages: SitemapEntry[] } {
  const isIndex = /<sitemapindex[\s>]/i.test(xml);
  const entries = [...xml.matchAll(/<(?:url|sitemap)>([\s\S]*?)<\/(?:url|sitemap)>/gi)].map((m) => {
    const loc = m[1].match(/<loc>\s*(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?\s*<\/loc>/i)?.[1]?.trim().replace(/&amp;/g, "&") ?? "";
    const lastmod = Date.parse(m[1].match(/<lastmod>\s*([^<]+?)\s*<\/lastmod>/i)?.[1] ?? "") || 0;
    return { loc, lastmod };
  }).filter((e) => /^https?:\/\//.test(e.loc));
  return isIndex ? { sitemaps: entries.map((e) => e.loc), pages: [] } : { sitemaps: [], pages: entries };
}

/** Walk sitemaps breadth first and return job-looking page URLs, newest first. */
export async function jobUrlsFromSitemaps(start: string[], pattern: UrlFilter, log: (m: string) => void) {
  const queue = [...start];
  const seenMaps = new Set<string>();
  const pages = new Map<string, number>();
  let truncated = false;
  while (queue.length && seenMaps.size < MAX_SITEMAP_FILES) {
    const url = queue.shift()!;
    if (seenMaps.has(url) || /\.gz($|\?)/i.test(url)) continue;
    seenMaps.add(url);
    let xml: string;
    try {
      xml = await getText(url, { accept: "application/xml,text/xml;q=0.9,*/*;q=0.5" });
    } catch (e) {
      log(`  sitemap ${url} failed: ${e instanceof Error ? e.message : e}`);
      continue;
    }
    const parsed = parseSitemap(xml);
    // Job sitemaps first when an index lists many (e.g. sitemap-jobs.xml before sitemap-blog.xml).
    queue.push(...parsed.sitemaps.sort((a, b) => Number(/job|career|position|vacanc/i.test(b)) - Number(/job|career|position|vacanc/i.test(a))));
    for (const p of parsed.pages) if (pattern.test(p.loc)) pages.set(p.loc, Math.max(p.lastmod, pages.get(p.loc) ?? 0));
  }
  if (queue.length) truncated = true;
  const sorted = [...pages.entries()].sort((a, b) => b[1] - a[1]).map(([loc]) => loc);
  if (sorted.length > MAX_URLS) truncated = true;
  return { urls: sorted.slice(0, MAX_URLS), truncated };
}

export async function sitemapsFor(host: string): Promise<string[]> {
  const robots = await robotsFor(`https://${host}/`);
  const own = robots.sitemaps.filter((s) => {
    try {
      return new URL(s).host.endsWith(host.replace(/^www\./, ""));
    } catch {
      return false;
    }
  });
  return own.length ? own : [`https://${host}/sitemap.xml`];
}

export async function jobFromPage(url: string): Promise<RawJob | null> {
  const html = await getText(url);
  for (const jp of extractJsonLdJobPostings(html)) {
    const raw = mapJobPosting(jp, url);
    if (raw) return { ...raw, externalId: url, applyUrl: raw.applyUrl.startsWith("http") ? raw.applyUrl : url };
  }
  return null;
}

export const fetchJsonLd: Connector = async (host, config, ctx) => {
  // urlPattern (found by detection) is matched against the full URL; the default checks the path.
  const pattern: UrlFilter = config.urlPattern ? new RegExp(config.urlPattern, "i") : DEFAULT_JOB_URL;
  const found = await jobUrlsFromSitemaps(config.sitemaps?.length ? config.sitemaps : await sitemapsFor(host), pattern, ctx.log);
  if (!found.urls.length) throw new Error(`no job pages found in the sitemaps of ${host}`);
  const truncated = found.truncated;
  // Sitemaps can list pages robots.txt disallows; leave those out before anything else.
  const urls: string[] = [];
  for (const u of found.urls) if (await allowedByRobots(u)) urls.push(u);

  // Many enterprise career sites put the city in the job URL (/job/bengaluru/...). Open those first,
  // so the per run detail budget goes to jobs our users can apply for.
  const indiaFirst = (u: string) => (detectCountry(decodeURIComponent(new URL(u).pathname).replace(/[-_/]+/g, " ")) === "IN" ? 0 : 1);
  urls.sort((a, b) => indiaFirst(a) - indiaFirst(b));

  const jobs: RawJob[] = [];
  const stillListed: string[] = [];
  let details = 0;
  let deferred = 0;
  let failed = 0;
  const skipped: string[] = [];
  for (const url of urls) {
    if (ctx.known.has(url)) {
      stillListed.push(url);
      continue;
    }
    if (details >= ctx.maxDetails) {
      deferred++;
      continue;
    }
    details++;
    try {
      const raw = await jobFromPage(url);
      if (raw) jobs.push(raw);
      else skipped.push(url);
    } catch (e) {
      failed++;
      if (failed <= 3) ctx.log(`  ${url}: ${e instanceof Error ? e.message : e}`);
    }
  }
  return { jobs, stillListed, deferred, complete: !truncated, skipped };
};
