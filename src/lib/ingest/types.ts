import type { RawJob } from "./normalize";

export const ATS_VALUES = [
  "GREENHOUSE", "LEVER", "ASHBY", "SMARTRECRUITERS", "WORKABLE", "RECRUITEE", "WORKDAY", "KEKA", "ORACLE", "JSONLD", "AGGREGATOR", "MANUAL",
] as const;
export type Ats = (typeof ATS_VALUES)[number];

/** Hiring systems we crawl straight from the employer (everything except aggregators and manual entries). */
export const FEED_ATS = ATS_VALUES.filter((a) => a !== "AGGREGATOR" && a !== "MANUAL");

/** Per company settings a connector needs beyond its token. Stored in companies.ats_config. */
export type AtsConfig = {
  /** Workday: data centre host part, e.g. "wd5". */
  dc?: string;
  /** Workday: career site names, e.g. ["NVIDIAExternalCareerSite"]. Oracle: site numbers, e.g. ["CX_1"]. */
  sites?: string[];
  /** Keka: career portal id found on the company's /careers page. */
  portalId?: string;
  /** JSON-LD: sitemap URLs to read and a regex job URLs must match. */
  sitemaps?: string[];
  urlPattern?: string;
};

export type CrawlContext = {
  /** External ids we already store for this company. Detail requests are skipped for these. */
  known: Set<string>;
  /** Max detail requests in one run for one company. The rest are fetched in later runs. */
  maxDetails: number;
  log: (m: string) => void;
};

export type ConnectorResult = {
  /** Jobs to insert or update. */
  jobs: RawJob[];
  /** Known jobs that are still listed but were not fetched again (keeps them open). */
  stillListed: string[];
  /** Jobs listed but left for a later run because of the per run detail cap. */
  deferred?: number;
  /** False when the listing was cut short (paging limits), so missing jobs must not be closed. */
  complete?: boolean;
  /** Pages we opened that turned out not to be job postings; remembered so we don't open them again. */
  skipped?: string[];
  /** Settings discovered during the crawl (e.g. Keka's portal id), saved to ats_config. */
  config?: Partial<AtsConfig>;
};

export type Connector = (token: string, config: AtsConfig, ctx: CrawlContext) => Promise<ConnectorResult>;

export const defaultContext = (): CrawlContext => ({ known: new Set(), maxDetails: 300, log: () => {} });
