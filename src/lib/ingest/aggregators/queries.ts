/*
 * What we ask the job search APIs for: role keywords crossed with Indian cities (plus "remote").
 * Keywords cover every kind of role, the way Naukri does, not just tech.
 */
import { INDIAN_CITIES } from "../geo";

export const ROLE_KEYWORDS: string[] = [
  // Software and IT
  "software engineer", "software developer", "java developer", "python developer", "full stack developer", "frontend developer",
  "backend developer", "react developer", "node js developer", "android developer", "ios developer", "mobile app developer",
  ".net developer", "php developer", "devops engineer", "cloud engineer", "site reliability engineer", "qa engineer",
  "automation tester", "manual tester", "salesforce developer", "sap consultant", "oracle developer", "network engineer",
  "system administrator", "it support", "desktop support engineer", "cyber security", "embedded engineer", "technical support",
  // Data and AI
  "data analyst", "data scientist", "data engineer", "machine learning engineer", "business analyst", "power bi developer",
  "mis executive", "ai engineer",
  // Product, design, project
  "product manager", "project manager", "program manager", "scrum master", "ui ux designer", "graphic designer",
  "video editor", "content writer", "technical writer",
  // Sales and business development
  "sales executive", "sales manager", "business development executive", "business development manager", "inside sales",
  "field sales", "area sales manager", "key account manager", "relationship manager", "telesales", "pre sales",
  "channel sales", "real estate sales", "insurance sales", "medical representative",
  // Marketing
  "digital marketing", "marketing manager", "seo executive", "social media manager", "performance marketing", "brand manager",
  "public relations", "marketing executive",
  // Finance and accounting
  "accountant", "chartered accountant", "accounts executive", "finance manager", "financial analyst", "tax consultant",
  "auditor", "accounts payable", "accounts receivable", "payroll executive", "credit analyst", "investment banking", "equity research",
  // Banking and insurance
  "bank po", "branch manager", "loan officer", "collection executive", "claims executive", "underwriter", "kyc analyst",
  // HR
  "hr executive", "hr manager", "recruiter", "talent acquisition", "hr generalist", "hr business partner",
  // Operations, admin, supply chain
  "operations executive", "operations manager", "back office", "data entry", "office administrator", "executive assistant",
  "receptionist", "supply chain", "procurement", "purchase executive", "logistics coordinator", "warehouse manager",
  "inventory controller", "store manager", "delivery executive", "driver", "fleet manager",
  // Customer support and BPO
  "customer support", "customer service", "call center", "bpo", "voice process", "non voice process", "chat support",
  "customer success manager", "international voice process",
  // Engineering and manufacturing
  "mechanical engineer", "civil engineer", "electrical engineer", "electronics engineer", "production engineer",
  "quality engineer", "maintenance engineer", "site engineer", "design engineer", "autocad", "plant manager", "safety officer",
  "chemical engineer",
  // Healthcare and pharma
  "staff nurse", "pharmacist", "doctor", "medical officer", "lab technician", "physiotherapist", "medical coder",
  "clinical research", "pharmacovigilance", "dentist",
  // Education
  "teacher", "primary teacher", "math teacher", "english teacher", "lecturer", "professor", "academic counsellor", "tutor",
  // Retail, hospitality, others
  "retail sales associate", "cashier", "hotel manager", "chef", "front office executive", "fashion designer",
  "interior designer", "architect", "legal associate", "lawyer", "company secretary", "compliance officer",
  "security guard", "electrician", "technician", "beautician",
  // Freshers and early career
  "fresher", "graduate trainee", "management trainee", "internship", "intern", "apprentice", "walk in",
];

export const AGGREGATOR_LOCATIONS: string[] = [...INDIAN_CITIES, "Remote"];

export type Query = { keyword: string; location: string };

/** Every keyword × location pair, interleaved so consecutive queries cover different cities and roles. */
export function buildQueryPlan(keywords = ROLE_KEYWORDS, locations = AGGREGATOR_LOCATIONS): Query[] {
  const plan: Query[] = [];
  // Big cities first: the first pass over the plan reaches the largest job markets early.
  for (const location of locations) for (const keyword of keywords) plan.push({ keyword, location });
  // Interleave: k-th query of each city in turn.
  const byCity = locations.map((l) => plan.filter((q) => q.location === l));
  const out: Query[] = [];
  for (let i = 0; i < keywords.length; i++) for (const city of byCity) out.push(city[i]);
  return out;
}

export const queryKey = (q: Query) => `${q.keyword}|${q.location}`.toLowerCase();
