CREATE TABLE "coach_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"thread_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "coach_threads" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"title" text NOT NULL,
	"kind" text DEFAULT 'chat' NOT NULL,
	"job_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_matches" (
	"user_id" text NOT NULL,
	"job_id" text NOT NULL,
	"score" integer NOT NULL,
	"reasons" jsonb NOT NULL,
	"missing" text[] DEFAULT '{}' NOT NULL,
	"ai_verdict" text,
	"ai_reason" text,
	"ai_at" timestamp with time zone,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "job_matches_user_id_job_id_pk" PRIMARY KEY("user_id","job_id")
);
--> statement-breakpoint
ALTER TABLE "coach_messages" ADD CONSTRAINT "coach_messages_thread_id_coach_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."coach_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_messages" ADD CONSTRAINT "coach_messages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_threads" ADD CONSTRAINT "coach_threads_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_threads" ADD CONSTRAINT "coach_threads_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_matches" ADD CONSTRAINT "job_matches_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_matches" ADD CONSTRAINT "job_matches_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "coach_messages_thread_idx" ON "coach_messages" USING btree ("thread_id","created_at");--> statement-breakpoint
CREATE INDEX "coach_threads_user_idx" ON "coach_threads" USING btree ("user_id","updated_at");--> statement-breakpoint
CREATE INDEX "job_matches_user_score_idx" ON "job_matches" USING btree ("user_id","score");