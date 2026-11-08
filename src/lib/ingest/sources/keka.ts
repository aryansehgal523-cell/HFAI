/*
 * Keka (Indian HR system). The company's public careers page at https://{company}.keka.com/careers/
 * loads its jobs from https://{company}.keka.com/careers/api/embedjobs/default/active/{portalId}.
 * Keka's robots.txt disallows everything except /careers, and both URLs are under /careers.
 * The portal id is on the careers page itself; we store it in ats_config after the first visit.
 */
import { getJson, getText } from "../http";
import type { RawJob } from "../normalize";
import type { Connector } from "../types";

export type KekaJob = {
  id: number;
  title: string;
  description?: string;
  departmentName?: string;
  jobLocations?: { name?: string; city?: string; state?: string; countryCode?: string; countryName?: string }[];
  jobType?: number;
  experience?: string;
  publishedOn?: string;
  salaryRange?: { min?: number; max?: number; currency?: string; salaryPeriod?: number } | null;
  isRemote?: boolean;
};

export function mapKeka(sub: string, data: KekaJob[]): RawJob[] {
  return data.map((j) => {
    const locs = j.jobLocations ?? [];
    const codes = locs.map((l) => l.countryCode?.toUpperCase()).filter(Boolean) as string[];
    const location = locs.map((l) => [l.city, l.countryName].filter(Boolean).join(", ")).filter(Boolean).join("; ");
    return {
      externalId: String(j.id),
      title: j.title,
      location: location || (j.isRemote ? "Remote" : ""),
      workMode: j.isRemote ? "REMOTE" : undefined,
      department: j.departmentName ?? null,
      // Keka's numeric jobType is not documented, so we leave employment type empty rather than guess.
      employment: null,
      descriptionHtml: j.description ?? "",
      applyUrl: `https://${sub}.keka.com/careers/jobdetails/${j.id}`,
      postedAt: j.publishedOn ? new Date(j.publishedOn) : null,
      country: codes.includes("IN") ? "IN" : codes[0] ?? null,
      experience: j.experience ?? null,
      salary:
        j.salaryRange?.min || j.salaryRange?.max
          ? { min: j.salaryRange.min ?? null, max: j.salaryRange.max ?? null, currency: j.salaryRange.currency ?? "INR", period: "YEAR" }
          : null,
    };
  });
}

/** Find the portal id on a Keka careers page: it appears in the /ats/documents/{id}/careerportal/... path. */
export function kekaPortalId(html: string): string | null {
  return html.match(/\/ats\/documents\/([0-9a-f-]{36})\/careerportal\//i)?.[1] ?? html.match(/embedjobs\/js\/([0-9a-f-]{36})/i)?.[1] ?? null;
}

export async function discoverKekaPortal(sub: string): Promise<string | null> {
  const html = await getText(`https://${sub}.keka.com/careers/`);
  return kekaPortalId(html);
}

export const fetchKeka: Connector = async (token, config) => {
  const portalId = config.portalId ?? (await discoverKekaPortal(token));
  if (!portalId) throw new Error(`no Keka career portal found at ${token}.keka.com/careers`);
  const data = await getJson<KekaJob[]>(`https://${token}.keka.com/careers/api/embedjobs/default/active/${portalId}`);
  return { jobs: mapKeka(token, data), stillListed: [], config: config.portalId ? undefined : { portalId } };
};
