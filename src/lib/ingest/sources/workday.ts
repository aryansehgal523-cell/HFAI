/*
 * Workday. Each employer's career site (https://{tenant}.{dc}.myworkdayjobs.com/{site}) loads its
 * jobs from public JSON endpoints under /wday/cxs/{tenant}/{site}/. We use those same endpoints:
 *   POST .../jobs           list, 20 per page, with facets (India jobs are listed first when the site has an India facet)
 *   GET  .../job/{path}     one job with its full description
 * Workday tenants publish robots.txt that allows their career sites; http.ts checks it for every URL.
 * Detail requests are only made for jobs we have not stored yet, capped per run (ctx.maxDetails).
 */
import { getJson, postJson } from "../http";
import { countryCode, crawlScope, locationLooksInScope } from "../geo";
import type { RawJob } from "../normalize";
import type { Connector } from "../types";

type Facet = { facetParameter?: string; descriptor?: string; id?: string; count?: number; values?: Facet[] };
export type WorkdayListResp = {
  total?: number;
  jobPostings: { title: string; externalPath: string; locationsText?: string; postedOn?: string; bulletFields?: string[] }[];
  facets?: Facet[];
};
export type WorkdayDetailResp = {
  jobPostingInfo: {
    id?: string;
    title: string;
    jobDescription?: string;
    location?: string;
    additionalLocations?: string[];
    startDate?: string;
    postedOn?: string;
    timeType?: string;
    jobReqId?: string;
    externalUrl?: string;
    country?: { descriptor?: string; id?: string };
    remoteType?: string;
  };
  hiringOrganization?: { name?: string };
};

const PAGE = 20;
/** Workday stops paging at 2,000 results per search; we stop a little earlier per site. */
const MAX_LISTED = Number(process.env.WORKDAY_MAX_LISTED ?? 2000);

/** Find the facet value for India anywhere in the facet tree: { parameter, id }. */
export function findIndiaFacet(facets: Facet[] | undefined): { parameter: string; id: string } | null {
  for (const f of facets ?? []) {
    for (const v of f.values ?? []) {
      if (v.values) {
        const nested = findIndiaFacet([v]);
        if (nested) return nested;
      } else if (f.facetParameter && v.id && /^india$/i.test(v.descriptor ?? "")) {
        return { parameter: f.facetParameter, id: v.id };
      }
    }
  }
  return null;
}

/** "Posted 15 Days Ago", "Posted Today", "Posted 30+ Days Ago" → a date. */
export function workdayPostedOn(text: string | undefined, now = new Date()): Date | null {
  if (!text) return null;
  const t = text.toLowerCase();
  if (t.includes("today")) return now;
  if (t.includes("yesterday")) return new Date(now.getTime() - 86_400_000);
  const m = t.match(/(\d+)\+?\s*days?/);
  return m ? new Date(now.getTime() - Number(m[1]) * 86_400_000) : null;
}

export function mapWorkdayDetail(host: string, site: string, path: string, d: WorkdayDetailResp): RawJob {
  const j = d.jobPostingInfo;
  const locs = [j.location, ...(j.additionalLocations ?? [])].filter(Boolean) as string[];
  const remote = /remote/i.test(j.remoteType ?? "") || locs.some((l) => /remote/i.test(l));
  return {
    externalId: path,
    title: j.title,
    location: locs.join("; "),
    workMode: remote ? "REMOTE" : /hybrid/i.test(j.remoteType ?? "") ? "HYBRID" : undefined,
    employment: j.timeType ?? null,
    descriptionHtml: j.jobDescription ?? "",
    applyUrl: j.externalUrl ?? `https://${host}/${site}${path}`,
    postedAt: j.startDate ? new Date(j.startDate) : workdayPostedOn(j.postedOn),
    // Workday's country field covers the primary location only; an Indian additional location still counts as India.
    country: locs.some((l) => /india/i.test(l)) ? "IN" : countryCode(j.country?.descriptor) ?? null,
  };
}

/** "3 Locations" tells us nothing, so it needs the detail request to decide. */
const listingInScope = (text?: string) => !text || /^\d+\s+locations?$/i.test(text.trim()) || locationLooksInScope(text);

export const fetchWorkday: Connector = async (tenant, config, ctx) => {
  if (!config.dc || !config.sites?.length) throw new Error("Workday company needs ats_config.dc and ats_config.sites");
  const host = `${tenant}.${config.dc}.myworkdayjobs.com`;
  const jobs: RawJob[] = [];
  const stillListed: string[] = [];
  const seen = new Set<string>();
  let details = 0;
  let deferred = 0;
  let complete = true;

  const handle = async (base: string, site: string, p: WorkdayListResp["jobPostings"][number]) => {
    if (!p.externalPath || seen.has(p.externalPath)) return;
    seen.add(p.externalPath);
    if (ctx.known.has(p.externalPath)) {
      stillListed.push(p.externalPath);
      return;
    }
    if (!listingInScope(p.locationsText)) return;
    if (details >= ctx.maxDetails) {
      deferred++;
      return;
    }
    details++;
    try {
      const d = await getJson<WorkdayDetailResp>(`${base}/job${p.externalPath.replace(/^\/job/, "")}`);
      jobs.push(mapWorkdayDetail(host, site, p.externalPath, d));
    } catch (e) {
      // One broken posting should not fail the whole company.
      ctx.log(`  workday detail failed for ${p.externalPath}: ${e instanceof Error ? e.message : e}`);
    }
  };

  for (const site of config.sites) {
    const base = `https://${host}/wday/cxs/${encodeURIComponent(tenant)}/${encodeURIComponent(site)}`;
    const first = await postJson<WorkdayListResp>(`${base}/jobs`, { appliedFacets: {}, limit: PAGE, offset: 0, searchText: "" });
    const india = findIndiaFacet(first.facets);
    // Pass 1: India jobs first (when the site has an India facet), so the detail budget goes to them first.
    // Pass 2: every job (only when the scope is "all"). Already seen jobs are skipped.
    const passes: Record<string, string[]>[] = [];
    if (india) passes.push({ [india.parameter]: [india.id] });
    if (crawlScope() === "all" || !india) passes.push({});
    for (const appliedFacets of passes) {
      let total = Infinity;
      for (let offset = 0; offset < Math.min(total, MAX_LISTED); offset += PAGE) {
        const page =
          offset === 0 && Object.keys(appliedFacets).length === 0
            ? first
            : await postJson<WorkdayListResp>(`${base}/jobs`, { appliedFacets, limit: PAGE, offset, searchText: "" });
        if (offset === 0) {
          total = page.total ?? 0;
          // Workday reports at most 2,000 results, so a total at the cap may hide more: don't close anything then.
          if (total >= MAX_LISTED) complete = false;
        }
        if (!page.jobPostings?.length) break;
        for (const p of page.jobPostings) await handle(base, site, p);
      }
    }
  }
  return { jobs, stillListed, deferred, complete };
};
