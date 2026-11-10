/*
 * Company classification for the "MNCs only" switch and the company type chips on /jobs. Pure and tested.
 *
 * Order of evidence:
 *   1. An admin choice in /admin (classifiedBy "admin") wins over everything.
 *   2. Curated lists (src/config): government owned companies, large Indian groups (INDIAN_LARGE and MNC),
 *      Indian unicorns, and large global companies (src/config/mncList.json).
 *   3. Data: employee count and headquarters country from Wikidata or our seed list, plus the countries
 *      we see the company hiring in. An MNC has at least 5,000 employees and operates in several countries.
 * Foreign MNCs whose India teams are captive centres (banks, insurers, retailers, manufacturers...) are
 * typed GCC; technology and consulting firms are typed MNC. Both count as MNCs.
 */
import lists from "@/config/companyLists.json";
import mncList from "@/config/mncList.json";
import { companyKey } from "@/lib/referrals/company";

export const COMPANY_TYPES = ["MNC", "INDIAN_LARGE", "UNICORN", "STARTUP", "GCC", "GOVERNMENT", "OTHER"] as const;
export type CompanyType = (typeof COMPANY_TYPES)[number];

export const COMPANY_TYPE_LABEL: Record<CompanyType, string> = {
  MNC: "MNC", INDIAN_LARGE: "Indian large company", UNICORN: "Unicorn", STARTUP: "Startup", GCC: "GCC", GOVERNMENT: "Government", OTHER: "Other",
};

export type Classification = { companyType: CompanyType; isMnc: boolean; employeeCount: number | null; hqCountry: string | null; classifiedBy: "seed" | "wikidata" | "rule" | "admin" };

export type ClassifyInput = {
  name: string;
  industry?: string | null;
  /** From src/config/companySeeds.json: enterprise 10k+, large 1k to 10k, mid 200 to 1k, small under 200. */
  seedSize?: string | null;
  seedHq?: string | null;
  wikidata?: { employees?: number | null; hqCountry?: string | null } | null;
  /** Countries of the company's open jobs. */
  jobCountries?: string[];
  current?: (Omit<Partial<Classification>, "classifiedBy"> & { classifiedBy?: string | null }) | null;
};

const SIZE_EMPLOYEES: Record<string, number> = { enterprise: 10_000, large: 3_000, mid: 500, small: 100 };
export const MNC_MIN_EMPLOYEES = 5_000;

/** Industries whose foreign companies run captive centres (GCCs) in India rather than selling tech or consulting. */
const GCC_INDUSTRY = /bank|insur|financ|asset|wealth|payment|retail|grocery|apparel|fmcg|consumer|beverage|food|pharma|biotech|life science|health|medical|diagnost|automotive|industrial|manufactur|energy|oil|gas|power|aerospace|defence|logistic|shipping|aviation|airline|hospitality|hotel|chemical|paint|steel|metal|mining|agri|building|conglomerate|telecom|media|entertainment|real estate|data and analytics|information services|credit|reinsurance|trading/i;

const key = (s: string) => companyKey(s);
const GOV = new Set(lists.government.names.map(key));
const UNICORNS = new Set(lists.indianUnicorns.names.map(key));
const INDIAN_GROUP_PREFIXES = lists.indianLargeGroups.prefixes.map(key).filter(Boolean);
const MNC_NAMES = new Set(mncList.companies.map(key));

/** "tata motors" matches the "tata" group; "tata" alone matches too; "tatami" does not. */
function inGroup(k: string, prefixes: string[]) {
  return prefixes.some((p) => k === p || k.startsWith(`${p} `));
}

export function classifyCompany(input: ClassifyInput): Classification {
  if (input.current?.classifiedBy === "admin" && input.current.companyType) {
    return {
      companyType: input.current.companyType as CompanyType,
      isMnc: Boolean(input.current.isMnc),
      employeeCount: input.current.employeeCount ?? null,
      hqCountry: input.current.hqCountry ?? null,
      classifiedBy: "admin",
    };
  }
  const k = key(input.name);
  const wdEmployees = input.wikidata?.employees ?? null;
  const employees = wdEmployees ?? (input.seedSize ? SIZE_EMPLOYEES[input.seedSize] ?? null : null);
  const hq = (input.seedHq ?? input.wikidata?.hqCountry ?? null)?.toUpperCase() ?? null;
  const fromData: Classification["classifiedBy"] = wdEmployees !== null ? "wikidata" : input.seedSize || input.seedHq ? "seed" : "rule";
  const foreignType: CompanyType = GCC_INDUSTRY.test(input.industry ?? "") ? "GCC" : "MNC";

  if (GOV.has(k)) return { companyType: "GOVERNMENT", isMnc: false, employeeCount: employees, hqCountry: hq ?? "IN", classifiedBy: "rule" };
  if (inGroup(k, INDIAN_GROUP_PREFIXES)) return { companyType: "INDIAN_LARGE", isMnc: true, employeeCount: employees, hqCountry: hq ?? "IN", classifiedBy: "rule" };
  if (UNICORNS.has(k)) return { companyType: "UNICORN", isMnc: false, employeeCount: employees, hqCountry: hq ?? "IN", classifiedBy: "rule" };
  if (MNC_NAMES.has(k)) {
    if (hq === "IN") return { companyType: "INDIAN_LARGE", isMnc: true, employeeCount: employees, hqCountry: hq, classifiedBy: "rule" };
    return { companyType: foreignType, isMnc: true, employeeCount: employees, hqCountry: hq, classifiedBy: "rule" };
  }

  // Data rules.
  const countries = new Set((input.jobCountries ?? []).filter(Boolean));
  if (hq) countries.add(hq);
  const severalCountries = countries.size >= 2;
  if (hq && hq !== "IN") {
    if (employees !== null && employees >= MNC_MIN_EMPLOYEES) {
      // A large foreign company is multinational by definition here: home country plus India.
      return { companyType: foreignType, isMnc: true, employeeCount: employees, hqCountry: hq, classifiedBy: fromData };
    }
    if (employees !== null && employees < 1_000) return { companyType: "STARTUP", isMnc: false, employeeCount: employees, hqCountry: hq, classifiedBy: fromData };
    return { companyType: "OTHER", isMnc: false, employeeCount: employees, hqCountry: hq, classifiedBy: fromData };
  }
  if (hq === "IN") {
    if (employees !== null && employees >= 10_000) {
      return { companyType: "INDIAN_LARGE", isMnc: severalCountries && employees >= MNC_MIN_EMPLOYEES, employeeCount: employees, hqCountry: hq, classifiedBy: fromData };
    }
    if (employees !== null && employees < 1_000) return { companyType: "STARTUP", isMnc: false, employeeCount: employees, hqCountry: hq, classifiedBy: fromData };
    return { companyType: "OTHER", isMnc: false, employeeCount: employees, hqCountry: hq, classifiedBy: fromData };
  }
  // Nothing known about headquarters: only a large, clearly multinational company counts.
  if (employees !== null && employees >= MNC_MIN_EMPLOYEES && severalCountries) {
    return { companyType: foreignType, isMnc: true, employeeCount: employees, hqCountry: null, classifiedBy: fromData };
  }
  return { companyType: "OTHER", isMnc: false, employeeCount: employees, hqCountry: null, classifiedBy: fromData };
}

/** Company types shown as chips on /jobs, in order. */
export const FILTER_TYPES: CompanyType[] = ["INDIAN_LARGE", "UNICORN", "STARTUP", "GCC"];
