CREATE TYPE "public"."referral_status" AS ENUM('drafted', 'sent', 'replied', 'referred', 'declined', 'no_response');--> statement-breakpoint
CREATE TABLE "company_aliases" (
	"alias" text PRIMARY KEY NOT NULL,
	"canonical" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "connections" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text DEFAULT '' NOT NULL,
	"name_key" text NOT NULL,
	"profile_url" text,
	"email" text,
	"company" text NOT NULL,
	"company_key" text NOT NULL,
	"position" text,
	"connected_on" timestamp with time zone,
	"relationship" text,
	"batch" text,
	"source" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "referral_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"job_id" text NOT NULL,
	"connection_id" text,
	"person_name" text NOT NULL,
	"person_position" text,
	"person_url" text,
	"person_email" text,
	"channel" text NOT NULL,
	"tone" text NOT NULL,
	"subject" text,
	"message" text NOT NULL,
	"follow_up_message" text,
	"status" "referral_status" DEFAULT 'drafted' NOT NULL,
	"sent_at" timestamp with time zone,
	"follow_up_at" timestamp with time zone,
	"notes" text,
	"model" text,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "connections" ADD CONSTRAINT "connections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referral_requests" ADD CONSTRAINT "referral_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referral_requests" ADD CONSTRAINT "referral_requests_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referral_requests" ADD CONSTRAINT "referral_requests_connection_id_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."connections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "connections_user_company_idx" ON "connections" USING btree ("user_id","company_key");--> statement-breakpoint
CREATE UNIQUE INDEX "connections_user_url_idx" ON "connections" USING btree ("user_id","profile_url") WHERE "connections"."profile_url" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "connections_user_name_company_idx" ON "connections" USING btree ("user_id","name_key","company_key") WHERE "connections"."profile_url" is null;--> statement-breakpoint
CREATE INDEX "referral_requests_user_idx" ON "referral_requests" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "referral_requests_job_idx" ON "referral_requests" USING btree ("user_id","job_id");