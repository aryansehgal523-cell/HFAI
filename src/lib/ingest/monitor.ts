/** Crawl monitoring helpers for the admin page. Pure and tested. */

export type SourceDrop = { source: string; before: number; after: number; dropPct: number };

/**
 * Sources whose open jobs fell by more than `threshold` (default 50%) between two crawls.
 * Tiny sources are ignored (a drop from 6 to 2 jobs is noise, not an outage).
 */
export function sourceDropAlerts(before: Record<string, number> | null | undefined, after: Record<string, number> | null | undefined, threshold = 0.5, minJobs = 50): SourceDrop[] {
  if (!before || !after) return [];
  const out: SourceDrop[] = [];
  for (const [source, b] of Object.entries(before)) {
    if (b < minJobs) continue;
    const a = after[source] ?? 0;
    const drop = (b - a) / b;
    if (drop > threshold) out.push({ source, before: b, after: a, dropPct: Math.round(drop * 100) });
  }
  return out.sort((x, y) => y.dropPct - x.dropPct);
}

export const SOURCE_NAME: Record<string, string> = {
  greenhouse: "Greenhouse", lever: "Lever", ashby: "Ashby", workday: "Workday", smartrecruiters: "SmartRecruiters", workable: "Workable",
  recruitee: "Recruitee", keka: "Keka", oracle: "Oracle", jsonld: "JSON-LD", adzuna: "Adzuna", jooble: "Jooble", manual: "Demo", unknown: "Unknown",
};
