/*
 * Oracle Recruiting Cloud (Oracle Fusion HCM "Candidate Experience" career sites).
 * Career site: https://{host}/hcmUI/CandidateExperience/en/sites/{site}/jobs
 * The site loads its jobs from public REST endpoints on the same host:
 *   GET /hcmRestApi/resources/latest/recruitingCEJobRequisitions?finder=findReqs;siteNumber={site},limit,offset
 *   GET /hcmRestApi/resources/latest/recruitingCEJobRequisitionDetails?finder=ById;Id="{id}",siteNumber={site}
 * The listing already says each job's country, so detail requests only go to jobs in our scope.
 * Token: the host (e.g. fa-etvl-saasfaprod1.fa.ocs.oraclecloud.com). ats_config.sites: site numbers (e.g. ["CX_1"]).
 */
import { getJson } from "../http";
import { jobInScope } from "../geo";
import type { RawJob } from "../normalize";
import type { Connector } from "../types";

export type OracleListItem = {
  Id: string;
  Title: string;
  PostedDate?: string;
  PrimaryLocation?: string;
  PrimaryLocationCountry?: string;
  WorkplaceType?: string | null;
  secondaryLocations?: { Name?: string; CountryCode?: string }[];
};
export type OracleListResp = { items: { TotalJobsCount?: number; requisitionList?: OracleListItem[] }[] };
export type OracleDetailResp = {
  items: {
    Id: string;
    Title: string;
    ExternalPostedStartDate?: string;
    ExternalDescriptionStr?: string | null;
    ExternalResponsibilitiesStr?: string | null;
    ExternalQualificationsStr?: string | null;
    CorporateDescriptionStr?: string | null;
    PrimaryLocation?: string;
    PrimaryLocationCountry?: string;
    WorkplaceType?: string | null;
    JobSchedule?: string | null;
    Category?: string | null;
    secondaryLocations?: { Name?: string; CountryCode?: string }[];
  }[];
};

const PAGE = 25;
const MAX_LISTED = 2000;
const api = (host: string) => `https://${host}/hcmRestApi/resources/latest`;
export const oracleJobUrl = (host: string, site: string, id: string) => `https://${host}/hcmUI/CandidateExperience/en/sites/${site}/job/${id}`;

/** Country for a requisition: India if any of its locations is in India. */
export function oracleCountry(item: { PrimaryLocationCountry?: string; secondaryLocations?: { CountryCode?: string }[] }): string | null {
  const codes = [item.PrimaryLocationCountry, ...(item.secondaryLocations ?? []).map((l) => l.CountryCode)].filter(Boolean).map((c) => c!.toUpperCase());
  return codes.includes("IN") ? "IN" : codes[0] ?? null;
}

export function mapOracleDetail(host: string, site: string, d: OracleDetailResp["items"][number]): RawJob {
  const locs = [d.PrimaryLocation, ...(d.secondaryLocations ?? []).map((l) => l.Name)].filter(Boolean) as string[];
  const wt = (d.WorkplaceType ?? "").toLowerCase();
  const sections = [
    d.ExternalDescriptionStr,
    d.ExternalResponsibilitiesStr ? `<h3>Responsibilities</h3>${d.ExternalResponsibilitiesStr}` : "",
    d.ExternalQualificationsStr ? `<h3>Qualifications</h3>${d.ExternalQualificationsStr}` : "",
  ];
  return {
    externalId: d.Id,
    title: d.Title,
    location: [...new Set(locs)].join("; "),
    workMode: wt.includes("remote") ? "REMOTE" : wt.includes("hybrid") ? "HYBRID" : wt.includes("site") || wt.includes("office") ? "ONSITE" : undefined,
    department: d.Category ?? null,
    employment: d.JobSchedule ?? null,
    descriptionHtml: sections.filter(Boolean).join("\n"),
    applyUrl: oracleJobUrl(host, site, d.Id),
    postedAt: d.ExternalPostedStartDate ? new Date(d.ExternalPostedStartDate) : null,
    country: oracleCountry(d),
  };
}

export const fetchOracle: Connector = async (host, config, ctx) => {
  const sites = config.sites?.length ? config.sites : ["CX_1"];
  const jobs: RawJob[] = [];
  const stillListed: string[] = [];
  let details = 0;
  let deferred = 0;
  let complete = true;
  const seen = new Set<string>();

  for (const site of sites) {
    let total = Infinity;
    for (let offset = 0; offset < Math.min(total, MAX_LISTED); offset += PAGE) {
      const url = `${api(host)}/recruitingCEJobRequisitions?onlyData=true&expand=requisitionList.secondaryLocations&finder=findReqs;siteNumber=${encodeURIComponent(site)},limit=${PAGE},offset=${offset},sortBy=POSTING_DATES_DESC`;
      const page = await getJson<OracleListResp>(url);
      const item = page.items?.[0];
      total = item?.TotalJobsCount ?? 0;
      if (total > MAX_LISTED) complete = false;
      const list = item?.requisitionList ?? [];
      if (!list.length) break;
      for (const r of list) {
        if (seen.has(r.Id)) continue;
        seen.add(r.Id);
        if (ctx.known.has(r.Id)) {
          stillListed.push(r.Id);
          continue;
        }
        if (!jobInScope(oracleCountry(r), r.PrimaryLocation ?? "")) continue;
        if (details >= ctx.maxDetails) {
          deferred++;
          continue;
        }
        details++;
        try {
          const d = await getJson<OracleDetailResp>(
            `${api(host)}/recruitingCEJobRequisitionDetails?expand=all&onlyData=true&finder=ById;Id=%22${encodeURIComponent(r.Id)}%22,siteNumber=${encodeURIComponent(site)}`,
          );
          if (d.items?.[0]) jobs.push(mapOracleDetail(host, site, d.items[0]));
        } catch (e) {
          ctx.log(`  oracle job ${r.Id} failed: ${e instanceof Error ? e.message : e}`);
        }
      }
    }
  }
  return { jobs, stillListed, deferred, complete };
};
