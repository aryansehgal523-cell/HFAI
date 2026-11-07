/*
 * Who to ask at a company, for a given job. Pure and unit tested.
 *
 * Order: people in the same function as the job, then hiring managers and team leads,
 * then recruiters ("can tell you about the role"), then everyone else.
 * Alumni and recent connections get a boost within their tier.
 */

export type Fn = "engineering" | "data" | "product" | "design" | "sales" | "marketing" | "people" | "finance" | "operations" | "support" | "other";

const FUNCTION_PATTERNS: [Fn, RegExp][] = [
  ["people", /\b(recruit\w*|talent|hr|human resources|people (partner|operations)|hiring)\b/i],
  ["data", /\b(data|analytics?|analyst|machine learning|ml|ai|scientist|bi\b|business intelligence)\b/i],
  ["engineering", /\b(engineer\w*|developer|sde|swe|software|devops|sre|architect|programmer|tech(nical)? lead|qa|test(ing)?|backend|frontend|full ?stack|mobile|android|ios|cto)\b/i],
  ["product", /\b(product (manager|owner|lead|head|director)|pm\b|apm\b|product management)\b/i],
  ["design", /\b(design\w*|ux|ui\b|researcher)\b/i],
  ["sales", /\b(sales|account (executive|manager)|business development|bdr|sdr|bd\b)\b/i],
  ["marketing", /\b(marketing|growth|brand|content|seo|communications)\b/i],
  ["finance", /\b(finance|accountant|accounting|audit|tax|controller|cfo)\b/i],
  ["support", /\b(support|customer success|customer service)\b/i],
  ["operations", /\b(operations|ops\b|supply chain|logistics|program manager|project manager)\b/i],
];

export function functionOf(text: string | null | undefined): Fn {
  if (!text) return "other";
  for (const [fn, re] of FUNCTION_PATTERNS) if (re.test(text)) return fn;
  return "other";
}

export function isRecruiter(position: string | null | undefined) {
  return functionOf(position) === "people" && /\b(recruit\w*|talent|hiring)\b/i.test(position ?? "");
}

export function isLeader(position: string | null | undefined) {
  return /\b(manager|lead|head|director|vp|vice president|principal|staff|chief|cto|ceo|founder|co-?founder)\b/i.test(position ?? "");
}

export type Person = {
  id: string;
  firstName: string;
  lastName: string;
  position: string | null;
  relationship: string | null; // alumni | ex_colleague | friend | family | other | null (LinkedIn)
  connectedOn: Date | string | null;
};

export type RankedPerson<P extends Person = Person> = P & { tier: 1 | 2 | 3 | 4; reason: string; score: number };

/** Job function from its title and department ("Software Engineer, Backend" → engineering). */
export function jobFunction(title: string, department?: string | null): Fn {
  const fromTitle = functionOf(title);
  return fromTitle !== "other" ? fromTitle : functionOf(department);
}

export function rankPeople<P extends Person>(job: { title: string; department?: string | null }, people: P[], now = new Date()): RankedPerson<P>[] {
  const fn = jobFunction(job.title, job.department);
  const sameOrAdjacent = (f: Fn) => f === fn || (fn === "engineering" && f === "data") || (fn === "data" && f === "engineering");
  return people
    .map((p) => {
      const pf = functionOf(p.position);
      const recruiter = isRecruiter(p.position);
      const leader = isLeader(p.position);
      let tier: 1 | 2 | 3 | 4;
      let reason: string;
      if (!recruiter && fn !== "other" && sameOrAdjacent(pf)) {
        tier = 1;
        reason = leader ? "Leads a team in this area" : "Works in the same area as this role";
      } else if (!recruiter && leader && (sameOrAdjacent(pf) || pf === "other")) {
        tier = 2;
        reason = "Manager or team lead, may know the hiring manager";
      } else if (recruiter) {
        tier = 3;
        reason = "Recruiter, can tell you about the role";
      } else {
        tier = 4;
        reason = "Works at the company";
      }
      let score = (5 - tier) * 100;
      if (tier === 1 && leader) score += 15; // a lead in the same function is the best possible ask
      if (p.relationship === "alumni") score += 40;
      if (p.relationship === "ex_colleague") score += 35;
      if (p.relationship === "friend" || p.relationship === "family") score += 30;
      if (p.connectedOn) {
        const years = (now.getTime() - new Date(p.connectedOn).getTime()) / (365.25 * 86_400_000);
        if (years <= 1) score += 20;
        else if (years <= 3) score += 10;
      }
      return { ...p, tier, reason, score };
    })
    .sort((a, b) => b.score - a.score || `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`));
}

/** LinkedIn people search for alumni of a college at a company. We never scrape; this just opens LinkedIn. */
export function alumniSearchUrl(company: string, college: string | null | undefined) {
  const keywords = [company, college].filter(Boolean).join(" ");
  return `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(keywords)}`;
}
