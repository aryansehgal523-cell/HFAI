import type { RawJob } from "./normalize";

/*
 * Connectors for public ATS job board APIs. These feeds are published by the ATS
 * for embedding a company's open jobs on its own career site. We read them politely:
 * one request per company per crawl, with a clear user agent and contact email.
 */

const UA = () =>
  `HireFlowBot/1.0 (+${process.env.NEXT_PUBLIC_APP_URL ?? "https://hireflow.ai"}/bot; ${process.env.CRAWLER_CONTACT_EMAIL ?? "crawler@hireflow.ai"})`;

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: { "User-Agent": UA(), Accept: "application/json" },
    signal: AbortSignal.timeout(20_000),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return (await res.json()) as T;
}

// ── Greenhouse ──────────────────────────────────────────────
type GreenhouseResp = {
  jobs: {
    id: number;
    title: string;
    absolute_url: string;
    updated_at: string;
    first_published?: string;
    location?: { name?: string };
    content?: string;
    departments?: { name: string }[];
    metadata?: { name: string; value: unknown }[] | null;
  }[];
};

export function mapGreenhouse(data: GreenhouseResp): RawJob[] {
  return data.jobs.map((j) => ({
    externalId: String(j.id),
    title: j.title,
    location: j.location?.name ?? "",
    department: j.departments?.[0]?.name ?? null,
    descriptionHtml: j.content ?? "",
    applyUrl: j.absolute_url,
    postedAt: new Date(j.first_published ?? j.updated_at),
  }));
}

export async function fetchGreenhouse(token: string) {
  return mapGreenhouse(await getJson<GreenhouseResp>(`https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(token)}/jobs?content=true`));
}

// ── Lever ───────────────────────────────────────────────────
type LeverPosting = {
  id: string;
  text: string;
  hostedUrl: string;
  applyUrl?: string;
  createdAt: number;
  workplaceType?: "remote" | "hybrid" | "on-site" | "onsite" | "unspecified";
  categories?: { location?: string; commitment?: string; team?: string; department?: string };
  descriptionPlain?: string;
  lists?: { text: string; content: string }[];
  additionalPlain?: string;
  salaryRange?: { min?: number; max?: number; currency?: string; interval?: string };
};

export function mapLever(data: LeverPosting[]): RawJob[] {
  return data.map((p) => {
    const wt = p.workplaceType;
    const lists = (p.lists ?? []).map((l) => `${l.text}\n${l.content}`).join("\n");
    return {
      externalId: p.id,
      title: p.text,
      location: p.categories?.location ?? "",
      workMode: wt === "remote" ? "REMOTE" : wt === "hybrid" ? "HYBRID" : wt === "on-site" || wt === "onsite" ? "ONSITE" : undefined,
      department: p.categories?.team ?? p.categories?.department ?? null,
      employment: p.categories?.commitment ?? null,
      descriptionText: p.descriptionPlain ? `${p.descriptionPlain}\n${p.additionalPlain ?? ""}` : undefined,
      descriptionHtml: p.descriptionPlain ? undefined : lists,
      applyUrl: p.applyUrl ?? p.hostedUrl,
      postedAt: new Date(p.createdAt),
      salary: p.salaryRange
        ? {
            min: p.salaryRange.min,
            max: p.salaryRange.max,
            currency: p.salaryRange.currency,
            period: p.salaryRange.interval?.includes("hour") ? "HOUR" : p.salaryRange.interval?.includes("month") ? "MONTH" : "YEAR",
          }
        : null,
    };
  });
}

export async function fetchLever(token: string) {
  return mapLever(await getJson<LeverPosting[]>(`https://api.lever.co/v0/postings/${encodeURIComponent(token)}?mode=json`));
}

// ── Ashby ───────────────────────────────────────────────────
type AshbyResp = {
  jobs: {
    id: string;
    title: string;
    location?: string;
    department?: string;
    employmentType?: string;
    isRemote?: boolean;
    workplaceType?: "Remote" | "Hybrid" | "OnSite" | null;
    publishedAt?: string;
    jobUrl: string;
    applyUrl?: string;
    descriptionPlain?: string;
    descriptionHtml?: string;
    isListed?: boolean;
    compensation?: {
      summaryComponents?: { compensationType: string; interval?: string; currencyCode?: string; minValue?: number; maxValue?: number }[];
    };
  }[];
};

export function mapAshby(data: AshbyResp): RawJob[] {
  return data.jobs
    .filter((j) => j.isListed !== false)
    .map((j) => {
      const salary = j.compensation?.summaryComponents?.find((c) => c.compensationType === "Salary");
      const wt = j.workplaceType;
      return {
        externalId: j.id,
        title: j.title,
        location: j.location ?? "",
        workMode: wt === "Remote" || j.isRemote ? "REMOTE" : wt === "Hybrid" ? "HYBRID" : wt === "OnSite" ? "ONSITE" : undefined,
        department: j.department ?? null,
        employment: j.employmentType ?? null,
        descriptionText: j.descriptionPlain,
        descriptionHtml: j.descriptionHtml,
        applyUrl: j.applyUrl ?? j.jobUrl,
        postedAt: j.publishedAt ? new Date(j.publishedAt) : new Date(),
        salary: salary
          ? {
              min: salary.minValue,
              max: salary.maxValue,
              currency: salary.currencyCode,
              period: salary.interval?.toLowerCase().includes("hour") ? "HOUR" : salary.interval?.toLowerCase().includes("month") ? "MONTH" : "YEAR",
            }
          : null,
      };
    });
}

export async function fetchAshby(token: string) {
  return mapAshby(await getJson<AshbyResp>(`https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(token)}?includeCompensation=true`));
}

export async function fetchJobsFor(ats: "GREENHOUSE" | "LEVER" | "ASHBY" | "MANUAL", token: string): Promise<RawJob[]> {
  switch (ats) {
    case "GREENHOUSE": return fetchGreenhouse(token);
    case "LEVER": return fetchLever(token);
    case "ASHBY": return fetchAshby(token);
    default: return [];
  }
}
