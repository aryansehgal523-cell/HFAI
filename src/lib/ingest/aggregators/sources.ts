/*
 * Official job search APIs. Each is turned on only when its keys are set, and each job keeps the link
 * and attribution its terms require.
 *
 *  Adzuna  https://developer.adzuna.com  India endpoint /v1/api/jobs/in/search/{page}. Terms: label each
 *          advert "Adzuna" with a link to the Adzuna site. Free keys are for evaluation; commercial use
 *          needs a licence from Adzuna after a 14 day trial.
 *  Jooble  https://jooble.org/api/about  POST https://{JOOBLE_HOST}/api/{key}. Republishing listings needs
 *          Jooble's written permission (their site terms, section 4).
 *  Careerjet is not used: its API must be called with the IP address of the visitor doing the search,
 *  so it cannot be used to collect jobs in the background.
 */
import { getJson, postJson, setHostInterval } from "../http";
import { countryCode, detectCountry } from "../geo";
import type { RawJob } from "../normalize";
import type { Query } from "./queries";

export type AggregatorJob = RawJob & { companyName: string; sourceJobId: string };
export type AggregatorPage = { jobs: AggregatorJob[]; total: number; perPage: number };

export type AggregatorSource = {
  id: "adzuna" | "jooble";
  label: string;
  enabled: () => boolean;
  /** API calls allowed per day (from the provider's plan; set in env). */
  dailyLimit: () => number;
  /** Pages to read per query. */
  pages: () => number;
  search: (q: Query, page: number) => Promise<AggregatorPage>;
};

const envNum = (name: string, fallback: number) => {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

// ── Adzuna ──────────────────────────────────────────────────
export type AdzunaResp = {
  count?: number;
  results: {
    id: string;
    title: string;
    description?: string;
    created?: string;
    redirect_url: string;
    salary_min?: number;
    salary_max?: number;
    salary_is_predicted?: number | string;
    contract_type?: string;
    contract_time?: string;
    company?: { display_name?: string };
    location?: { display_name?: string; area?: string[] };
    category?: { label?: string; tag?: string };
  }[];
};

const ADZUNA_PER_PAGE = 50;

export function mapAdzuna(data: AdzunaResp): AggregatorJob[] {
  return data.results
    .filter((r) => r.company?.display_name && r.title && r.redirect_url)
    .map((r) => {
      const area = r.location?.area ?? [];
      const location = r.location?.display_name || area.slice(1).reverse().join(", ");
      const predicted = String(r.salary_is_predicted ?? "0") === "1";
      return {
        externalId: `adzuna:${r.id}`,
        sourceJobId: String(r.id),
        companyName: r.company!.display_name!.trim(),
        title: r.title.replace(/<[^>]+>/g, "").trim(),
        location,
        department: r.category?.label?.replace(/ Jobs$/, "") ?? null,
        employment: [r.contract_time?.replace("_", " "), r.contract_type].filter(Boolean).join(", ") || null,
        descriptionHtml: r.description ?? "",
        applyUrl: r.redirect_url,
        postedAt: r.created ? new Date(r.created) : null,
        country: countryCode(area[0]) ?? "IN",
        // Adzuna estimates salaries for some ads; only show salaries the employer published.
        salary: !predicted && (r.salary_min || r.salary_max) ? { min: r.salary_min ?? null, max: r.salary_max ?? null, currency: "INR", period: "YEAR" } : null,
      };
    });
}

export const adzuna: AggregatorSource = {
  id: "adzuna",
  label: "Adzuna",
  enabled: () => Boolean(process.env.ADZUNA_APP_ID && process.env.ADZUNA_APP_KEY),
  dailyLimit: () => envNum("ADZUNA_DAILY_LIMIT", 250),
  pages: () => envNum("ADZUNA_PAGES_PER_QUERY", 2),
  async search(q, page) {
    setHostInterval("api.adzuna.com", 2500); // Adzuna allows about 25 calls a minute
    const params = new URLSearchParams({
      app_id: process.env.ADZUNA_APP_ID!,
      app_key: process.env.ADZUNA_APP_KEY!,
      results_per_page: String(ADZUNA_PER_PAGE),
      what: q.keyword,
      max_days_old: "30",
      sort_by: "date",
      "content-type": "application/json",
    });
    if (q.location.toLowerCase() === "remote") params.set("what", `${q.keyword} remote`);
    else params.set("where", q.location);
    const data = await getJson<AdzunaResp>(`https://api.adzuna.com/v1/api/jobs/in/search/${page}?${params}`, { ignoreRobots: true });
    return { jobs: mapAdzuna(data), total: data.count ?? 0, perPage: ADZUNA_PER_PAGE };
  },
};

// ── Jooble ──────────────────────────────────────────────────
export type JoobleResp = {
  totalCount?: number;
  jobs: { id: string | number; title: string; location?: string; snippet?: string; salary?: string; source?: string; type?: string; link: string; company?: string; updated?: string }[];
};

const JOOBLE_PER_PAGE = 20;

export function mapJooble(data: JoobleResp): AggregatorJob[] {
  return data.jobs
    .filter((j) => j.company && j.title && j.link)
    .map((j) => ({
      externalId: `jooble:${j.id}`,
      sourceJobId: String(j.id),
      companyName: j.company!.trim(),
      title: j.title.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").trim(),
      location: j.location ?? "",
      employment: j.type || null,
      descriptionHtml: j.snippet ?? "",
      applyUrl: j.link,
      postedAt: j.updated && !Number.isNaN(Date.parse(j.updated)) ? new Date(j.updated) : null,
      country: detectCountry(j.location ?? "") ?? "IN",
    }));
}

export const jooble: AggregatorSource = {
  id: "jooble",
  label: "Jooble",
  enabled: () => Boolean(process.env.JOOBLE_API_KEY),
  dailyLimit: () => envNum("JOOBLE_DAILY_LIMIT", 500),
  pages: () => envNum("JOOBLE_PAGES_PER_QUERY", 2),
  async search(q, page) {
    const host = process.env.JOOBLE_HOST || "jooble.org";
    const remote = q.location.toLowerCase() === "remote";
    const data = await postJson<JoobleResp>(`https://${host}/api/${process.env.JOOBLE_API_KEY}`, {
      keywords: remote ? `${q.keyword} remote` : q.keyword,
      location: remote ? "India" : `${q.location}, India`,
      page: String(page),
      ResultOnPage: String(JOOBLE_PER_PAGE),
    }, { ignoreRobots: true });
    return { jobs: mapJooble(data), total: data.totalCount ?? 0, perPage: JOOBLE_PER_PAGE };
  },
};

export const AGGREGATORS: AggregatorSource[] = [adzuna, jooble];
