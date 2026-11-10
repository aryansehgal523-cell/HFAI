CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
-- The search document for jobs.search. Declared IMMUTABLE so it can back a generated column
-- (to_tsvector with an explicit configuration and array_to_string on text[] are deterministic).
-- Only the first 1,000 characters of the description: enough to match, and it keeps the column small.
CREATE OR REPLACE FUNCTION hireflow_search_doc(title text, company text, skills text[], description text)
RETURNS tsvector LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT setweight(to_tsvector('english', coalesce(title, '')), 'A')
      || setweight(to_tsvector('simple', coalesce(company, '')), 'A')
      || setweight(to_tsvector('simple', coalesce(array_to_string(skills, ' '), '')), 'B')
      || setweight(to_tsvector('english', left(coalesce(description, ''), 1000)), 'C')
$$;--> statement-breakpoint
ALTER TABLE "crawl_runs" ADD COLUMN "live_by_source" jsonb;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "company_name" text;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "job_function" text;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "search" "tsvector" GENERATED ALWAYS AS (hireflow_search_doc(title, company_name, skills, description)) STORED;--> statement-breakpoint
CREATE INDEX "jobs_search_idx" ON "jobs" USING gin ("search");--> statement-breakpoint
CREATE INDEX "jobs_title_trgm_idx" ON "jobs" USING gin ("title" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "jobs_location_trgm_idx" ON "jobs" USING gin ("location" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "jobs_open_posted_idx" ON "jobs" USING btree ("posted_at" DESC NULLS LAST) WHERE closed_at IS NULL;--> statement-breakpoint
CREATE INDEX "jobs_work_mode_idx" ON "jobs" USING btree ("work_mode");--> statement-breakpoint
CREATE INDEX "jobs_country_idx" ON "jobs" USING btree ("country");--> statement-breakpoint
CREATE INDEX "jobs_function_idx" ON "jobs" USING btree ("job_function");--> statement-breakpoint
CREATE INDEX "jobs_company_idx" ON "jobs" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "jobs_ghost_idx" ON "jobs" USING btree ("ghost_score");--> statement-breakpoint
UPDATE "jobs" j SET "company_name" = c."name" FROM "companies" c WHERE c."id" = j."company_id" AND j."company_name" IS NULL;
