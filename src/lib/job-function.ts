/*
 * Job function for the "Function" filter. Keyword rules on the title (and department) place most jobs;
 * the fast AI model classifies the rest in batches (see src/lib/ingest/functions.ts). Pure and tested.
 */
export const JOB_FUNCTIONS = [
  "Engineering", "Data and AI", "Product", "Design", "Sales", "Marketing", "Finance", "HR", "Operations",
  "Customer support", "Consulting", "Healthcare", "Education", "Other",
] as const;
export type JobFunction = (typeof JOB_FUNCTIONS)[number];

/** URL value for a function ("Data and AI" → "data-and-ai") and back. */
export const functionSlug = (f: string) => f.toLowerCase().replace(/[^a-z]+/g, "-").replace(/(^-|-$)/g, "");
export const functionFromSlug = (s: string): JobFunction | undefined => JOB_FUNCTIONS.find((f) => functionSlug(f) === s);

// Order matters: the first rule that matches wins. Role nouns (engineer, developer) come before
// domain words, so "Software Engineer, Banking" is Engineering and not Finance.
const RULES: [JobFunction, RegExp][] = [
  ["Healthcare", /\b(nurse|nursing|doctor|physician|surgeon|pharmacist|pharmacy|medical officer|clinic(al)? (staff|nurse)|physiotherap\w*|dentist|dental|radiolog\w*|patholog\w*|lab technician|caregiver|paramedic|medical coder|medical coding|therapist|dietitian|optometrist|anesthes\w*|ward|icu|healthcare assistant)\b/i],
  ["Education", /\b(teacher|lecturer|professor|tutor|faculty|educator|instructor|academic counsell?or|school principal|vice principal|school|curriculum|teaching assistant|trainer)\b/i],
  ["Data and AI", /\b(data (scientist|analyst|engineer|architect|analytics|science|governance|steward)|machine learning|\bml\b|ml engineer|\bai\b|artificial intelligence|deep learning|nlp|computer vision|llm|analytics engineer|bi (developer|analyst|engineer)|business intelligence|power bi|tableau|statistician|quantitative|research scientist|applied scientist|mlops|genai|generative ai|data entry analyst)\b/i],
  ["Design", /\b(designer|design lead|ux|ui\/ux|ui ux|user experience|user interface|product design|graphic|visual design|illustrator|motion design|animator|video editor|creative director|art director|interior design|fashion design)\b/i],
  ["Product", /\b(product manager|product owner|product lead|head of product|product management|vp,? product|director,? product|technical product|product analyst|product operations|program manager|project manager|scrum master|delivery manager|pmo)\b/i],
  ["Customer support", /\b(customer (support|service|care|success|experience)|support (executive|associate|specialist|agent|representative)|call cent(er|re)|contact cent(er|re)|bpo|voice process|non[- ]voice|chat support|helpdesk|help desk|service desk|client support|technical support|tech support|telecaller|customer relationship officer)\b/i],
  ["Engineering", /\b(engineer|engineering|developer|programmer|software|sde|swe|devops|sre|site reliability|architect|full[- ]?stack|front[- ]?end|back[- ]?end|android|ios developer|qa|quality assurance|tester|test (engineer|analyst|lead)|firmware|embedded|vlsi|asic|fpga|technical lead|tech lead|cto|it (support|administrator|manager)|system administrator|sysadmin|database administrator|dba|cyber ?security|information security|security (engineer|analyst|architect|operations)|soc analyst|network (engineer|administrator)|cloud (engineer|architect)|sap (consultant|abap|basis|fico|mm|sd)|java|python|\.net|php|react|node\.?js)\b/i],
  ["HR", /\b(human resources|\bhr\b|hrbp|recruit\w*|talent acquisition|talent partner|people (partner|operations|team)|sourcer|payroll specialist|learning and development|l&d|compensation|benefits|employee relations|workforce)\b/i],
  ["Sales", /\b(sales|business development|\bbd(e|m)?\b|account executive|account manager|key account|relationship manager|inside sales|pre[- ]?sales|channel (partner|manager)|territory manager|area manager|telesales|tele[- ]?sales|partnerships?|go[- ]to[- ]market|gtm|merchandiser|retail associate|store (manager|associate)|cashier|counter sales|field executive|insurance advisor|loan officer|medical representative)\b/i],
  ["Marketing", /\b(marketing|seo|sem\b|content (writer|strategist|marketing|creator|manager)|copywriter|social media|brand|communications?|public relations|\bpr\b|growth|demand gen|campaign|performance marketing|email marketing|influencer|community manager|digital marketing|events? (manager|coordinator))\b/i],
  ["Finance", /\b(financ\w*|accountant|accounts|accounting|audit\w*|tax|treasury|controller|payroll|chartered accountant|\bca\b|cfo|fp&a|billing|invoice|credit (analyst|risk|manager)|risk analyst|underwriter|investment|equity research|actuar\w*|bookkeep\w*|ledger|reconciliation|compliance officer|company secretary|banking|kyc|aml)\b/i],
  ["Consulting", /\b(consultant|consulting|advisory|advisor|strategy analyst|associate partner|engagement manager)\b/i],
  ["Operations", /\b(operations?|logistics|supply chain|procurement|purchase|purchasing|warehouse|inventory|fleet|delivery|driver|dispatch|admin(istrat(or|ive))?|office manager|executive assistant|receptionist|facilities|back office|data entry|coordinator|planner|production|plant|manufacturing|maintenance|technician|electrician|mechanic|site (supervisor|incharge)|safety officer|quality (control|inspector)|legal|lawyer|counsel|paralegal|security guard|housekeeping|chef|cook|hotel|front office)\b/i],
];

/** Department names that settle the function when the title is vague ("Associate", "Lead"). */
const DEPARTMENT_RULES: [JobFunction, RegExp][] = [
  ["Engineering", /engineering|technology|r&d|development|it\b|infrastructure|security/i],
  ["Data and AI", /data|analytics|machine learning|\bai\b/i],
  ["Product", /product/i],
  ["Design", /design|creative/i],
  ["Sales", /sales|business development|revenue|partnerships/i],
  ["Marketing", /marketing|communications|brand|growth/i],
  ["Finance", /finance|accounting|treasury|tax|audit\w*|risk|compliance/i],
  ["HR", /human resources|people|talent|recruiting|\bhr\b/i],
  ["Customer support", /customer|support|service|success|experience/i],
  ["Operations", /operations|logistics|supply chain|legal|facilities|admin|manufacturing/i],
  ["Consulting", /consulting|advisory|professional services/i],
  ["Healthcare", /clinical|medical|health|nursing/i],
  ["Education", /education|academic|teaching/i],
];

/** Function from keyword rules, or null when they can't tell (then the AI model decides). */
export function functionByRules(title: string, department?: string | null): JobFunction | null {
  for (const [fn, re] of RULES) if (re.test(title)) return fn;
  if (department) for (const [fn, re] of DEPARTMENT_RULES) if (re.test(department)) return fn;
  return null;
}
