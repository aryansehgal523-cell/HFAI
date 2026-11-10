/* Phase 4: job function rules and URL values. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { JOB_FUNCTIONS, functionByRules, functionFromSlug, functionSlug } from "../src/lib/job-function";

const cases: [string, string | null, string | null][] = [
  ["Senior Software Engineer, Payments", null, "Engineering"],
  ["Software Engineer - Banking Platforms", null, "Engineering"],
  ["SDE II (Backend)", null, "Engineering"],
  ["QA Automation Tester", null, "Engineering"],
  ["Data Scientist", null, "Data and AI"],
  ["Machine Learning Engineer", null, "Data and AI"],
  ["Power BI Developer", null, "Data and AI"],
  ["Product Manager, Growth", null, "Product"],
  ["Senior UX Designer", null, "Design"],
  ["Inside Sales Executive", null, "Sales"],
  ["Business Development Manager", null, "Sales"],
  ["Telesales Executive (Fresher)", null, "Sales"],
  ["Digital Marketing Executive", null, "Marketing"],
  ["SEO Specialist", null, "Marketing"],
  ["Accountant", null, "Finance"],
  ["Chartered Accountant - Tax", null, "Finance"],
  ["Talent Acquisition Partner", null, "HR"],
  ["HR Generalist", null, "HR"],
  ["Customer Support Executive - Voice Process", null, "Customer support"],
  ["International BPO Chat Support", null, "Customer support"],
  ["Warehouse Supervisor", null, "Operations"],
  ["Security Guard", null, "Operations"],
  ["Delivery Executive", null, "Operations"],
  ["Staff Nurse - ICU", null, "Healthcare"],
  ["Pharmacist", null, "Healthcare"],
  ["Primary Teacher (CBSE)", null, "Education"],
  ["Management Consultant", null, "Consulting"],
  ["Associate", "Finance & Accounting", "Finance"],
  ["Lead", "Engineering", "Engineering"],
  ["Associate", null, null],
];

test("function rules place common titles correctly", () => {
  for (const [title, dept, expected] of cases) assert.equal(functionByRules(title, dept), expected, `${title} (${dept ?? "no department"})`);
});

test("every function round-trips through its URL value", () => {
  for (const f of JOB_FUNCTIONS) assert.equal(functionFromSlug(functionSlug(f)), f);
  assert.equal(functionSlug("Data and AI"), "data-and-ai");
  assert.equal(functionFromSlug("not-a-function"), undefined);
});

test("function rules: seniority words and word stems", () => {
  assert.equal(functionByRules("Principal Software Engineer, Engine Tools"), "Engineering");
  assert.equal(functionByRules("Principal Product Designer"), "Design");
  assert.equal(functionByRules("Strategic Finance Manager, Operations"), "Finance");
  assert.equal(functionByRules("Finance Manager, Revenue Accounting"), "Finance");
  assert.equal(functionByRules("Recruiting Sourcer, Business (GTM)"), "HR");
  assert.equal(functionByRules("Security Operations Analyst"), "Engineering");
  assert.equal(functionByRules("Internal Auditor"), "Finance");
  assert.equal(functionByRules("Vice Principal (CBSE school)"), "Education");
});
