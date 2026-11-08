import {
  pgTable, pgEnum, text, integer, boolean, timestamp, jsonb, uniqueIndex, index, primaryKey,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import type { ApplicationDetails, JobPreferences } from "@/lib/profile-fields";
import type { ResumeScore } from "@/lib/resumeScore";
import type { AtsConfig } from "@/lib/ingest/types";

const id = () => text("id").primaryKey().$defaultFn(() => crypto.randomUUID());
const created = () => timestamp("created_at", { withTimezone: true }).defaultNow().notNull();
const updated = () =>
  timestamp("updated_at", { withTimezone: true }).defaultNow().notNull().$onUpdate(() => new Date());

// ─── Enums ───────────────────────────────────────────────────
export const roleEnum = pgEnum("role", ["USER", "ADMIN"]);
export const planEnum = pgEnum("plan", ["FREE", "PREMIUM"]);
export const atsEnum = pgEnum("ats", [
  "GREENHOUSE", "LEVER", "ASHBY", "MANUAL", "SMARTRECRUITERS", "WORKABLE", "RECRUITEE", "WORKDAY", "KEKA", "JSONLD", "AGGREGATOR", "ORACLE",
]);
export const workModeEnum = pgEnum("work_mode", ["REMOTE", "HYBRID", "ONSITE"]);
export const appStatusEnum = pgEnum("app_status", [
  "SAVED", "APPLIED", "INTERVIEWING", "OFFER", "REJECTED", "HIDDEN",
]);
export const referralStatusEnum = pgEnum("referral_status", [
  "drafted", "sent", "replied", "referred", "declined", "no_response",
]);

// ─── Users and auth ─────────────────────────────────────────
export const users = pgTable("users", {
  id: id(),
  name: text("name"),
  email: text("email").notNull().unique(),
  phone: text("phone").unique(),
  emailVerified: timestamp("email_verified", { withTimezone: true }),
  image: text("image"),
  passwordHash: text("password_hash"),
  role: roleEnum("role").default("USER").notNull(),
  plan: planEnum("plan").default("FREE").notNull(),
  credits: integer("credits").default(3).notNull(),
  creditsResetAt: timestamp("credits_reset_at", { withTimezone: true }).defaultNow().notNull(),
  marketingOptIn: boolean("marketing_opt_in").default(false).notNull(),
  consentAt: timestamp("consent_at", { withTimezone: true }),
  createdAt: created(),
  updatedAt: updated(),
});

export const oauthAccounts = pgTable(
  "oauth_accounts",
  {
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    createdAt: created(),
  },
  (t) => [primaryKey({ columns: [t.provider, t.providerAccountId] })],
);

// ─── Candidate profile ──────────────────────────────────────
export type ResumeData = {
  name?: string;
  headline?: string;
  contact?: { email?: string; phone?: string; location?: string; links?: string[] };
  summary?: string;
  experience: { company: string; title: string; location?: string; start?: string; end?: string; bullets: string[] }[];
  projects: { name: string; tech?: string[]; link?: string; bullets: string[] }[];
  education: { school: string; degree: string; start?: string; end?: string; score?: string }[];
  skills: { group: string; items: string[] }[];
  achievements: string[];
};

export const profiles = pgTable("profiles", {
  id: id(),
  userId: text("user_id").notNull().unique().references(() => users.id, { onDelete: "cascade" }),
  headline: text("headline"),
  location: text("location"),
  phone: text("phone"),
  rawResume: text("raw_resume"),
  data: jsonb("data").$type<ResumeData>(),
  applicationDetails: jsonb("application_details").$type<ApplicationDetails>(),
  preferences: jsonb("preferences").$type<JobPreferences>(),
  updatedAt: updated(),
});

// ─── Companies and jobs ─────────────────────────────────────
export const companies = pgTable(
  "companies",
  {
    id: id(),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    website: text("website"),
    ats: atsEnum("ats").notNull(),
    atsToken: text("ats_token").notNull(),
    industry: text("industry"),
    size: text("size"),
    hq: text("hq"),
    active: boolean("active").default(true).notNull(),
    careersUrl: text("careers_url"),
    /** Per source settings (Workday data centre and sites, Keka portal id, JSON-LD sitemaps). */
    atsConfig: jsonb("ats_config").$type<AtsConfig>().default({}).notNull(),
    lastCrawledAt: timestamp("last_crawled_at", { withTimezone: true }),
    /** "ok", "empty" (worked but no jobs), "error" or "blocked" (robots.txt or a dead host). */
    lastCrawlStatus: text("last_crawl_status"),
    lastCrawlJobs: integer("last_crawl_jobs"),
    lastCrawlError: text("last_crawl_error"),
    consecutiveFailures: integer("consecutive_failures").default(0).notNull(),
    createdAt: created(),
  },
  (t) => [
    uniqueIndex("companies_ats_token_idx").on(t.ats, t.atsToken),
    index("companies_crawl_order_idx").on(t.active, t.lastCrawledAt),
  ],
);

export const jobs = pgTable(
  "jobs",
  {
    id: id(),
    companyId: text("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    externalId: text("external_id").notNull(),
    title: text("title").notNull(),
    location: text("location").notNull(),
    country: text("country"),
    workMode: workModeEnum("work_mode").default("ONSITE").notNull(),
    department: text("department"),
    employment: text("employment"),
    experienceMin: integer("experience_min"),
    experienceMax: integer("experience_max"),
    salaryMin: integer("salary_min"),
    salaryMax: integer("salary_max"),
    salaryCurrency: text("salary_currency"),
    salaryPeriod: text("salary_period"),
    skills: text("skills").array().default([]).notNull(),
    description: text("description").notNull(),
    applyUrl: text("apply_url").notNull(),
    postedAt: timestamp("posted_at", { withTimezone: true }).notNull(),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).defaultNow().notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).defaultNow().notNull(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    ghostScore: integer("ghost_score").default(0).notNull(),
    hash: text("hash").notNull(),
    /** Where the job came from: the hiring system ("greenhouse", "workday", "jsonld"...) or aggregator. */
    source: text("source"),
  },
  (t) => [
    uniqueIndex("jobs_company_external_idx").on(t.companyId, t.externalId),
    index("jobs_hash_idx").on(t.hash),
    index("jobs_posted_idx").on(t.postedAt),
    index("jobs_closed_idx").on(t.closedAt),
  ],
);

export const crawlRuns = pgTable("crawl_runs", {
  id: id(),
  startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  companies: integer("companies").default(0).notNull(),
  jobsSeen: integer("jobs_seen").default(0).notNull(),
  jobsNew: integer("jobs_new").default(0).notNull(),
  jobsClosed: integer("jobs_closed").default(0).notNull(),
  errors: jsonb("errors").$type<{ company: string; error: string }[]>(),
  /** Per source counts for monitoring: { greenhouse: { companies, ok, failed, jobsSeen, jobsNew, jobsClosed } }. */
  stats: jsonb("stats").$type<Record<string, { companies: number; ok: number; failed: number; jobsSeen: number; jobsNew: number; jobsClosed: number }>>(),
});

/**
 * Jobs a connector opened but we chose not to store (outside the crawl scope, or pages with no JobPosting).
 * Remembered so the next crawls don't open them again; entries expire after 30 days and are re-checked.
 */
export const crawlSkips = pgTable(
  "crawl_skips",
  {
    companyId: text("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    externalId: text("external_id").notNull(),
    reason: text("reason").notNull(),
    createdAt: created(),
  },
  (t) => [primaryKey({ columns: [t.companyId, t.externalId] })],
);

// ─── Tracker and tailoring ──────────────────────────────────
export const applications = pgTable(
  "applications",
  {
    id: id(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    jobId: text("job_id").notNull().references(() => jobs.id, { onDelete: "cascade" }),
    status: appStatusEnum("status").default("SAVED").notNull(),
    notes: text("notes"),
    appliedAt: timestamp("applied_at", { withTimezone: true }),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [uniqueIndex("applications_user_job_idx").on(t.userId, t.jobId)],
);

export const tailorings = pgTable(
  "tailorings",
  {
    id: id(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    jobId: text("job_id").notNull().references(() => jobs.id, { onDelete: "cascade" }),
    resume: jsonb("resume").$type<ResumeData>().notNull(),
    coverLetter: text("cover_letter").notNull(),
    atsBefore: integer("ats_before").notNull(),
    atsAfter: integer("ats_after").notNull(),
    // Resume score (src/lib/resumeScore.ts) of the master and tailored resume against this job.
    scoreBefore: integer("score_before"),
    scoreAfter: integer("score_after"),
    breakdownBefore: jsonb("breakdown_before").$type<ResumeScore>(),
    breakdownAfter: jsonb("breakdown_after").$type<ResumeScore>(),
    missing: text("missing").array().default([]).notNull(),
    model: text("model").notNull(),
    inputTokens: integer("input_tokens").default(0).notNull(),
    outputTokens: integer("output_tokens").default(0).notNull(),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [uniqueIndex("tailorings_user_job_idx").on(t.userId, t.jobId)],
);

// ─── Billing ────────────────────────────────────────────────
export const subscriptions = pgTable("subscriptions", {
  id: id(),
  userId: text("user_id").notNull().unique().references(() => users.id, { onDelete: "cascade" }),
  razorpaySubId: text("razorpay_sub_id").notNull().unique(),
  planId: text("plan_id").notNull(),
  interval: text("interval").notNull(),
  status: text("status").notNull(),
  currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
  cancelAtPeriodEnd: boolean("cancel_at_period_end").default(false).notNull(),
  createdAt: created(),
  updatedAt: updated(),
});

export const payments = pgTable("payments", {
  id: id(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  razorpayPaymentId: text("razorpay_payment_id").notNull().unique(),
  razorpaySubId: text("razorpay_sub_id"),
  razorpayOrderId: text("razorpay_order_id"),
  amount: integer("amount").notNull(), // paise, GST inclusive
  currency: text("currency").default("INR").notNull(),
  kind: text("kind").notNull(), // subscription | topup
  status: text("status").notNull(),
  invoiceNumber: text("invoice_number").unique(),
  createdAt: created(),
});

export const webhookEvents = pgTable("webhook_events", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  receivedAt: timestamp("received_at", { withTimezone: true }).defaultNow().notNull(),
});

// ─── Referral engine ────────────────────────────────────────
/**
 * People the user knows, imported from LinkedIn's Connections.csv, an alumni sheet, or added
 * by hand. Private to the user; never shown to or used for anyone else.
 */
export const connections = pgTable(
  "connections",
  {
    id: id(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull().default(""),
    nameKey: text("name_key").notNull(), // lower(first last), for de-duplicating rows without a URL
    profileUrl: text("profile_url"),
    email: text("email"),
    company: text("company").notNull(),
    companyKey: text("company_key").notNull(), // src/lib/referrals/company.ts companyKey()
    position: text("position"),
    connectedOn: timestamp("connected_on", { withTimezone: true }),
    relationship: text("relationship"), // alumni | ex_colleague | friend | family | other
    batch: text("batch"),
    source: text("source").notNull(), // linkedin_csv | alumni_csv | manual
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [
    index("connections_user_company_idx").on(t.userId, t.companyKey),
    uniqueIndex("connections_user_url_idx").on(t.userId, t.profileUrl).where(sql`${t.profileUrl} is not null`),
    uniqueIndex("connections_user_name_company_idx").on(t.userId, t.nameKey, t.companyKey).where(sql`${t.profileUrl} is null`),
  ],
);

/** Extra company name aliases (normalised), on top of DEFAULT_ALIASES in code. */
export const companyAliases = pgTable("company_aliases", {
  alias: text("alias").primaryKey(),
  canonical: text("canonical").notNull(),
  createdAt: created(),
});

export const referralRequests = pgTable(
  "referral_requests",
  {
    id: id(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    jobId: text("job_id").notNull().references(() => jobs.id, { onDelete: "cascade" }),
    connectionId: text("connection_id").references(() => connections.id, { onDelete: "set null" }),
    // Snapshot, so the request still reads well if the connection is deleted later.
    personName: text("person_name").notNull(),
    personPosition: text("person_position"),
    personUrl: text("person_url"),
    personEmail: text("person_email"),
    channel: text("channel").notNull(), // linkedin | email
    tone: text("tone").notNull(), // friendly | formal
    subject: text("subject"),
    message: text("message").notNull(),
    followUpMessage: text("follow_up_message"),
    status: referralStatusEnum("status").default("drafted").notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    followUpAt: timestamp("follow_up_at", { withTimezone: true }),
    notes: text("notes"),
    model: text("model"),
    inputTokens: integer("input_tokens").default(0).notNull(),
    outputTokens: integer("output_tokens").default(0).notNull(),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [index("referral_requests_user_idx").on(t.userId, t.status), index("referral_requests_job_idx").on(t.userId, t.jobId)],
);

// ─── Job matching and AI coach ──────────────────────────────
/** Deterministic match score per user and job (src/lib/matching.ts), plus the daily AI verdict. */
export const jobMatches = pgTable(
  "job_matches",
  {
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    jobId: text("job_id").notNull().references(() => jobs.id, { onDelete: "cascade" }),
    score: integer("score").notNull(),
    reasons: jsonb("reasons").$type<string[]>().notNull(),
    missing: text("missing").array().default([]).notNull(),
    aiVerdict: text("ai_verdict"), // strong | good | stretch (Premium)
    aiReason: text("ai_reason"),
    aiAt: timestamp("ai_at", { withTimezone: true }),
    computedAt: timestamp("computed_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.jobId] }), index("job_matches_user_score_idx").on(t.userId, t.score)],
);

export const coachThreads = pgTable(
  "coach_threads",
  {
    id: id(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    kind: text("kind").notNull().default("chat"), // chat | interview | mock | calls | week | negotiate
    jobId: text("job_id").references(() => jobs.id, { onDelete: "set null" }),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [index("coach_threads_user_idx").on(t.userId, t.updatedAt)],
);

export const coachMessages = pgTable(
  "coach_messages",
  {
    id: id(),
    threadId: text("thread_id").notNull().references(() => coachThreads.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    role: text("role").notNull(), // user | assistant
    content: text("content").notNull(),
    inputTokens: integer("input_tokens").default(0).notNull(),
    outputTokens: integer("output_tokens").default(0).notNull(),
    createdAt: created(),
  },
  (t) => [index("coach_messages_thread_idx").on(t.threadId, t.createdAt)],
);

// ─── Chrome extension ───────────────────────────────────────
/** Long lived extension tokens. Only a SHA-256 hash is stored; the token is shown to the extension once. */
export const extensionTokens = pgTable(
  "extension_tokens",
  {
    id: id(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    name: text("name").notNull(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    createdAt: created(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (t) => [index("extension_tokens_user_idx").on(t.userId)],
);

/** One time 8 character codes from Settings, valid for 10 minutes, exchanged for a token. */
export const extensionCodes = pgTable("extension_codes", {
  codeHash: text("code_hash").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: created(),
});

/** History of resume scores, for the trend line and to keep every screen in agreement. */
export const resumeScores = pgTable(
  "resume_scores",
  {
    id: id(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    source: text("source").notNull(), // "master" | "tailoring"
    refId: text("ref_id"), // tailoring id when source is "tailoring"
    total: integer("total").notNull(),
    breakdown: jsonb("breakdown").$type<ResumeScore>().notNull(),
    createdAt: created(),
  },
  (t) => [index("resume_scores_user_idx").on(t.userId, t.source, t.createdAt)],
);

/**
 * One row per metered action (resume upload, referral draft, coach message, autofill...).
 * Lives in the database because serverless instances do not share memory, so in memory
 * counters cannot enforce daily or monthly limits.
 */
export const usageEvents = pgTable(
  "usage_events",
  {
    id: id(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    createdAt: created(),
  },
  (t) => [index("usage_events_user_kind_idx").on(t.userId, t.kind, t.createdAt)],
);

export const contactMessages = pgTable("contact_messages", {
  id: id(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  topic: text("topic").notNull(),
  message: text("message").notNull(),
  createdAt: created(),
});

// ─── Relations ──────────────────────────────────────────────
export const companiesRelations = relations(companies, ({ many }) => ({ jobs: many(jobs) }));
export const jobsRelations = relations(jobs, ({ one }) => ({
  company: one(companies, { fields: [jobs.companyId], references: [companies.id] }),
}));
export const applicationsRelations = relations(applications, ({ one }) => ({
  job: one(jobs, { fields: [applications.jobId], references: [jobs.id] }),
  user: one(users, { fields: [applications.userId], references: [users.id] }),
}));
export const tailoringsRelations = relations(tailorings, ({ one }) => ({
  job: one(jobs, { fields: [tailorings.jobId], references: [jobs.id] }),
}));

export type Connection = typeof connections.$inferSelect;
export type ReferralRequest = typeof referralRequests.$inferSelect;
export type ExtensionToken = typeof extensionTokens.$inferSelect;
export type Job = typeof jobs.$inferSelect;
export type Company = typeof companies.$inferSelect;
export type User = typeof users.$inferSelect;
