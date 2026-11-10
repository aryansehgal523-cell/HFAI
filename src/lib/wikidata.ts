/*
 * Company facts from Wikidata (CC0): employee count and headquarters country.
 * We query Wikimedia's public SPARQL endpoint with our user agent, 40 names per request. The endpoint's
 * robots.txt is for web crawlers; Wikimedia's query service policy allows automated queries that identify
 * themselves, which is what this does.
 *
 * Several items can share a label ("Stripe" the payments company and others). We keep the item whose
 * official website matches the company's domain; otherwise the most notable one (most Wikipedia sitelinks).
 */
import { postForm } from "./ingest/http";

export type WikidataCandidate = { name: string; qid: string; sitelinks: number; employees: number | null; country: string | null; hqCountry: string | null; websites: string[] };
export type WikidataFact = { qid: string; employees: number | null; hqCountry: string | null; website: string | null; fetchedAt: string };

const ENDPOINT = "https://query.wikidata.org/sparql";

const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

export function buildQuery(names: string[]): string {
  return `SELECT ?name ?item ?links (MAX(?emp) AS ?employees) (SAMPLE(?cc) AS ?country) (SAMPLE(?hqcc) AS ?hq) (GROUP_CONCAT(DISTINCT STR(?site); separator=" ") AS ?sites) WHERE {
  VALUES ?name { ${names.map((n) => `"${esc(n)}"@en`).join(" ")} }
  ?item rdfs:label ?name ; wikibase:sitelinks ?links .
  OPTIONAL { ?item wdt:P1128 ?emp }
  OPTIONAL { ?item wdt:P17/wdt:P297 ?cc }
  OPTIONAL { ?item wdt:P159/wdt:P17/wdt:P297 ?hqcc }
  OPTIONAL { ?item wdt:P856 ?site }
  FILTER(BOUND(?emp) || BOUND(?site))
} GROUP BY ?name ?item ?links`;
}

type Binding = Record<string, { value: string } | undefined>;

export function parseResults(json: { results: { bindings: Binding[] } }): WikidataCandidate[] {
  return json.results.bindings.map((b) => ({
    name: b.name?.value ?? "",
    qid: (b.item?.value ?? "").replace(/^.*\//, ""),
    sitelinks: Number(b.links?.value ?? 0),
    employees: b.employees?.value ? Math.round(Number(b.employees.value)) : null,
    country: b.country?.value ?? null,
    hqCountry: b.hq?.value ?? null,
    websites: (b.sites?.value ?? "").split(" ").filter(Boolean),
  }));
}

const host = (u: string) => {
  try {
    return new URL(u).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
};

/** Pick the right item for one company: website match first, then the most notable item. */
export function chooseCandidate(cands: WikidataCandidate[], domain: string | null): WikidataCandidate | null {
  if (!cands.length) return null;
  const d = domain?.replace(/^www\./, "").toLowerCase();
  if (d) {
    const byDomain = cands.find((c) => c.websites.some((w) => {
      const h = host(w);
      return h === d || h.endsWith(`.${d}`) || d.endsWith(`.${h}`);
    }));
    if (byDomain) return byDomain;
    // Items with a different official website are other organisations of the same name.
    const noSite = cands.filter((c) => !c.websites.length);
    if (cands.every((c) => c.websites.length)) return null;
    return [...noSite].sort((a, b) => b.sitelinks - a.sitelinks)[0] ?? null;
  }
  return [...cands].sort((a, b) => b.sitelinks - a.sitelinks)[0];
}

/** Look up a batch of company names. Returns every candidate item; use chooseCandidate per company. */
export async function queryWikidata(names: string[]): Promise<WikidataCandidate[]> {
  const json = await postForm<{ results: { bindings: Binding[] } }>(ENDPOINT, { query: buildQuery(names) }, "application/sparql-results+json");
  return parseResults(json);
}
