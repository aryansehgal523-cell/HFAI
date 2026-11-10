import { z } from "zod";

/*
 * Fields that job application forms ask for, and the user's job preferences.
 * Shared by the server (validation) and the browser (forms), so it must not import
 * anything server only.
 */

export const NOTICE_PERIODS = ["immediate", "15", "30", "60", "90"] as const;
export const NOTICE_LABEL: Record<(typeof NOTICE_PERIODS)[number], string> = {
  immediate: "Immediate joiner",
  "15": "15 days",
  "30": "30 days",
  "60": "60 days",
  "90": "90 days",
};

export const WORK_MODES = ["REMOTE", "HYBRID", "ONSITE"] as const;
export const WORK_MODE_LABEL: Record<(typeof WORK_MODES)[number], string> = {
  REMOTE: "Remote",
  HYBRID: "Hybrid",
  ONSITE: "On site",
};

export const PREFER_NOT = "Prefer not to say";
export const GENDER_OPTIONS = [PREFER_NOT, "Woman", "Man", "Non binary", "Self describe"] as const;
export const YES_NO_PREFER = [PREFER_NOT, "Yes", "No"] as const;

const text = (max: number) => z.string().trim().max(max);
const optText = (max: number) => text(max).optional();
const lpa = z.number().min(0).max(1000).optional();
const url = z
  .string()
  .trim()
  .max(300)
  .refine((v) => v === "" || /^(https?:\/\/)?[\w-]+(\.[\w-]+)+(\/\S*)?$/i.test(v), "Enter a web address, like linkedin.com/in/you")
  .optional();

export const applicationDetailsSchema = z.object({
  phone: optText(20),
  city: optText(80),
  state: optText(80),
  pinCode: z.string().trim().regex(/^(\d{6})?$/, "PIN code is 6 digits").optional(),
  linkedinUrl: url,
  githubUrl: url,
  portfolioUrl: url,
  totalExperienceYears: z.number().min(0).max(60).optional(),
  currentCtcLpa: lpa,
  expectedCtcLpa: lpa,
  noticePeriod: z.enum(NOTICE_PERIODS).optional(),
  authorisedToWorkInIndia: z.boolean().optional(),
  needsVisaSponsorship: z.boolean().optional(),
  willingToRelocate: z.boolean().optional(),
  earliestStartDate: z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/, "Use a date").optional(),
  gender: z.enum(GENDER_OPTIONS).default(PREFER_NOT),
  disability: z.enum(YES_NO_PREFER).default(PREFER_NOT),
  veteran: z.enum(YES_NO_PREFER).default(PREFER_NOT),
});
export type ApplicationDetails = z.infer<typeof applicationDetailsSchema>;

/** Company types a user can limit matches to (same values as src/lib/company-type.ts). */
export const PREF_COMPANY_TYPES = ["INDIAN_LARGE", "UNICORN", "STARTUP", "GCC", "MNC", "GOVERNMENT"] as const;
export const PREF_COMPANY_TYPE_LABEL: Record<(typeof PREF_COMPANY_TYPES)[number], string> = {
  INDIAN_LARGE: "Indian large", UNICORN: "Unicorns", STARTUP: "Startups", GCC: "GCCs", MNC: "Global tech and consulting", GOVERNMENT: "Government",
};

export const preferencesSchema = z.object({
  targetRoles: z.array(text(80).min(1)).max(5, "Pick up to 5 roles").default([]),
  cities: z.array(text(80).min(1)).max(10).default([]),
  workModes: z.array(z.enum(WORK_MODES)).max(3).default([]),
  experienceYears: z.number().min(0).max(60).optional(),
  expectedSalaryLpa: lpa,
  noticePeriod: z.enum(NOTICE_PERIODS).optional(),
  openToRelocation: z.boolean().optional(),
  /** Only match jobs at MNCs. */
  mncOnly: z.boolean().optional(),
  /** Only match jobs at these kinds of company (empty means any). */
  companyTypes: z.array(z.enum(PREF_COMPANY_TYPES)).max(PREF_COMPANY_TYPES.length).default([]),
});
export type JobPreferences = z.infer<typeof preferencesSchema>;

export const EMPTY_DETAILS: ApplicationDetails = { gender: PREFER_NOT, disability: PREFER_NOT, veteran: PREFER_NOT };
export const EMPTY_PREFERENCES: JobPreferences = { targetRoles: [], cities: [], workModes: [], companyTypes: [] };

/** Keep everything the user already set; only fill gaps from `found`. */
export function mergeDetails(current: ApplicationDetails | null | undefined, found: Partial<ApplicationDetails>): ApplicationDetails {
  const base: ApplicationDetails = { ...EMPTY_DETAILS, ...(current ?? {}) };
  for (const [k, v] of Object.entries(found) as [keyof ApplicationDetails, unknown][]) {
    const have = base[k];
    if (v !== undefined && v !== "" && (have === undefined || have === "")) (base as Record<string, unknown>)[k] = v;
  }
  return base;
}
