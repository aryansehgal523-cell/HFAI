import { test } from "node:test";
import assert from "node:assert/strict";
import { estimateInHand, incomeTax } from "../src/lib/tax";

test("new regime: no tax up to ₹12 lakh taxable (section 87A)", () => {
  assert.equal(incomeTax(1_200_000, "new"), 0);
  assert.equal(incomeTax(400_000, "new"), 0);
});

test("new regime: marginal relief just above ₹12 lakh", () => {
  // Slab tax on 12.1L = 61,500, capped at income above 12L = 10,000, plus 4% cess.
  assert.equal(incomeTax(1_210_000, "new"), 10_400);
});

test("new regime: ₹20 lakh taxable", () => {
  // 4-8L: 20,000; 8-12L: 40,000; 12-16L: 60,000; 16-20L: 80,000 = 2,00,000 + 4% cess
  assert.equal(incomeTax(2_000_000, "new"), 208_000);
});

test("old regime: rebate up to ₹5 lakh, then slabs", () => {
  assert.equal(incomeTax(500_000, "old"), 0);
  // 2.5-5L: 12,500; 5-10L: 1,00,000 = 1,12,500 + cess
  assert.equal(incomeTax(1_000_000, "old"), 117_000);
});

test("in hand estimate adds up and is sensible", () => {
  const e = estimateInHand(1_500_000, "new");
  assert.equal(e.inHandYear, e.gross - e.employeePf - e.professionalTax - e.tax);
  assert.ok(e.inHandMonth > 95_000 && e.inHandMonth < 110_000, `${e.inHandMonth}`);
  const old = estimateInHand(1_500_000, "old");
  assert.ok(old.tax > e.tax, "with only PF as a deduction, the new regime is cheaper at 15 LPA");
});
