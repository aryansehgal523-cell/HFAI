import { test } from "node:test";
import assert from "node:assert/strict";
import { parseAlumniCsv, parseCsv, parseLinkedInConnections, parseConnectedOn, normaliseProfileUrl, MAX_ROWS } from "../src/lib/referrals/connectionsCsv";
import { companyKey, matchingKeys, normaliseCompany, similarKeys, buildAliasMap } from "../src/lib/referrals/company";
import { alumniSearchUrl, functionOf, isRecruiter, rankPeople, jobFunction } from "../src/lib/referrals/rank";

// A realistic export: BOM, note lines before the header, CRLF, quoted commas, empty emails.
const LINKEDIN = "﻿Notes:\r\n" +
  '"When exporting your connection data, you may notice that some of the email addresses are missing. You will only see email addresses for connections who have allowed their connections to see or download their email address using this setting https://www.linkedin.com/psettings/privacy/email. You can learn more here https://www.linkedin.com/help/linkedin/answer/261"\r\n' +
  "\r\n" +
  "First Name,Last Name,URL,Email Address,Company,Position,Connected On\r\n" +
  "Ananya,Iyer,https://www.linkedin.com/in/ananya-iyer-9a1b2c,,Razorpay,Senior Software Engineer,07 Nov 2026\r\n" +
  'Rohan,Mehta,https://www.linkedin.com/in/rohanm,rohan@example.com,"Swiggy Instamart","Engineering Manager, Quick Commerce",12 Jan 2024\r\n' +
  'Kavya,"Rao, PhD",https://www.linkedin.com/in/kavya-rao/,,"Tata Consultancy Services","Talent Acquisition Lead",03 Mar 2019\r\n' +
  "Vikram,Singh,https://www.linkedin.com/in/vsingh,,,Freelancer,01 Jan 2020\r\n" + // no company: skipped
  ",,,,,,\r\n"; // trailing blank row

test("parses LinkedIn's Connections.csv with note lines, BOM, quotes and CRLF", () => {
  const r = parseLinkedInConnections(LINKEDIN);
  assert.equal(r.error, undefined);
  assert.equal(r.rows.length, 3);
  assert.equal(r.skipped, 1);
  const [a, b, c] = r.rows;
  assert.equal(a.firstName, "Ananya");
  assert.equal(a.email, null, "empty email stays null");
  assert.equal(a.profileUrl, "https://www.linkedin.com/in/ananya-iyer-9a1b2c");
  assert.equal(a.connectedOn?.toISOString().slice(0, 10), "2026-11-07");
  assert.equal(b.company, "Swiggy Instamart");
  assert.equal(b.position, "Engineering Manager, Quick Commerce", "quoted comma kept");
  assert.equal(b.email, "rohan@example.com");
  assert.equal(c.lastName, "Rao, PhD");
  assert.equal(c.profileUrl, "https://www.linkedin.com/in/kavya-rao", "trailing slash removed");
});

test("rejects files that are not the LinkedIn export", () => {
  assert.match(parseLinkedInConnections("name,company\nA,B").error ?? "", /Connections\.csv/);
});

test("handles 30,000 rows and stops beyond that", () => {
  const header = "First Name,Last Name,URL,Email Address,Company,Position,Connected On\n";
  const body = Array.from({ length: MAX_ROWS + 5 }, (_, i) => `P${i},X,https://www.linkedin.com/in/p${i},,Acme,Engineer,01 Jan 2025`).join("\n");
  const t0 = Date.now();
  const r = parseLinkedInConnections(header + body);
  assert.equal(r.rows.length, MAX_ROWS);
  assert.equal(r.truncated, true);
  assert.ok(Date.now() - t0 < 3000, "fast enough for a request");
});

test("generic CSV edge cases", () => {
  assert.deepEqual(parseCsv('a,"b ""q"" c",d\r\n1,2,3'), [["a", 'b "q" c', "d"], ["1", "2", "3"]]);
  assert.deepEqual(parseCsv('"multi\nline",x'), [["multi\nline", "x"]]);
  assert.equal(parseConnectedOn("11/7/26")?.toISOString().slice(0, 10), "2026-11-07");
  assert.equal(parseConnectedOn(""), null);
  assert.equal(normaliseProfileUrl("linkedin.com/in/Some-One?trk=x"), "https://www.linkedin.com/in/some-one");
  assert.equal(normaliseProfileUrl("not a url"), null);
});

test("alumni sheet: flexible headers and a full name column", () => {
  const r = parseAlumniCsv("Name,Company,Designation,LinkedIn,Batch\nNeha Gupta,Infosys,Data Analyst,linkedin.com/in/nehag,2021\n,NoName,,,\n");
  assert.equal(r.rows.length, 1);
  assert.equal(r.skipped, 1);
  assert.deepEqual([r.rows[0].firstName, r.rows[0].lastName, r.rows[0].position, r.rows[0].batch], ["Neha", "Gupta", "Data Analyst", "2021"]);
  assert.match(parseAlumniCsv("foo,bar\n1,2").error ?? "", /name, company/);
});

