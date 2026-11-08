/*
 * Which hiring system does a company use? Used by `npm run detect:ats`.
 *
 * 1. Fetch the careers page once (falling back to common careers URLs) and look for links and
 *    scripts that point at a known hiring system.
 * 2. If none, try the public Greenhouse, Lever, Ashby, Workable, Recruitee, SmartRecruiters, Keka
 *    and Workday feeds with board tokens made from the company name and domain. A probe hit only
 *    counts when the board's own company name matches, or the token is the company's full name.
 * 3. Last, look for schema.org JobPosting pages in the careers site's sitemap (JSON-LD).
 * Every candidate is verified by counting its live jobs; only working sources are returned.
 */
import { companyKey, similarKeys } from "@/lib/referrals/company";
import { getJson, getText, postJson, robotsFor, politeFetch } from "./http";
import { discoverKekaPortal, kekaPortalId, type KekaJob } from "./sources/keka";
import { findIndiaFacet, type WorkdayListResp } from "./sources/workday";
import { parseSrGroups } from "./sources/smartrecruiters";
import { jobFromPage, jobUrlsFromSitemaps, looksLikeJobUrl, sitemapsFor } from "./sources/jsonld";
import type { WorkableResp } from "./sources/workable";
import type { RecruiteeResp } from "./sources/recruitee";
import type { OracleListResp } from "./sources/oracle";
import type { Ats, AtsConfig } from "./types";

export type Candidate = { ats: Ats | "DARWINBOX"; token: string; config?: AtsConfig };
export type Verified = { ats: Ats; token: string; config: AtsConfig; jobs: number; indiaJobs?: number; boardName?: string };

const WORKDAY_DCS = ["wd1", "wd3", "wd5", "wd12", "wd10", "wd103", "wd101", "wd102", "wd108", "wd105"];
const SKIP_TOKENS = new Set(["embed", "js", "v1", "api", "jobs", "job", "j", "www", "cdn", "static", "help", "support", "app", "login", "careers", "assets"]);
const WORKDAY_SKIP_SITE = /internal|contractor|conversion|alumni|talent.?community|agency|referral|employee|recruitad|research$/i;

/** Hiring system links in a careers page (HTML plus the URL we ended up on after redirects). */
export function parseAtsLinks(html: string, finalUrl = ""): Candidate[] {
  const text = `${finalUrl}\n${html}`;
  const out: Candidate[] = [];
  const add = (c: Candidate) => {
    if (!c.token || SKIP_TOKENS.has(c.token.toLowerCase())) return;
    if (!out.some((o) => o.ats === c.ats && o.token.toLowerCase() === c.token.toLowerCase())) out.push(c);
  };
  for (const m of text.matchAll(/(?:boards|job-boards)(?:\.eu)?\.greenhouse\.io\/(?:embed\/job_board(?:\/js)?\?for=)?([a-z0-9_-]+)/gi)) add({ ats: "GREENHOUSE", token: m[1].toLowerCase() });
  for (const m of text.matchAll(/greenhouse\.io\/(?:v1\/boards|embed\/job_board\/js\?for=)\/?([a-z0-9_-]+)/gi)) add({ ats: "GREENHOUSE", token: m[1].toLowerCase() });
  for (const m of text.matchAll(/jobs\.lever\.co\/([a-z0-9_.-]+)/gi)) add({ ats: "LEVER", token: m[1].toLowerCase() });
  for (const m of text.matchAll(/jobs\.ashbyhq\.com\/([a-z0-9_.%-]+)/gi)) add({ ats: "ASHBY", token: decodeURIComponent(m[1]) });
  for (const m of text.matchAll(/([a-z0-9_-]+)\.(wd\d+)\.myworkdayjobs\.com\/(?:[a-z]{2}-[A-Z]{2}\/)?([A-Za-z0-9_-]+)/g)) {
    const site = m[3];
    if (/^(wday|cxs|job)$/i.test(site) || WORKDAY_SKIP_SITE.test(site)) continue;
    const existing = out.find((o) => o.ats === "WORKDAY" && o.token === m[1].toLowerCase());
    if (existing) {
      if (!existing.config!.sites!.includes(site)) existing.config!.sites!.push(site);
    } else add({ ats: "WORKDAY", token: m[1].toLowerCase(), config: { dc: m[2].toLowerCase(), sites: [site] } });
  }
  for (const m of text.matchAll(/(?:careers|jobs)\.smartrecruiters\.com\/([A-Za-z0-9_-]+)/g)) add({ ats: "SMARTRECRUITERS", token: m[1] });
  for (const m of text.matchAll(/apply\.workable\.com\/([a-z0-9_-]+)/gi)) add({ ats: "WORKABLE", token: m[1].toLowerCase() });
  for (const m of text.matchAll(/\/\/([a-z0-9-]+)\.recruitee\.com/gi)) add({ ats: "RECRUITEE", token: m[1].toLowerCase() });
  for (const m of text.matchAll(/\/\/([a-z0-9-]+)\.keka\.com/gi)) add({ ats: "KEKA", token: m[1].toLowerCase() });
  for (const m of text.matchAll(/\/\/([a-z0-9.-]+\.oraclecloud\.com)\/hcmUI\/CandidateExperience\/[a-z-]+\/sites\/([A-Za-z0-9_]+)/gi)) {
    const existing = out.find((o) => o.ats === "ORACLE" && o.token === m[1].toLowerCase());
    if (existing) {
      if (!existing.config!.sites!.includes(m[2])) existing.config!.sites!.push(m[2]);
    } else add({ ats: "ORACLE", token: m[1].toLowerCase(), config: { sites: [m[2]] } });
  }
  for (const m of text.matchAll(/\/\/([a-z0-9-]+)\.darwinbox\.(?:in|com)/gi)) add({ ats: "DARWINBOX", token: m[1].toLowerCase() });
  return out;
}

