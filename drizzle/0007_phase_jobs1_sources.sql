ALTER TYPE "public"."ats" ADD VALUE 'SMARTRECRUITERS';--> statement-breakpoint
ALTER TYPE "public"."ats" ADD VALUE 'WORKABLE';--> statement-breakpoint
ALTER TYPE "public"."ats" ADD VALUE 'RECRUITEE';--> statement-breakpoint
ALTER TYPE "public"."ats" ADD VALUE 'WORKDAY';--> statement-breakpoint
ALTER TYPE "public"."ats" ADD VALUE 'KEKA';--> statement-breakpoint
ALTER TYPE "public"."ats" ADD VALUE 'JSONLD';--> statement-breakpoint
ALTER TYPE "public"."ats" ADD VALUE 'AGGREGATOR';--> statement-breakpoint
CREATE TABLE "crawl_skips" (
	"company_id" text NOT NULL,
	"external_id" text NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "crawl_skips_company_id_external_id_pk" PRIMARY KEY("company_id","external_id")
);
--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "careers_url" text;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "ats_config" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "last_crawl_status" text;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "last_crawl_jobs" integer;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "last_crawl_error" text;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "consecutive_failures" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "crawl_runs" ADD COLUMN "stats" jsonb;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "source" text;--> statement-breakpoint
ALTER TABLE "crawl_skips" ADD CONSTRAINT "crawl_skips_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "companies_crawl_order_idx" ON "companies" USING btree ("active","last_crawled_at");--> statement-breakpoint
UPDATE "jobs" j SET "source" = lower(c."ats"::text) FROM "companies" c WHERE c."id" = j."company_id" AND j."source" IS NULL;
