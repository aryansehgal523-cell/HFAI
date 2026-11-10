-- Title, company and skills only (see jobs.search_main). IMMUTABLE so it can back a generated column.
CREATE OR REPLACE FUNCTION hireflow_search_main(title text, company text, skills text[])
RETURNS tsvector LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT setweight(to_tsvector('english', coalesce(title, '')), 'A')
      || setweight(to_tsvector('simple', coalesce(company, '')), 'A')
      || setweight(to_tsvector('english', coalesce(array_to_string(skills, ' '), '')), 'B')
$$;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "search_main" "tsvector" GENERATED ALWAYS AS (hireflow_search_main(title, company_name, skills)) STORED;--> statement-breakpoint
CREATE INDEX "jobs_search_main_idx" ON "jobs" USING gin ("search_main");