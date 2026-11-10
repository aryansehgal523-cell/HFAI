CREATE TABLE "crawl_state" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "normalized_name" text;--> statement-breakpoint
ALTER TABLE "crawl_runs" ADD COLUMN "duplicates_removed" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "source_job_id" text;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "other_sources" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "dedupe_key" text;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "duplicate_of" text;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "source_query" text;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "missed_crawls" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX "companies_normalized_name_idx" ON "companies" USING btree ("normalized_name");--> statement-breakpoint
CREATE INDEX "jobs_dedupe_idx" ON "jobs" USING btree ("dedupe_key");--> statement-breakpoint
CREATE INDEX "jobs_source_query_idx" ON "jobs" USING btree ("source","source_query");