/* Phase 3: company classification, name matching, Wikidata parsing and the /jobs company type filters. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyCompany, COMPANY_TYPES, FILTER_TYPES } from "../src/lib/company-type";
import { companyKey, matchingKeys, normaliseCompany } from "../src/lib/referrals/company";
import { buildQuery, chooseCandidate, parseResults, type WikidataCandidate } from "../src/lib/wikidata";
import { parseFilters } from "../src/lib/jobs-query";
import { PREF_COMPANY_TYPES, preferencesSchema } from "../src/lib/profile-fields";

// ── name normalisation ──────────────────────────────────────
test("names: legal suffixes, punctuation and descriptor words are dropped", () => {
  assert.equal(normaliseCompany("Razorpay Software Private Limited"), "razorpay");
  assert.equal(normaliseCompany("Infosys Ltd."), "infosys");
  assert.equal(normaliseCompany("Freshworks Inc"), "freshworks");
  assert.equal(normaliseCompany("Sigmoid Analytics India Pvt Ltd"), "sigmoid analytics");
  assert.equal(normaliseCompany("Acme Technologies LLP"), "acme");
  assert.equal(normaliseCompany("Globex Solutions Global"), "globex");
  assert.equal(normaliseCompany("JPMorgan Chase & Co."), "jpmorgan chase");
  assert.equal(normaliseCompany("Amazon.com"), "amazon");
});

test("names: aliases join the same company", () => {
  assert.equal(companyKey("TCS"), companyKey("Tata Consultancy Services Limited"));
  assert.equal(companyKey("AWS"), companyKey("Amazon"));
  assert.equal(companyKey("Amazon Web Services India"), companyKey("Amazon"));
  assert.equal(companyKey("Facebook"), companyKey("Meta Platforms"));
  assert.equal(companyKey("J.P. Morgan"), companyKey("JPMorgan Chase & Co"));
  assert.equal(companyKey("Walmart Global Tech India"), companyKey("Walmart"));
  assert.equal(companyKey("MBRDI"), companyKey("Mercedes-Benz"));
});

test("names: different businesses stay apart", () => {
  assert.notEqual(companyKey("Tata Motors"), companyKey("Tata Steel"));
  assert.notEqual(companyKey("Swiggy Instamart"), companyKey("Swiggy"));
  assert.notEqual(companyKey("Western Union"), companyKey("Western Digital"));
  assert.notEqual(companyKey("Tech Mahindra"), companyKey("Mahindra"));
  assert.notEqual(companyKey("American Express"), companyKey("American Airlines"));
  assert.equal(matchingKeys("Infosys", ["infosys", "infosys bpm", "infotech"]).has("infotech"), false);
});

// ── classification ──────────────────────────────────────────
test("classify: the brief's examples count as MNCs", () => {
  for (const [name, industry, hq] of [
    ["Google", "Technology", "US"], ["Microsoft", "Technology", "US"], ["Accenture", "Consulting and IT services", "IE"],
    ["Deloitte", "Consulting and audit", "GB"], ["JPMorgan Chase", "Banking", "US"], ["Infosys", "IT services", "IN"],
    ["Tata Consultancy Services", "IT services", "IN"],
  ] as const) {
    const r = classifyCompany({ name, industry, seedHq: hq, seedSize: "enterprise" });
    assert.equal(r.isMnc, true, name);
  }
  assert.equal(classifyCompany({ name: "JPMorgan Chase", industry: "Banking", seedHq: "US" }).companyType, "GCC", "a bank's India arm is a GCC");
  assert.equal(classifyCompany({ name: "Google", industry: "Technology", seedHq: "US" }).companyType, "MNC");
  assert.equal(classifyCompany({ name: "Infosys", industry: "IT services", seedHq: "IN" }).companyType, "INDIAN_LARGE");
});

test("classify: large Indian groups are INDIAN_LARGE and MNC, including group companies", () => {
  for (const n of ["Tata Motors", "Reliance Retail", "Mahindra Logistics", "Aditya Birla Capital", "HCLTech", "Wipro"]) {
    const r = classifyCompany({ name: n, seedHq: "IN" });
    assert.equal(r.companyType, "INDIAN_LARGE", n);
    assert.equal(r.isMnc, true, n);
  }
  assert.notEqual(classifyCompany({ name: "Tatami Labs", seedHq: "IN", seedSize: "small" }).companyType, "INDIAN_LARGE", "a prefix must be a whole word");
});

test("classify: unicorns, government, startups and others", () => {
  assert.deepEqual(
    [classifyCompany({ name: "Zepto", seedHq: "IN", seedSize: "large" }).companyType, classifyCompany({ name: "Zepto" }).isMnc],
    ["UNICORN", false],
  );
  assert.equal(classifyCompany({ name: "State Bank of India", seedHq: "IN", seedSize: "enterprise" }).companyType, "GOVERNMENT");
  assert.equal(classifyCompany({ name: "Linear", seedHq: "US", seedSize: "small" }).companyType, "STARTUP");
  assert.equal(classifyCompany({ name: "Tiny Indian Co", seedHq: "IN", seedSize: "mid" }).companyType, "STARTUP");
  const mid = classifyCompany({ name: "Mid Foreign Co", seedHq: "GB", seedSize: "large" });
  assert.deepEqual([mid.companyType, mid.isMnc], ["OTHER", false], "1,000 to 5,000 people is not an MNC");
});

test("classify: data rules use employees, HQ and hiring countries", () => {
  const big = classifyCompany({ name: "Some Bank AG", industry: "Banking", wikidata: { employees: 40_000, hqCountry: "DE" } });
  assert.deepEqual([big.companyType, big.isMnc, big.classifiedBy, big.employeeCount], ["GCC", true, "wikidata", 40_000]);
  const indianLocal = classifyCompany({ name: "Big Local Retail", seedHq: "IN", wikidata: { employees: 20_000 }, jobCountries: ["IN"] });
  assert.deepEqual([indianLocal.companyType, indianLocal.isMnc], ["INDIAN_LARGE", false], "large but only in India");
  const indianGlobal = classifyCompany({ name: "Big Global Pharma India", seedHq: "IN", wikidata: { employees: 20_000 }, jobCountries: ["IN", "US"] });
  assert.equal(indianGlobal.isMnc, true);
  const unknown = classifyCompany({ name: "Unknown Co" });
  assert.deepEqual([unknown.companyType, unknown.isMnc], ["OTHER", false]);
});

test("classify: an admin choice wins over every rule", () => {
  const r = classifyCompany({ name: "Google", seedHq: "US", current: { classifiedBy: "admin", companyType: "STARTUP", isMnc: false } });
  assert.deepEqual([r.companyType, r.isMnc, r.classifiedBy], ["STARTUP", false, "admin"]);
});

test("classify: type lists stay in sync with the database enum and preferences", () => {
  for (const t of FILTER_TYPES) assert.ok(COMPANY_TYPES.includes(t));
  for (const t of PREF_COMPANY_TYPES) assert.ok((COMPANY_TYPES as readonly string[]).includes(t), t);
});

// ── Wikidata ────────────────────────────────────────────────
test("wikidata: query escapes names; results parse", () => {
  const q = buildQuery(['Dr. Reddy\'s', 'Say "Hi"']);
  assert.match(q, /"Say \\"Hi\\""@en/);
  const rows = parseResults({
    results: {
      bindings: [
        { name: { value: "Stripe" }, item: { value: "http://www.wikidata.org/entity/Q7624104" }, links: { value: "40" }, employees: { value: "8000" }, country: { value: "US" }, sites: { value: "https://stripe.com/" } },
        { name: { value: "Stripe" }, item: { value: "http://www.wikidata.org/entity/Q999" }, links: { value: "3" }, employees: { value: "12" }, sites: { value: "https://stripe-band.example" } },
      ],
    },
  });
  assert.deepEqual(rows.map((r) => [r.qid, r.employees, r.sitelinks]), [["Q7624104", 8000, 40], ["Q999", 12, 3]]);
});

test("wikidata: the item whose website matches the company's domain wins", () => {
  const c = (qid: string, links: number, sites: string[]): WikidataCandidate => ({ name: "Clear", qid, sitelinks: links, employees: 100, country: "US", hqCountry: "US", websites: sites });
  const right = c("Q1", 2, ["https://www.clear.in/"]);
  const famous = c("Q2", 90, ["https://www.clearme.com/"]);
  assert.equal(chooseCandidate([famous, right], "clear.in")?.qid, "Q1");
  assert.equal(chooseCandidate([famous], "clear.in"), null, "a famous namesake with another website is not us");
  assert.equal(chooseCandidate([c("Q3", 5, []), c("Q4", 50, [])], "x.com")?.qid, "Q4", "no websites: most notable");
});

// ── filters ─────────────────────────────────────────────────
test("filters: MNC switch and company type chips come from the URL", () => {
  const f = parseFilters({ mnc: "1", ctype: "UNICORN,GCC,NOT_A_TYPE" });
  assert.equal(f.mnc, true);
  assert.deepEqual(f.ctype, ["UNICORN", "GCC"]);
  const off = parseFilters({});
  assert.equal(off.mnc, false, "off by default");
  assert.equal(off.ctype, undefined);
});

test("preferences: company type choices are validated", () => {
  assert.equal(preferencesSchema.safeParse({ mncOnly: true, companyTypes: ["UNICORN", "GCC"] }).success, true);
  assert.equal(preferencesSchema.safeParse({ companyTypes: ["NOPE"] }).success, false);
  assert.deepEqual(preferencesSchema.parse({}).companyTypes, []);
});
