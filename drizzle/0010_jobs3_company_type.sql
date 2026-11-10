CREATE TYPE "public"."company_type" AS ENUM('MNC', 'INDIAN_LARGE', 'UNICORN', 'STARTUP', 'GCC', 'GOVERNMENT', 'OTHER');--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "company_type" "company_type";--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "employee_count" integer;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "hq_country" text;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "is_mnc" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "classified_by" text;--> statement-breakpoint
CREATE INDEX "companies_is_mnc_idx" ON "companies" USING btree ("is_mnc");--> statement-breakpoint
CREATE INDEX "companies_type_idx" ON "companies" USING btree ("company_type");