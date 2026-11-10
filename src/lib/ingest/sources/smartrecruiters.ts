/*
 * SmartRecruiters. Its posting API host (api.smartrecruiters.com) has a robots.txt that only admits
 * LinkedIn's crawler, so we do not use it. Instead we read the employer's public career pages:
 *   https://careers.smartrecruiters.com/{Company}                 jobs grouped by location (page 0 of the groups)
 *   https://careers.smartrecruiters.com/{Company}/api/groups?page=N   further location groups
 *   https://careers.smartrecruiters.com/{Company}/api/more?type=location&value=...&page=N   more jobs in one location
 *   https://jobs.smartrecruiters.com/{Company}/{id}-{slug}        one job, with schema.org microdata
 * Groups in India are expanded first; groups outside the crawl scope are skipped; only new jobs are opened.
 */
import { getText } from "../http";
import { detectCountry, locationLooksInScope } from "../geo";
import { mapJobPosting, microdataJobPosting } from "../jobposting";
import { decodeEntities, type RawJob } from "../normalize";
import type { Connector } from "../types";

export type SrListedJob = { id: string; url: string; title: string };
export type SrGroup = { location: string; jobs: SrListedJob[]; moreValue: string | null; qty: number };

/** Parse job links out of a career page fragment. */
export function parseSrJobs(html: string, company: string): SrListedJob[] {
  const out: SrListedJob[] = [];
  const re = new RegExp(`<a[^>]+href="(https://jobs\\.smartrecruiters\\.com/${company.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/(\\d+)[^"]*)"[^>]*>[\\s\\S]*?<h4[^>]*>([\\s\\S]*?)</h4>`, "gi");
  for (const m of html.matchAll(re)) out.push({ url: m[1], id: m[2], title: decodeEntities(m[3].replace(/<[^>]+>/g, "").trim()) });
  return out;
}

/** Parse location groups: each <section data-qty> has a location heading, a few jobs and a "show more" value. */
export function parseSrGroups(html: string, company: string): { groups: SrGroup[]; groupPages: number } {
  const groupPages = Number(html.match(/data-groups-pages="(\d+)"/)?.[1] ?? 1);
  const groups = html
    .split(/<section data-qty=/)
    .slice(1)
    .map((s) => {
      const qty = Number(s.match(/^"(\d+)"/)?.[1] ?? 0);
      const heading = s.match(/<h3[^>]*>([\s\S]*?)<\/h3>/)?.[1] ?? "";
      const more = s.match(/data-type="location"[^>]*data-value="([^"]*)"|data-value="([^"]*)"[^>]*data-type="location"/);
      return {
        location: decodeEntities(heading.replace(/<[^>]+>/g, "").trim()),
        jobs: parseSrJobs(s, company),
        moreValue: more ? decodeURIComponent(more[1] ?? more[2]) : null,
        qty,
      };
    });
  return { groups, groupPages };
}

const MAX_GROUP_PAGES = 40;
const MAX_MORE_PAGES = 60;

export const fetchSmartRecruiters: Connector = async (company, _config, ctx) => {
  const base = `https://careers.smartrecruiters.com/${encodeURIComponent(company)}`;
  const first = await getText(base);
  const { groups, groupPages } = parseSrGroups(first, company);
  if (!groups.length && !parseSrJobs(first, company).length && !/data-groups-pages/.test(first)) {
    throw new Error(`no SmartRecruiters career page for ${company}`);
  }
  for (let p = 1; p < Math.min(groupPages, MAX_GROUP_PAGES); p++) {
    groups.push(...parseSrGroups(await getText(`${base}/api/groups?page=${p}`), company).groups);
  }

  // Indian locations first, so the per run detail budget reaches them first.
  const isIndia = (g: SrGroup) => (detectCountry(g.location) === "IN" ? 0 : 1);
  groups.sort((a, b) => isIndia(a) - isIndia(b));
  const listed = new Map<string, SrListedJob & { location: string }>();
  for (const g of groups) {
    if (!locationLooksInScope(g.location)) continue;
    for (const j of g.jobs) listed.set(j.id, { ...j, location: g.location });
    if (g.moreValue && g.qty > g.jobs.length) {
      for (let page = 1; page < MAX_MORE_PAGES; page++) {
        const more = parseSrJobs(await getText(`${base}/api/more?type=location&value=${encodeURIComponent(g.moreValue)}&page=${page}`), company);
        const fresh = more.filter((j) => !listed.has(j.id));
        for (const j of fresh) listed.set(j.id, { ...j, location: g.location });
        if (!fresh.length) break;
      }
    }
  }

  const jobs: RawJob[] = [];
  const stillListed: string[] = [];
  let details = 0;
  let deferred = 0;
  const skipped: string[] = [];
  for (const j of listed.values()) {
    if (ctx.known.has(j.id)) {
      stillListed.push(j.id);
      continue;
    }
    if (details >= ctx.maxDetails) {
      deferred++;
      continue;
    }
    details++;
    try {
      const html = await getText(j.url);
      const md = microdataJobPosting(html);
      const raw = md ? mapJobPosting(md, j.url) : null;
      if (raw) jobs.push({ ...raw, externalId: j.id, title: raw.title || j.title, location: raw.location || j.location, applyUrl: j.url });
      else skipped.push(j.id);
    } catch (e) {
      ctx.log(`  smartrecruiters job ${j.id} failed: ${e instanceof Error ? e.message : e}`);
    }
  }
  return { jobs, stillListed, deferred, skipped };
};
