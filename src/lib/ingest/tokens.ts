import type { AtsConfig } from "./types";

export const FEEDS = ["GREENHOUSE", "LEVER", "ASHBY", "WORKDAY", "SMARTRECRUITERS", "WORKABLE", "RECRUITEE", "KEKA", "ORACLE", "JSONLD"] as const;
export type Feed = (typeof FEEDS)[number];

/** Turn what the admin typed into a token and per source settings. */
export function parseToken(ats: Feed, raw: string): { token: string; config: AtsConfig } | null {
  const t = raw.trim().replace(/^https?:\/\//, "").replace(/\/+$/, "");
  if (ats === "WORKDAY") {
    // "nvidia.wd5/NVIDIAExternalCareerSite" or a pasted URL "nvidia.wd5.myworkdayjobs.com/en-US/NVIDIAExternalCareerSite"
    const m = t.match(/^([a-z0-9_-]+)\.(wd\d+)(?:\.myworkdayjobs\.com)?\/(?:[a-z]{2}-[A-Z]{2}\/)?([A-Za-z0-9_-]+)/i);
    return m ? { token: m[1].toLowerCase(), config: { dc: m[2].toLowerCase(), sites: [m[3]] } } : null;
  }
  if (ats === "ORACLE") {
    // "fa-xxxx-saasfaprod1.fa.ocs.oraclecloud.com/CX_1" or a pasted career site URL ".../hcmUI/CandidateExperience/en/sites/CX_1/jobs"
    const m = t.match(/^([a-z0-9.-]+\.[a-z]{2,})(?:\/hcmUI\/CandidateExperience\/[a-z-]+\/sites)?\/([A-Za-z0-9_]+)/i);
    return m ? { token: m[1].toLowerCase(), config: { sites: [m[2]] } } : null;
  }
  if (ats === "JSONLD") return /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(t) ? { token: t.toLowerCase(), config: {} } : null;
  return /^[a-zA-Z0-9_.-]+$/.test(t) ? { token: ats === "SMARTRECRUITERS" ? t : t.toLowerCase(), config: {} } : null;
}

