import { test } from "node:test";
import assert from "node:assert/strict";
import { biggestGains, hasNumber, isWeak, keywordsForRoles, scoreResume, topTips, xyzCredit } from "../src/lib/resumeScore";
import type { ResumeData } from "../src/db/schema";

const WEAK: ResumeData = {
  name: "Rahul",
  contact: { email: "rahul@example.com" },
  experience: [{
    company: "Some Company", title: "Developer", start: "2022", end: "Present",
    bullets: ["Responsible for backend work", "Worked on the payments module", "Helped with testing", "Involved in meetings with clients"],
  }],
  projects: [], education: [], skills: [], achievements: [],
};

const STRONG: ResumeData = {
  name: "Priya Sharma",
  headline: "Backend Engineer",
  summary: "Backend engineer with 3 years building payment systems in Java, Spring Boot and Kafka for millions of users.",
  contact: { email: "priya@example.com", phone: "+91 98111 22334", location: "Bengaluru, Karnataka", links: ["linkedin.com/in/priya"] },
  experience: [
    {
      company: "Razorpay", title: "Senior Software Engineer", start: "Jan 2024", end: "Present",
      bullets: [
        "Cut settlement reconciliation time by 60% by rebuilding the batch pipeline on Kafka Streams and PostgreSQL.",
        "Scaled the refunds API to 2 million requests a day using Redis caching and connection pooling in Java.",
        "Reduced on call pages by 45% by adding Prometheus alerts and automated retries to 12 microservices.",
        "Led a migration of 8 services to Kubernetes on AWS, saving ₹18 lakh a year in infrastructure cost.",
      ],
    },
    {
      company: "Infosys", title: "Software Engineer", start: "Jul 2021", end: "Dec 2023",
      bullets: [
        "Reduced p95 latency of the accounts service from 800 ms to 220 ms by adding PostgreSQL indexes.",
        "Built a REST API in Spring Boot for 3 banking products, used by 40,000 customers every month.",
        "Automated nightly regression tests with Jenkins, cutting release time from 2 days to 4 hours.",
      ],
    },
  ],
  projects: [{
    name: "Ledger", tech: ["Go", "Docker"],
    bullets: ["Built a double entry ledger in Go handling 5,000 writes a second using Docker and PostgreSQL."],
  }],
  education: [{ school: "VIT Vellore", degree: "B.Tech Computer Science", start: "2017", end: "2021" }],
  skills: [{ group: "Backend", items: ["Java", "Spring Boot", "Kafka", "PostgreSQL", "Redis", "Docker", "Kubernetes", "AWS", "Microservices", "REST", "System design", "SQL"] }],
  achievements: [],
};

const JOB = {
  title: "Backend Engineer",
  description: "We need Java, Spring Boot, Kafka, PostgreSQL, Redis, Docker, Kubernetes and AWS experience building microservices.",
  skills: ["java", "kafka"],
};

test("a weak resume scores below 50", () => {
  const s = scoreResume(WEAK, { targetRoles: ["Backend Engineer"] });
  assert.ok(s.total < 50, `got ${s.total}`);
});

test("a strong XYZ resume scores above 80", () => {
  const s = scoreResume(STRONG, { job: JOB, experienceYears: 5 });
  assert.ok(s.total > 80, `got ${s.total}: ${JSON.stringify(s.categories.map((c) => [c.key, c.score]))}`);
});

test("weights add up to 100 and every category is within its range", () => {
  for (const r of [WEAK, STRONG]) {
    const s = scoreResume(r, { job: JOB });
    assert.equal(s.categories.reduce((a, c) => a + c.max, 0), 100);
    for (const c of s.categories) assert.ok(c.score >= 0 && c.score <= c.max, `${c.key} ${c.score}`);
  }
});

test("deterministic: same input, same output", () => {
  assert.deepEqual(scoreResume(STRONG, { job: JOB }), scoreResume(structuredClone(STRONG), { job: JOB }));
});

test("adding a number to a bullet raises the score immediately", () => {
  const before = scoreResume(WEAK);
  const edited = structuredClone(WEAK);
  edited.experience[0].bullets[1] = "Built the payments module handling 30,000 orders a day using Node.js and Redis.";
  const after = scoreResume(edited);
  assert.ok(after.total > before.total, `${before.total} -> ${after.total}`);
  assert.ok(biggestGains(before, after).length > 0);
});

test("tips are specific and point at the actual bullet", () => {
  const s = scoreResume(WEAK, { targetRoles: ["Backend Engineer"] });
  const impact = s.categories.find((c) => c.key === "impact")!;
  assert.match(impact.tips[0], /4 of your 4 bullets have no number/);
  assert.match(impact.tips[0], /“Responsible for backend work”/);
  const lang = s.categories.find((c) => c.key === "language")!;
  assert.match(lang.tips[0], /start with “responsible for”/);
  const complete = s.categories.find((c) => c.key === "completeness")!;
  assert.match(complete.tips[0], /your phone number/);
  assert.equal(topTips(s).length, 3);
});

test("keyword match uses the job, then target roles, then a fallback", () => {
  const withJob = scoreResume(STRONG, { job: JOB }).categories[0];
  assert.equal(withJob.score, 30);
  const noJob = scoreResume(WEAK, { targetRoles: ["Data Analyst"] }).categories[0];
  assert.ok(noJob.score < 10);
  assert.match(noJob.tips[0], /Data Analyst/);
  const fallback = scoreResume(WEAK).categories[0];
  assert.match(fallback.tips[0], /job preferences/);
});

test("alternatives count once: a Java backend developer is not marked down for lacking Go or Node.js", () => {
  const javaOnly = structuredClone(STRONG); // Java, Spring Boot, Kafka... no Python, Go or Node.js
  const kw = scoreResume(javaOnly, { targetRoles: ["Backend Engineer"] }).categories[0];
  assert.equal(kw.score, 30, JSON.stringify(kw.tips));
});

test("role keywords cover common Indian job titles", () => {
  assert.ok(keywordsForRoles(["Backend Engineer"]).includes("kafka"));
  assert.ok(keywordsForRoles(["Data Analyst"]).includes("sql"));
  assert.ok(keywordsForRoles(["ML Engineer"]).includes("pytorch"));
  assert.deepEqual(keywordsForRoles([]), []);
});

test("bullet helpers", () => {
  assert.ok(hasNumber("Cut costs by 30%"));
  assert.ok(hasNumber("Saved ₹2 lakh"));
  assert.ok(hasNumber("Served 40,000 users"));
  assert.ok(!hasNumber("Built the onboarding flow"));
  assert.ok(isWeak("Responsible for the API"));
  assert.ok(isWeak("• helped with deployments"));
  assert.ok(!isWeak("Led the API redesign"));
  assert.equal(xyzCredit("Reduced latency by 40% by caching queries in Redis"), 1);
  assert.equal(xyzCredit("Reduced latency by 40%"), 0.5);
  assert.equal(xyzCredit("Worked on latency"), 0);
});

test("ATS safety flags mixed date styles and symbols", () => {
  const r = structuredClone(STRONG);
  r.experience[1].start = "07/2021";
  r.experience[0].bullets[0] = "★ Cut reconciliation time by 60% using Kafka";
  const ats = scoreResume(r).categories.find((c) => c.key === "ats")!;
  assert.ok(ats.score < 5);
  assert.equal(ats.tips.length, 2);
});

test("empty resume does not crash and scores low", () => {
  const s = scoreResume({ experience: [], projects: [], education: [], skills: [], achievements: [] });
  assert.ok(s.total < 15, `got ${s.total}`);
});
