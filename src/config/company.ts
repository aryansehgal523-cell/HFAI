/*
 * Legal entity details shown on legal pages, invoices and the footer.
 * Fill these in once the company is incorporated. Have a lawyer review the
 * legal pages before launch; they are a strong starting point, not legal advice.
 */
export const COMPANY = {
  brand: "HireFlow AI",
  legalName: process.env.NEXT_PUBLIC_COMPANY_NAME ?? "HireFlow AI Private Limited",
  cin: "[CIN to be added after incorporation]",
  gstin: "[GSTIN to be added after registration]",
  address: "[Registered office address], New Delhi, Delhi, India",
  supportEmail: "support@hireflow.ai",
  privacyEmail: "privacy@hireflow.ai",
  grievanceOfficer: {
    name: "[Grievance Officer name]",
    email: "grievance@hireflow.ai",
    hours: "Monday to Friday, 10:00 to 18:00 IST",
  },
  jurisdiction: "New Delhi, India",
  effectiveDate: "6 November 2026",
};
