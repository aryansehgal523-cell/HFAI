import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PLANS, PREMIUM_FEATURES, perApplicationRupees, rupees, splitGst, yearlyMonthlyEquivalentRupees, yearlySavingsPercent,
} from "../src/lib/plans";

test("premium prices are ₹999 a month and ₹7,999 a year", () => {
  assert.equal(PLANS.monthly.price, 99900);
  assert.equal(PLANS.yearly.price, 799900);
  assert.equal(rupees(PLANS.monthly.price), "₹999");
  assert.equal(rupees(PLANS.yearly.price), "₹7,999");
});

test("credits and top up are unchanged", () => {
  assert.equal(PLANS.monthly.monthlyCredits, 30);
  assert.equal(PLANS.yearly.monthlyCredits, 30);
  assert.equal(PLANS.topup.credits, 10);
  assert.equal(rupees(PLANS.topup.price), "₹199");
});

test("derived figures match the maths", () => {
  assert.equal(perApplicationRupees(), 33); // 999 / 30 = 33.3
  assert.equal(yearlyMonthlyEquivalentRupees(), 667); // 7999 / 12 = 666.6
  assert.equal(yearlySavingsPercent(), 33); // 1 - 7999 / 11988 = 33.27%
});

test("savings label never overstates the discount", () => {
  const exact = (1 - PLANS.yearly.price / (PLANS.monthly.price * 12)) * 100;
  assert.ok(yearlySavingsPercent() <= exact);
});

test("GST split adds back up to the inclusive price", () => {
  const { base, gst } = splitGst(PLANS.monthly.price);
  assert.equal(base + gst, PLANS.monthly.price);
  assert.equal(base, 84661); // ₹846.61 + 18% ≈ ₹999
});

test("premium feature list names every new feature", () => {
  const all = PREMIUM_FEATURES.join(" ").toLowerCase();
  for (const f of ["referral", "resume score", "autofill", "matching", "coach"]) assert.ok(all.includes(f), f);
});
