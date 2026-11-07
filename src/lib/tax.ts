/*
 * CTC to in-hand ESTIMATE for salaried employees in India, under the new and old tax regimes.
 * Pure and unit tested. Every assumption lives in TAX_CONFIG so it can be updated after each
 * Budget. VERIFY THE SLABS BEFORE LAUNCH: these are the FY 2025-26 rules (Budget 2025).
 */

export const TAX_CONFIG = {
  financialYear: "FY 2025-26",
  basicShareOfCtc: 0.4, // basic salary as a share of CTC (varies by employer: 35% to 50%)
  pfRate: 0.12, // employee and employer PF, each, on basic
  pfWageCeiling: null as number | null, // some employers cap PF at ₹15,000 a month of basic; null = no cap
  gratuityRate: 0.0481, // employer gratuity provision on basic, usually inside CTC
  professionalTax: 2500, // per year; varies by state (nil in some)
  cess: 0.04,
  newRegime: {
    standardDeduction: 75_000,
    slabs: [[400_000, 0], [800_000, 0.05], [1_200_000, 0.1], [1_600_000, 0.15], [2_000_000, 0.2], [2_400_000, 0.25], [Infinity, 0.3]] as [number, number][],
    rebateLimit: 1_200_000, // section 87A: no tax up to this taxable income, with marginal relief above it
    surcharge: [[5_000_000, 0], [10_000_000, 0.1], [20_000_000, 0.15], [Infinity, 0.25]] as [number, number][],
  },
  oldRegime: {
    standardDeduction: 50_000,
    slabs: [[250_000, 0], [500_000, 0.05], [1_000_000, 0.2], [Infinity, 0.3]] as [number, number][],
    rebateLimit: 500_000,
    section80cLimit: 150_000,
    surcharge: [[5_000_000, 0], [10_000_000, 0.1], [20_000_000, 0.15], [50_000_000, 0.25], [Infinity, 0.37]] as [number, number][],
  },
};

function slabTax(income: number, slabs: [number, number][]) {
  let tax = 0;
  let prev = 0;
  for (const [upto, rate] of slabs) {
    if (income <= prev) break;
    tax += (Math.min(income, upto) - prev) * rate;
    prev = upto;
  }
  return tax;
}

function surchargeRate(income: number, table: [number, number][]) {
  for (const [upto, rate] of table) if (income <= upto) return rate;
  return 0;
}

export function incomeTax(taxable: number, regime: "new" | "old") {
  const r = regime === "new" ? TAX_CONFIG.newRegime : TAX_CONFIG.oldRegime;
  let tax = slabTax(taxable, r.slabs);
  if (taxable <= r.rebateLimit) tax = 0;
  else if (regime === "new") tax = Math.min(tax, taxable - r.rebateLimit); // marginal relief just above the rebate limit
  tax += tax * surchargeRate(taxable, r.surcharge);
  return Math.round(tax * (1 + TAX_CONFIG.cess));
}

export type InHandEstimate = {
  ctc: number;
  regime: "new" | "old";
  gross: number;
  employeePf: number;
  professionalTax: number;
  tax: number;
  inHandYear: number;
  inHandMonth: number;
};

/** Estimate yearly and monthly in hand pay from CTC (in rupees). Old regime assumes only PF under 80C. */
export function estimateInHand(ctc: number, regime: "new" | "old", extra80c = 0): InHandEstimate {
  const c = TAX_CONFIG;
  const basic = ctc * c.basicShareOfCtc;
  const pfBase = c.pfWageCeiling ? Math.min(basic, c.pfWageCeiling * 12) : basic;
  const employerPf = pfBase * c.pfRate;
  const gratuity = basic * c.gratuityRate;
  const gross = ctc - employerPf - gratuity;
  const employeePf = pfBase * c.pfRate;
  const r = regime === "new" ? c.newRegime : c.oldRegime;
  let taxable = gross - r.standardDeduction - c.professionalTax * (regime === "old" ? 1 : 0);
  if (regime === "old") taxable -= Math.min(c.oldRegime.section80cLimit, employeePf + extra80c);
  const tax = incomeTax(Math.max(0, taxable), regime);
  const inHandYear = gross - employeePf - c.professionalTax - tax;
  const round = (n: number) => Math.round(n);
  return { ctc, regime, gross: round(gross), employeePf: round(employeePf), professionalTax: c.professionalTax, tax, inHandYear: round(inHandYear), inHandMonth: round(inHandYear / 12) };
}

export const ESTIMATE_NOTE = `Estimate only, using ${TAX_CONFIG.financialYear} slabs, basic at ${TAX_CONFIG.basicShareOfCtc * 100}% of CTC, 12% PF, gratuity and professional tax inside CTC. Your offer letter's salary breakup, HRA, bonuses and deductions change the real number.`;
