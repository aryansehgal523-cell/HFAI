CREATE TABLE "resume_scores" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"source" text NOT NULL,
	"ref_id" text,
	"total" integer NOT NULL,
	"breakdown" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tailorings" ADD COLUMN "score_before" integer;--> statement-breakpoint
ALTER TABLE "tailorings" ADD COLUMN "score_after" integer;--> statement-breakpoint
ALTER TABLE "tailorings" ADD COLUMN "breakdown_before" jsonb;--> statement-breakpoint
ALTER TABLE "tailorings" ADD COLUMN "breakdown_after" jsonb;--> statement-breakpoint
ALTER TABLE "resume_scores" ADD CONSTRAINT "resume_scores_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "resume_scores_user_idx" ON "resume_scores" USING btree ("user_id","source","created_at");