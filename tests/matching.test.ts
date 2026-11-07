import { test } from "node:test";
import assert from "node:assert/strict";
import { jobSalaryLpa, matchJob, type MatchJob, type MatchProfile } from "../src/lib/matching";

const NOW = new Date("2026-11-07T00:00:00Z");
const resume = {
  headline: "Backend Engineer",
  experience: [{ company: "Razorpay", title: "Software Engineer", bullets: ["Built payment APIs in Java and Spring Boot on Kafka, PostgreSQL and Redis, deployed with Docker on AWS."] }],
  projects: [], education: [], skills: [{ group: "Skills", items: ["Java", "Spring Boot", "Kafka", "PostgreSQL", "Redis", "Docker", "AWS"] }], achievements: [],
};
const profile: MatchProfile = { resume, years: 3, targetRoles: ["Backend Engineer"], cities: ["Bengaluru"], workModes: ["HYBRID", "REMOTE"], expectedSalaryLpa: 25 };

const job = (o: Partial<MatchJob> = {}): MatchJob => ({
  title: "Senior Backend Engineer", description: "Java, Spring Boot, Kafka, PostgreSQL, Redis, Docker, Kubernetes, AWS.",
  skills: ["java", "kafka"], location: "Bengaluru, India", workMode: "HYBRID", experienceMin: 3, experienceMax: 5,
  salaryMin: 2_500_000, salaryMax: 3_200_000, salaryCurrency: "INR", salaryPeriod: "YEAR", postedAt: "2026-11-05T00:00:00Z", ...o,
});

test("a well matched job scores high with accurate reasons", () => {
  const m = matchJob(profile, job(), NOW);
  assert.ok(m.score >= 85, `${m.score} ${JSON.stringify(m.parts)}`);
  assert.ok(m.reasons.includes("Matches 7 of 8 skills"), m.reasons.join(" | "));
  assert.ok(m.reasons.includes("Hybrid in Bengaluru, as you prefer"));
  assert.ok(m.reasons.includes("Asks for 3 to 5 years, you have 3 years"));
  assert.deepEqual(m.missing, ["Kubernetes"]);
});

test("too little experience is called out", () => {
  const m = matchJob({ ...profile, years: 1 }, job(), NOW);
  assert.ok(m.reasons.includes("Asks for 3 to 5 years, you have 1 year"));
  assert.ok(m.parts.experience < 5);
});

test("a different role in another city scores low", () => {
  const m = matchJob(profile, job({ title: "Account Executive", description: "B2B sales, CRM, Salesforce.", skills: ["sales", "crm"], location: "Mumbai", workMode: "ONSITE", experienceMin: null }), NOW);
  assert.ok(m.score < 40, `${m.score} ${JSON.stringify(m.parts)}`);
  assert.ok(m.reasons.some((r) => r.includes("outside your cities")));
  assert.ok(m.reasons.includes("Different from the roles you want"));
});

test("salary fit uses INR LPA and handles monthly pay", () => {
  assert.equal(jobSalaryLpa({ salaryMin: null, salaryMax: 200_000, salaryCurrency: "INR", salaryPeriod: "MONTH" }), 24);
  assert.equal(jobSalaryLpa({ salaryMin: 100_000, salaryMax: 150_000, salaryCurrency: "USD", salaryPeriod: "YEAR" }), null);
  const low = matchJob(profile, job({ salaryMin: 1_000_000, salaryMax: 1_200_000 }), NOW);
  assert.ok(low.reasons.includes("Pays up to 12 LPA, below your 25 LPA"));
});

test("works without preferences or salary data, and is deterministic", () => {
  const bare = matchJob({ resume }, job({ salaryMin: null, salaryMax: null }), NOW);
  assert.ok(bare.score > 50 && bare.score <= 100);
  assert.deepEqual(matchJob(profile, job(), NOW), matchJob(structuredClone(profile), job(), NOW));
});

test("remote jobs satisfy any city; Bangalore and Bengaluru are the same place", () => {
  assert.ok(matchJob(profile, job({ workMode: "REMOTE", location: "Remote, India" }), NOW).reasons.includes("Remote, as you prefer"));
  assert.ok(matchJob({ ...profile, cities: ["Bangalore"] }, job(), NOW).reasons.includes("Hybrid in Bengaluru, as you prefer"));
});