test("company normaliser strips legal and descriptor words from the end only", () => {
  assert.equal(normaliseCompany("Razorpay Software Pvt. Ltd."), "razorpay");
  assert.equal(normaliseCompany("Google India Private Limited"), "google");
  assert.equal(normaliseCompany("Tech Mahindra"), "tech mahindra");
  assert.equal(normaliseCompany("The Boston Consulting Group"), "boston consulting");
  assert.equal(normaliseCompany("Tata Consultancy Services"), "tata consultancy");
  assert.equal(normaliseCompany("Amazon (AWS)"), "amazon");
});

test("true matches", () => {
  assert.equal(companyKey("Razorpay Software"), companyKey("Razorpay"));
  assert.equal(companyKey("TCS"), companyKey("Tata Consultancy Services"));
  assert.equal(companyKey("Infosys BPM"), companyKey("Infosys"));
  assert.equal(companyKey("Amazon Web Services"), companyKey("Amazon"));
  assert.equal(companyKey("AWS"), companyKey("Amazon"));
  assert.equal(companyKey("Google India"), companyKey("Google"));
  assert.equal(companyKey("Facebook"), companyKey("Meta"));
  assert.equal(companyKey("Accenture Solutions"), companyKey("Accenture"));
  assert.ok(similarKeys("razor pay", "razorpay"));
  assert.ok(similarKeys("databricks", "databriks"), "one typo in a long name");
});

test("false matches", () => {
  assert.notEqual(companyKey("Swiggy Instamart"), companyKey("Swiggy"));
  assert.ok(!similarKeys(companyKey("Swiggy Instamart"), companyKey("Swiggy")));
  assert.ok(!similarKeys("ola", "ula"), "short names need an exact match");
  assert.ok(!similarKeys("tata steel", "tata motors"));
  assert.notEqual(companyKey("Tata Steel"), companyKey("Tata Consultancy Services"));
  assert.equal(matchingKeys("Swiggy", ["swiggy instamart", "zomato"]).size, 0);
});

test("aliases can be extended from the database", () => {
  const aliases = buildAliasMap([["Instamart", "Swiggy Instamart"]]);
  assert.equal(companyKey("Instamart", aliases), companyKey("Swiggy Instamart", aliases));
  assert.deepEqual([...matchingKeys("Razorpay", ["razorpay", "razor pay", "paytm"])], ["razorpay", "razor pay"]);
});

test("functions and recruiters", () => {
  assert.equal(functionOf("Senior Software Engineer"), "engineering");
  assert.equal(functionOf("Data Scientist"), "data");
  assert.equal(functionOf("Product Manager"), "product");
  assert.equal(functionOf("Talent Acquisition Lead"), "people");
  assert.ok(isRecruiter("Senior Technical Recruiter"));
  assert.ok(!isRecruiter("HR Business Partner"));
  assert.equal(jobFunction("Software Engineer, Backend"), "engineering");
});

test("ranks the right people first for an engineering job", () => {
  const people = [
    { id: "1", firstName: "Rita", lastName: "Sales", position: "Account Executive", relationship: null, connectedOn: null },
    { id: "2", firstName: "Tara", lastName: "Recruiter", position: "Technical Recruiter", relationship: null, connectedOn: null },
    { id: "3", firstName: "Esha", lastName: "Engineer", position: "Software Engineer II", relationship: null, connectedOn: "2019-01-01" },
    { id: "4", firstName: "Manav", lastName: "Manager", position: "Engineering Manager", relationship: null, connectedOn: null },
    { id: "5", firstName: "Alok", lastName: "Alumni", position: "Backend Developer", relationship: "alumni", connectedOn: null },
    { id: "6", firstName: "Hari", lastName: "Head", position: "Head of Operations", relationship: null, connectedOn: null },
  ];
  const ranked = rankPeople({ title: "Backend Engineer" }, people, new Date("2026-11-07"));
  // Same function first: the alumnus, then the engineering manager (same function plus a lead
  // boost), then the engineer; the recruiter comes after everyone in the function.
  assert.deepEqual(ranked.slice(0, 4).map((p) => p.firstName), ["Alok", "Manav", "Esha", "Tara"]);
  // A sales rep and a head of operations are both "everyone else" for an engineering job.
  assert.deepEqual(ranked.slice(4).map((p) => p.tier), [4, 4]);
  assert.deepEqual(new Set(ranked.slice(4).map((p) => p.firstName)), new Set(["Rita", "Hari"]));
  assert.equal(ranked.find((p) => p.firstName === "Tara")!.reason, "Recruiter, can tell you about the role");
  assert.equal(ranked[0].tier, 1);
});

test("engineering and data are adjacent: software engineers rank first for an ML job", () => {
  const people = [
    { id: "1", firstName: "Kavya", lastName: "R", position: "Talent Acquisition Lead", relationship: null, connectedOn: null },
    { id: "2", firstName: "Ananya", lastName: "I", position: "Senior Software Engineer", relationship: null, connectedOn: null },
    { id: "3", firstName: "Sameer", lastName: "K", position: "Account Executive", relationship: null, connectedOn: null },
  ];
  const ranked = rankPeople({ title: "Machine Learning Engineer" }, people);
  assert.equal(ranked[0].firstName, "Ananya");
  assert.equal(ranked[0].tier, 1);
  assert.equal(ranked[1].firstName, "Kavya");
});

test("alumni search opens LinkedIn with company and college as keywords", () => {
  assert.equal(alumniSearchUrl("Razorpay", "VIT Vellore"), "https://www.linkedin.com/search/results/people/?keywords=Razorpay%20VIT%20Vellore");
});
