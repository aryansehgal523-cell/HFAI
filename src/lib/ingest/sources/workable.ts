/*
 * Workable: the public jobs widget endpoint employers embed on their own sites.
 * https://apply.workable.com/api/v1/widget/accounts/{account}?details=true
 */
import { getJson } from "../http";
import type { RawJob } from "../normalize";
import type { Connector } from "../types";

export type WorkableResp = {
  name?: string;
  jobs: {
    title: string;
    shortcode: string;
    employment_type?: string;
    telecommuting?: boolean;
    department?: string;
    url: string;
    application_url?: string;
    published_on?: string;
    created_at?: string;
    country?: string;
    city?: string;
    state?: string;
    experience?: string;
    locations?: { country?: string; countryCode?: string; city?: string; region?: string | null; hidden?: boolean }[];
    description?: string;
  }[];
};

export function mapWorkable(data: WorkableResp): RawJob[] {
  // Workable repeats a job once per country it is open in; merge those into one job with all locations.
  const byCode = new Map<string, WorkableResp["jobs"][number]>();
  for (const j of data.jobs) {
    const prev = byCode.get(j.shortcode);
    if (!prev) byCode.set(j.shortcode, { ...j, locations: [...(j.locations ?? [])] });
    else prev.locations = [...(prev.locations ?? []), ...(j.locations ?? [])];
  }
  return [...byCode.values()].map((j) => {
    const locs = (j.locations ?? []).filter((l) => !l.hidden);
    const first = locs[0];
    const location =
      [...new Set(locs.map((l) => [l.city, l.region, l.country].filter(Boolean).join(", ")).filter(Boolean))].join("; ") ||
      [j.city, j.state, j.country].filter(Boolean).join(", ") ||
      (j.telecommuting ? "Remote" : "");
    // Any Indian location makes the job relevant to us, even if it is listed second.
    const codes = locs.map((l) => l.countryCode?.toUpperCase()).filter(Boolean) as string[];
    const country = codes.includes("IN") ? "IN" : codes[0] ?? null;
    return {
      externalId: j.shortcode,
      title: j.title,
      location: j.telecommuting && !/remote/i.test(location) ? `${location}${location ? " · " : ""}Remote` : location,
      workMode: j.telecommuting ? "REMOTE" : undefined,
      department: j.department || null,
      employment: j.employment_type || null,
      descriptionHtml: j.description ?? "",
      applyUrl: j.url,
      postedAt: j.published_on ? new Date(j.published_on) : j.created_at ? new Date(j.created_at) : null,
      country: first ? country : null,
      experience: j.experience || null,
    };
  });
}

export const fetchWorkable: Connector = async (token) => {
  const data = await getJson<WorkableResp>(`https://apply.workable.com/api/v1/widget/accounts/${encodeURIComponent(token)}?details=true`);
  return { jobs: mapWorkable(data), stillListed: [] };
};
