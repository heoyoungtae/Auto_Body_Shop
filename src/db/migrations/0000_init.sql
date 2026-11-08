CREATE TABLE "app_user" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"login_id" text NOT NULL,
	"name" text NOT NULL,
	"password_hash" text NOT NULL,
	"phone_enc" text,
	"active" boolean DEFAULT true NOT NULL,
	"failed_logins" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"retired_on" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_id" uuid,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text,
	"before" jsonb,
	"after" jsonb,
	"ip" text,
	"user_agent" text
);
--> statement-breakpoint
CREATE TABLE "delegation_rule" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task" text NOT NULL,
	"up_to" integer,
	"approver_role" text NOT NULL,
	"seq" integer NOT NULL,
	"note" text,
	"effective_from" date NOT NULL,
	"revision_request_no" text,
	"changed_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "doc_sequence" (
	"prefix" text NOT NULL,
	"period" text NOT NULL,
	"last" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "doc_sequence_prefix_period_pk" PRIMARY KEY("prefix","period")
);
--> statement-breakpoint
CREATE TABLE "job_run" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job" text NOT NULL,
	"run_date" date NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"ok" boolean,
	"message" text
);
--> statement-breakpoint
CREATE TABLE "notification" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"link" text,
	"dedupe_key" text,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "policy_setting" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"value" jsonb NOT NULL,
	"effective_from" date NOT NULL,
	"revision_request_no" text,
	"reason" text NOT NULL,
	"changed_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "proxy_assignment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"principal_id" uuid NOT NULL,
	"proxy_id" uuid NOT NULL,
	"from_date" date NOT NULL,
	"to_date" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ip" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_role" (
	"user_id" uuid NOT NULL,
	"role" text NOT NULL,
	CONSTRAINT "user_role_user_id_role_pk" PRIMARY KEY("user_id","role")
);
--> statement-breakpoint
CREATE TABLE "approval_doc" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"doc_no" text NOT NULL,
	"form_code" text NOT NULL,
	"title" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"steps" jsonb NOT NULL,
	"flags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"data" jsonb NOT NULL,
	"drafter_id" uuid,
	"content_hash" text,
	"confirmed_at" timestamp with time zone,
	"cancels_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "approval_event" (
	"id" serial PRIMARY KEY NOT NULL,
	"doc_id" uuid NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_id" uuid,
	"on_behalf_of" uuid,
	"type" text NOT NULL,
	"comment" text
);
--> statement-breakpoint
ALTER TABLE "delegation_rule" ADD CONSTRAINT "delegation_rule_changed_by_app_user_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policy_setting" ADD CONSTRAINT "policy_setting_changed_by_app_user_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proxy_assignment" ADD CONSTRAINT "proxy_assignment_principal_id_app_user_id_fk" FOREIGN KEY ("principal_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proxy_assignment" ADD CONSTRAINT "proxy_assignment_proxy_id_app_user_id_fk" FOREIGN KEY ("proxy_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_role" ADD CONSTRAINT "user_role_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_doc" ADD CONSTRAINT "approval_doc_drafter_id_app_user_id_fk" FOREIGN KEY ("drafter_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_event" ADD CONSTRAINT "approval_event_doc_id_approval_doc_id_fk" FOREIGN KEY ("doc_id") REFERENCES "public"."approval_doc"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_event" ADD CONSTRAINT "approval_event_actor_id_app_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_event" ADD CONSTRAINT "approval_event_on_behalf_of_app_user_id_fk" FOREIGN KEY ("on_behalf_of") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "app_user_login_uq" ON "app_user" USING btree ("login_id");--> statement-breakpoint
CREATE INDEX "audit_log_entity_idx" ON "audit_log" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "audit_log_at_idx" ON "audit_log" USING btree ("at");--> statement-breakpoint
CREATE INDEX "delegation_rule_task_idx" ON "delegation_rule" USING btree ("task","effective_from");--> statement-breakpoint
CREATE UNIQUE INDEX "job_run_uq" ON "job_run" USING btree ("job","run_date");--> statement-breakpoint
CREATE INDEX "notification_user_idx" ON "notification" USING btree ("user_id","read_at");--> statement-breakpoint
CREATE UNIQUE INDEX "notification_dedupe_uq" ON "notification" USING btree ("user_id","dedupe_key");--> statement-breakpoint
CREATE INDEX "policy_setting_key_idx" ON "policy_setting" USING btree ("key","effective_from");--> statement-breakpoint
CREATE INDEX "session_user_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "approval_doc_no_uq" ON "approval_doc" USING btree ("doc_no");--> statement-breakpoint
CREATE INDEX "approval_doc_status_idx" ON "approval_doc" USING btree ("status");--> statement-breakpoint
CREATE INDEX "approval_event_doc_idx" ON "approval_event" USING btree ("doc_id");