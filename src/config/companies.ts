/*
 * Companies to crawl. Each entry needs the ATS the company uses and its board token
 * (the slug in its public job board URL):
 *   Greenhouse: boards.greenhouse.io/<token>   → ats "GREENHOUSE"
 *   Lever:      jobs.lever.co/<token>          → ats "LEVER"
 *   Ashby:      jobs.ashbyhq.com/<token>       → ats "ASHBY"
 *
 * Tokens change when companies switch ATS. Run `npm run crawl` and check the log:
 * any company that errors with 404 should be fixed or set active: false in /admin.
 * Grow this list to a few thousand companies over time (see README, "Growing coverage").
 */
export type CompanySeed = {
  name: string;
  ats: "GREENHOUSE" | "LEVER" | "ASHBY";
  token: string;
  industry?: string;
  hq?: string;
  website?: string;
};

export const CRAWL_COMPANIES: CompanySeed[] = [
  // Global companies with large India or remote hiring
  { name: "Stripe", ats: "GREENHOUSE", token: "stripe", industry: "Fintech", hq: "San Francisco", website: "https://stripe.com" },
  { name: "Airbnb", ats: "GREENHOUSE", token: "airbnb", industry: "Travel", hq: "San Francisco", website: "https://airbnb.com" },
  { name: "Databricks", ats: "GREENHOUSE", token: "databricks", industry: "Data and AI", hq: "San Francisco", website: "https://databricks.com" },
  { name: "Postman", ats: "GREENHOUSE", token: "postman", industry: "Developer tools", hq: "Bengaluru", website: "https://postman.com" },
  { name: "GitLab", ats: "GREENHOUSE", token: "gitlab", industry: "Developer tools", hq: "Remote", website: "https://gitlab.com" },
  { name: "Figma", ats: "GREENHOUSE", token: "figma", industry: "Design software", hq: "San Francisco", website: "https://figma.com" },
  { name: "Palantir", ats: "LEVER", token: "palantir", industry: "Software", hq: "Denver", website: "https://palantir.com" },
  { name: "Razorpay", ats: "LEVER", token: "razorpay", industry: "Fintech", hq: "Bengaluru", website: "https://razorpay.com" },
  { name: "OpenAI", ats: "ASHBY", token: "openai", industry: "AI research", hq: "San Francisco", website: "https://openai.com" },
  { name: "Notion", ats: "ASHBY", token: "notion", industry: "Productivity software", hq: "San Francisco", website: "https://notion.so" },
  { name: "Ramp", ats: "ASHBY", token: "ramp", industry: "Fintech", hq: "New York", website: "https://ramp.com" },
  { name: "Linear", ats: "ASHBY", token: "linear", industry: "Developer tools", hq: "Remote", website: "https://linear.app" },
];
