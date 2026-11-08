/*
 * Recruitee: the public offers endpoint on the company's careers subdomain.
 * https://{company}.recruitee.com/api/offers/
 */
import { getJson } from "../http";
import type { RawJob } from "../normalize";
import type { Connector } from "../types";

export type RecruiteeResp = {
  offers: {
    id: number;
    slug: string;
    title: string;
    status?: string;
    location?: string;
    city?: string;
    country?: string;
    country_code?: string;
    remote?: boolean;
    hybrid?: boolean;
    on_site?: boolean;
    department?: string | null;
    employment_type_code?: string | null;
    experience_code?: string | null;
    description?: string;
    requirements?: string;
    careers_url?: string;
    careers_apply_url?: string;
    published_at?: string | null;
    created_at?: string;
    locations?: { city?: string; country?: string; country_code?: string; state?: string }[];
    salary?: { min?: string | number | null; max?: string | number | null; period?: string | null; currency?: string | null } | null;
  }[];
};

const recruiteeDate = (s?: string | null) => (s ? new Date(s.replace(" UTC", "Z").replace(" ", "T")) : null);
const num = (v: string | number | null | undefined) => (v === null || v === undefined || v === "" ? null : Number(v));

const EMPLOYMENT: Record<string, string> = {
  fulltime: "Full time", fulltime_permanent: "Full time", fulltime_fixed_term: "Full time, fixed term",
  parttime: "Part time", parttime_permanent: "Part time", internship: "Internship", contract: "Contract",
  freelance: "Freelance", temporary: "Temporary", traineeship: "Traineeship", apprenticeship: "Apprenticeship",
};

export function mapRecruitee(data: RecruiteeResp): RawJob[] {
  return data.offers
    .filter((o) => !o.status || o.status === "published")
    .map((o) => {
      const codes = (o.locations ?? []).map((l) => l.country_code?.toUpperCase()).filter(Boolean) as string[];
      if (o.country_code) codes.push(o.country_code.toUpperCase());
      const salaryMin = num(o.salary?.min);
      const salaryMax = num(o.salary?.max);
      const period = o.salary?.period ?? "";
      return {
        externalId: String(o.id),
        title: o.title,
        location: o.location || [o.city, o.country].filter(Boolean).join(", ") || (o.remote ? "Remote" : ""),
        workMode: o.remote ? "REMOTE" : o.hybrid ? "HYBRID" : o.on_site ? "ONSITE" : undefined,
        department: o.department ?? null,
        employment: o.employment_type_code ? EMPLOYMENT[o.employment_type_code] ?? o.employment_type_code.replace(/_/g, " ") : null,
        descriptionHtml: `${o.description ?? ""}${o.requirements ? `<h3>Requirements</h3>${o.requirements}` : ""}`,
        applyUrl: o.careers_url ?? o.careers_apply_url ?? "",
        postedAt: recruiteeDate(o.published_at) ?? recruiteeDate(o.created_at),
        country: codes.includes("IN") ? "IN" : codes[0] ?? null,
        salary:
          salaryMin || salaryMax
            ? { min: salaryMin, max: salaryMax, currency: o.salary?.currency ?? null, period: /hour/.test(period) ? "HOUR" : /month/.test(period) ? "MONTH" : "YEAR" }
            : null,
      };
    });
}

export const fetchRecruitee: Connector = async (token) => {
  const data = await getJson<RecruiteeResp>(`https://${encodeURIComponent(token)}.recruitee.com/api/offers/`);
  return { jobs: mapRecruitee(data), stillListed: [] };
};