const BOARD_WORDS = new Set(["careers", "career", "jobs", "job", "board", "hiring", "recruiting", "openings"]);
const LEGAL = new Set(["private", "pvt", "limited", "ltd", "inc", "incorporated", "llc", "llp", "corp", "corporation", "co", "company", "plc", "gmbh", "ag", "sa", "bv", "pte", "pty", "the"]);

/** Lowercase words of a name without punctuation and legal suffixes ("Western Digital Corp." → "western digital"). */
export function legalName(name: string): string {
  const words = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ")
    .replace(/\(.*?\)/g, " ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  // Board names often carry "Careers" or "Job Board" ("Rubrik Job Board", "HackerRank Careers").
  while (words.length > 1 && (LEGAL.has(words[words.length - 1]) || BOARD_WORDS.has(words[words.length - 1]))) words.pop();
  if (words[0] === "the" && words.length > 1) words.shift();
  return words.join(" ");
}

/** Board tokens to try for a company: full compact name, hyphenated name, the shorter referral key, domain stem. */
export function slugCandidates(name: string, website?: string): string[] {
  const words = legalName(name).split(" ").filter((w) => w !== "and");
  const key = companyKey(name).replace(/and/g, " ").trim().split(/\s+/).join("");
  let stem = "";
  try {
    if (website) stem = new URL(website).hostname.replace(/^www\./, "").split(".")[0];
  } catch {
    /* ignore */
  }
  return [...new Set([words.join(""), words.join("-"), key, stem].filter((s) => s && s.length >= 3 && !SKIP_TOKENS.has(s)))];
}

/** Does a board's own name belong to this company? Exact after dropping legal suffixes, or a near miss on a long name. */
export function sameCompany(boardName: string | undefined, seedName: string): boolean {
  if (!boardName) return false;
  const a = legalName(boardName);
  const b = legalName(seedName);
  if (a === b || similarKeys(a, b)) return true;
  // "Razorpay Software Private Limited" vs "Razorpay": the referral key drops descriptor words.
  const ka = companyKey(boardName);
  const kb = companyKey(seedName);
  return ka === kb && ka.replace(/ /g, "").length >= 6 && (a.startsWith(b) || b.startsWith(a));
}

/** Verify a candidate by counting its live jobs. Returns null when it has no working feed. */
export async function verify(c: Candidate): Promise<Verified | null> {
  try {
    switch (c.ats) {
      case "GREENHOUSE": {
        const d = await getJson<{ jobs: unknown[] }>(`https://boards-api.greenhouse.io/v1/boards/${c.token}/jobs`);
        if (!d.jobs.length) return { ats: "GREENHOUSE", token: c.token, config: {}, jobs: 0 };
        const board = await getJson<{ name?: string }>(`https://boards-api.greenhouse.io/v1/boards/${c.token}`).catch(() => ({ name: undefined }));
        return { ats: "GREENHOUSE", token: c.token, config: {}, jobs: d.jobs.length, boardName: board.name };
      }
      case "LEVER": {
        const d = await getJson<{ hostedUrl?: string }[]>(`https://api.lever.co/v0/postings/${c.token}?mode=json`);
        return Array.isArray(d) ? { ats: "LEVER", token: c.token, config: {}, jobs: d.length } : null;
      }
      case "ASHBY": {
        const d = await getJson<{ jobs: unknown[]; apiVersion?: string }>(`https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(c.token)}`);
        return { ats: "ASHBY", token: c.token, config: {}, jobs: d.jobs.length };
      }
      case "WORKABLE": {
        const d = await getJson<WorkableResp>(`https://apply.workable.com/api/v1/widget/accounts/${c.token}`);
        return { ats: "WORKABLE", token: c.token, config: {}, jobs: new Set(d.jobs.map((j) => j.shortcode)).size, boardName: d.name };
      }
      case "RECRUITEE": {
        const d = await getJson<RecruiteeResp & { offers: { company_name?: string }[] }>(`https://${c.token}.recruitee.com/api/offers/`);
        return { ats: "RECRUITEE", token: c.token, config: {}, jobs: d.offers.length, boardName: d.offers[0]?.company_name };
      }
      case "KEKA": {
        const portalId = c.config?.portalId ?? (await discoverKekaPortal(c.token));
        if (!portalId) return null;
        const d = await getJson<KekaJob[]>(`https://${c.token}.keka.com/careers/api/embedjobs/default/active/${portalId}`);
        return { ats: "KEKA", token: c.token, config: { portalId }, jobs: d.length };
      }
      case "SMARTRECRUITERS": {
        const html = await getText(`https://careers.smartrecruiters.com/${c.token}`);
        const { groups } = parseSrGroups(html, c.token);
        const jobs = groups.reduce((a, g) => a + g.qty, 0);
        const title = html.match(/<title>([^<]*)<\/title>/i)?.[1]?.replace(/^\s*(careers at|jobs at)\s*/i, "").trim();
        return { ats: "SMARTRECRUITERS", token: c.token, config: {}, jobs, boardName: title };
      }
      case "ORACLE": {
        let jobs = 0;
        const sites: string[] = [];
        for (const site of (c.config?.sites ?? ["CX_1"]).slice(0, 3)) {
          const d = await getJson<OracleListResp>(
            `https://${c.token}/hcmRestApi/resources/latest/recruitingCEJobRequisitions?onlyData=true&finder=findReqs;siteNumber=${site},limit=1,offset=0`,
          ).catch(() => null);
          const n = d?.items?.[0]?.TotalJobsCount ?? 0;
          if (n > 0) {
            jobs += n;
            sites.push(site);
          }
        }
        return sites.length ? { ats: "ORACLE", token: c.token, config: { sites }, jobs } : null;
      }
      case "WORKDAY": {
        const cfg = c.config!;
        let jobs = 0;
        let indiaJobs = 0;
        const sites: string[] = [];
        for (const site of (cfg.sites ?? []).slice(0, 4)) {
          const base = `https://${c.token}.${cfg.dc}.myworkdayjobs.com/wday/cxs/${c.token}/${site}/jobs`;
          const first = await postJson<WorkdayListResp>(base, { appliedFacets: {}, limit: 1, offset: 0, searchText: "" }).catch(() => null);
          if (!first || !first.total) continue;
          sites.push(site);
          jobs += first.total;
          const india = findIndiaFacet(first.facets);
          if (india) {
            const r = await postJson<WorkdayListResp>(base, { appliedFacets: { [india.parameter]: [india.id] }, limit: 1, offset: 0, searchText: "" }).catch(() => null);
            indiaJobs += r?.total ?? 0;
          }
        }
        return sites.length ? { ats: "WORKDAY", token: c.token, config: { dc: cfg.dc, sites }, jobs, indiaJobs } : null;
      }
      default:
        return null;
    }
  } catch {
    return null;
  }
}

/** Workday tenants list their career sites as sitemaps in robots.txt. */
export async function probeWorkday(tenant: string): Promise<Candidate | null> {
  for (const dc of WORKDAY_DCS) {
    const robots = await robotsFor(`https://${tenant}.${dc}.myworkdayjobs.com/`);
    const sites = robots.sitemaps
      .map((s) => s.match(/myworkdayjobs\.com\/(?:[a-z]{2}-[A-Z]{2}\/)?([A-Za-z0-9_-]+)\/siteMap\.xml/i)?.[1])
      .filter((s): s is string => !!s && !WORKDAY_SKIP_SITE.test(s));
    if (sites.length) return { ats: "WORKDAY", token: tenant, config: { dc, sites: sites.slice(0, 3) } };
  }
  return null;
}

async function fetchCareersPage(urls: string[]): Promise<{ html: string; url: string } | null> {
  for (const url of urls) {
    try {
      const res = await politeFetch(url, { accept: "text/html,*/*;q=0.8", retries: 1, timeoutMs: 20_000 });
      if (!res.ok) continue;
      const type = res.headers.get("content-type") ?? "";
      if (type && !/html|text/i.test(type)) continue;
      return { html: (await res.text()).slice(0, 2_000_000), url: res.url || url };
    } catch {
      /* try the next URL */
    }
  }
  return null;
}

/** JSON-LD: the careers site's sitemap has job pages with JobPosting data. */
export async function probeJsonLd(host: string): Promise<Verified | null> {
  try {
    const { urls } = await jobUrlsFromSitemaps(await sitemapsFor(host), { test: looksLikeJobUrl }, () => {});
    if (!urls.length) return null;
    for (const u of urls.slice(0, 3)) {
      const job = await jobFromPage(u).catch(() => null);
      if (job) return { ats: "JSONLD", token: host, config: {}, jobs: urls.length };
    }
  } catch {
    /* no sitemap or blocked */
  }
  return null;
}

export type SeedCompany = { name: string; website: string; careersUrl: string; industry?: string; hqCountry?: string; size?: string };
export type DetectResult = { seed: SeedCompany; found: (Verified & { evidence: string }) | null; darwinbox?: string; careersPage?: string; tried: string[] };

export async function detectCompany(seed: SeedCompany): Promise<DetectResult> {
  const tried: string[] = [];
  const host = new URL(seed.website).hostname.replace(/^www\./, "");
  const page = await fetchCareersPage([seed.careersUrl, `https://careers.${host}/`, `https://${host}/careers/`, `https://jobs.${host}/`, `https://${host}/jobs`]);
  let darwinbox: string | undefined;

  // 1. Links on the careers page.
  if (page) {
    const links = parseAtsLinks(page.html, page.url);
    for (const c of links) {
      if (c.ats === "DARWINBOX") {
        darwinbox = c.token;
        continue;
      }
      if (c.ats === "KEKA" && !c.config?.portalId) {
        const id = kekaPortalId(page.html);
        if (id) c.config = { portalId: id };
      }
      tried.push(`${c.ats.toLowerCase()}:${c.token}`);
      const v = await verify(c);
      if (v && v.jobs > 0) return { seed, found: { ...v, evidence: `linked from ${page.url}` }, careersPage: page.url, tried };
    }
  }

  // 2. Probe public feeds with tokens made from the name and domain.
  const slugs = slugCandidates(seed.name, seed.website);
  const compactName = legalName(seed.name).replace(/[^a-z0-9]/g, "");
  for (const slug of slugs) {
    const strongToken = slug === compactName && slug.length >= 6;
    for (const ats of ["GREENHOUSE", "ASHBY", "LEVER", "WORKABLE", "RECRUITEE", "SMARTRECRUITERS", "KEKA"] as const) {
      // These feeds don't publish a company name, so only a full-name token can be trusted.
      if (!strongToken && (ats === "ASHBY" || ats === "LEVER" || ats === "KEKA")) continue;
      tried.push(`${ats.toLowerCase()}:${slug}`);
      const v = await verify({ ats, token: ats === "SMARTRECRUITERS" ? slug.replace(/(^|-)([a-z])/g, (_, a, b) => b.toUpperCase()) : slug });
      if (!v || v.jobs === 0) continue;
      // Generic tokens can belong to another company: require the board's own name to match,
      // or for feeds that don't publish a name, a full-name token.
      if (sameCompany(v.boardName, seed.name) || (!v.boardName && strongToken)) {
        return { seed, found: { ...v, evidence: `feed probe ${ats.toLowerCase()}/${v.token}` }, careersPage: page?.url, darwinbox, tried };
      }
    }
    // Workday tenants have no public company name to check, so only try the full name and the domain stem.
    if (slug.length >= 4 && (slug === compactName || slug === host.split(".")[0])) {
      tried.push(`workday:${slug}`);
      const wd = await probeWorkday(slug);
      if (wd) {
        const v = await verify(wd);
        if (v && v.jobs > 0) return { seed, found: { ...v, evidence: `workday tenant ${slug}.${wd.config?.dc}` }, careersPage: page?.url, darwinbox, tried };
      }
    }
  }

  // 3. JSON-LD on the careers host, then the main site.
  const hosts = [...new Set([page ? new URL(page.url).hostname : null, `careers.${host}`, host].filter(Boolean) as string[])];
  for (const h of hosts) {
    if (/myworkdayjobs|greenhouse|lever\.co|ashbyhq|smartrecruiters|workable|recruitee|keka\.com|darwinbox|oraclecloud/.test(h)) continue;
    tried.push(`jsonld:${h}`);
    const v = await probeJsonLd(h);
    if (v) return { seed, found: { ...v, evidence: `JobPosting pages in ${h} sitemap` }, careersPage: page?.url, darwinbox, tried };
  }
  return { seed, found: null, careersPage: page?.url, darwinbox, tried };
}
