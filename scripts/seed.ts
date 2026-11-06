/*
 * Seeds the database:
 *  1. The real crawl list from src/config/companies.ts (jobs arrive via `npm run crawl`).
 *  2. Demo companies and jobs (fictional, ats MANUAL) so the site looks alive in development.
 *     Pass --no-demo to skip them, or remove them later from /admin.
 */
import "dotenv/config";
import { eq } from "drizzle-orm";
import { db } from "../src/db";
import { companies, jobs } from "../src/db/schema";
import { CRAWL_COMPANIES } from "../src/config/companies";
import { normalize } from "../src/lib/ingest/normalize";
import { refreshGhostScores } from "../src/lib/ingest/run";
import { slugify } from "../src/lib/utils";

const DEMO_COMPANIES = [
  { name: "Northwind Labs", industry: "AI infrastructure", hq: "Bengaluru" },
  { name: "Kestrel Pay", industry: "Fintech", hq: "Mumbai" },
  { name: "Tiffin Cloud", industry: "Food delivery", hq: "Gurugram" },
  { name: "Banyan Health", industry: "Healthtech", hq: "Hyderabad" },
  { name: "Monsoon Analytics", industry: "Data and analytics", hq: "Pune" },
  { name: "Saffron Systems", industry: "Enterprise SaaS", hq: "Noida" },
  { name: "Orbit Learn", industry: "Edtech", hq: "Delhi" },
  { name: "Kite Mobility", industry: "Mobility", hq: "Chennai" },
];

const ROLES = [
  { title: "AI Engineer, LLM Applications", skills: "Python, LangChain, RAG, FastAPI, AWS", exp: "1 to 3 years", dept: "Engineering" },
  { title: "Machine Learning Engineer", skills: "Python, PyTorch, MLOps, Docker, Kubernetes", exp: "2 to 5 years", dept: "Engineering" },
  { title: "Software Engineer, Backend", skills: "Java, Spring Boot, PostgreSQL, Kafka, microservices", exp: "1 to 3 years", dept: "Engineering" },
  { title: "Full Stack Developer", skills: "TypeScript, React, Next.js, Node.js, PostgreSQL", exp: "0 to 2 years", dept: "Engineering" },
  { title: "Data Scientist", skills: "Python, SQL, machine learning, statistics, A/B testing", exp: "2 to 4 years", dept: "Data" },
  { title: "Data Engineer", skills: "Spark, PySpark, Airflow, Snowflake, SQL, dbt", exp: "3 to 6 years", dept: "Data" },
  { title: "Product Analyst", skills: "SQL, Excel, Tableau, A/B testing, communication", exp: "0 to 2 years", dept: "Product" },
  { title: "Associate Product Manager", skills: "product management, SQL, Figma, agile, stakeholder management", exp: "0 to 2 years", dept: "Product" },
  { title: "DevOps Engineer", skills: "AWS, Terraform, Kubernetes, CI/CD, Linux", exp: "2 to 5 years", dept: "Infrastructure" },
  { title: "Business Development Associate", skills: "sales, CRM, communication, Salesforce", exp: "0 to 2 years", dept: "Sales" },
  { title: "Frontend Engineer", skills: "TypeScript, React, Tailwind, GraphQL", exp: "1 to 4 years", dept: "Engineering" },
  { title: "GenAI Solutions Engineer", skills: "Python, LLM, RAG, GCP, Azure, prompt engineering", exp: "1 to 3 years", dept: "Solutions" },
];

const MODES = ["ONSITE", "HYBRID", "REMOTE"] as const;

function description(company: string, industry: string, role: (typeof ROLES)[number], city: string) {
  return `About ${company}
${company} builds ${industry.toLowerCase()} products used by millions of people across India. We are a team of 300 people with offices in ${city} and a remote friendly culture.

About the role
As our ${role.title}, you will own features end to end, from design to production, and work closely with product and design. You will ship weekly, measure impact, and improve what you build.

What you will do
• Design, build and maintain production systems used by real customers
• Work with ${role.skills}
• Write clean, tested code and review the work of teammates
• Track the metrics that matter and improve them every quarter

What we are looking for
• ${role.exp} of relevant experience (freshers with strong projects are welcome for junior roles)
• Hands on experience with ${role.skills}
• Clear written and spoken communication
• A bias for action and ownership

Benefits
• Health insurance for you and your family
• Learning budget of ₹50,000 per year
• Flexible hours and a hybrid work policy`;
}

async function main() {
  const withDemo = !process.argv.includes("--no-demo");
  if (process.argv.includes("--if-empty")) {
    const existing = await db.select({ id: companies.id }).from(companies).limit(1);
    if (existing.length) {
      console.log("Database already has data, skipping seed");
      process.exit(0);
    }
  }

  for (const c of CRAWL_COMPANIES) {
    await db
      .insert(companies)
      .values({ name: c.name, slug: slugify(c.name), ats: c.ats, atsToken: c.token, industry: c.industry, hq: c.hq, website: c.website })
      .onConflictDoNothing();
  }
  console.log(`Crawl list: ${CRAWL_COMPANIES.length} companies`);

  if (withDemo) {
    let n = 0;
    for (const [ci, c] of DEMO_COMPANIES.entries()) {
      const slug = slugify(c.name);
      await db
        .insert(companies)
        .values({ name: c.name, slug, ats: "MANUAL", atsToken: slug, industry: c.industry, hq: c.hq })
        .onConflictDoNothing();
      const [company] = await db.select().from(companies).where(eq(companies.slug, slug));
      const roles = ROLES.filter((_, i) => (i + ci) % 2 === 0).slice(0, 6);
      for (const [ri, role] of roles.entries()) {
        const mode = MODES[(ci + ri) % 3];
        const city = mode === "REMOTE" ? "Remote, India" : `${c.hq}, India`;
        const lpaLow = 6 + ((ci * 3 + ri * 2) % 14);
        const withPay = (ci + ri) % 3 !== 0;
        const daysAgo = (ci * 5 + ri * 3) % 20;
        const row = normalize(company.id, {
          externalId: `demo-${slug}-${ri}`,
          title: role.title,
          location: city,
          workMode: mode,
          department: role.dept,
          employment: "Full time",
          descriptionText:
            description(c.name, c.industry, role, c.hq) + (withPay ? `\n\nCompensation: ₹${lpaLow} to ${lpaLow + 8} LPA` : ""),
          applyUrl: `https://example.com/careers/${slug}/${ri}`,
          postedAt: new Date(Date.now() - daysAgo * 86_400_000 - ri * 3_600_000),
        });
        await db.insert(jobs).values(row).onConflictDoNothing();
        n++;
      }
    }
    console.log(`Demo data: ${DEMO_COMPANIES.length} companies, ${n} jobs`);
  }
  await refreshGhostScores();
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
