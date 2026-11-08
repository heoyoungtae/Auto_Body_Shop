CREATE TABLE "message_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"channel" text NOT NULL,
	"purpose" text NOT NULL,
	"provider" text NOT NULL,
	"to_enc" text NOT NULL,
	"to_masked" text NOT NULL,
	"customer_name" text,
	"body" text NOT NULL,
	"amount" integer,
	"status" text NOT NULL,
	"error" text,
	"ref" text,
	"sent_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messaging_config" (
	"kind" text PRIMARY KEY NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"secrets" text,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "message_log" ADD CONSTRAINT "message_log_sent_by_app_user_id_fk" FOREIGN KEY ("sent_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messaging_config" ADD CONSTRAINT "messaging_config_updated_by_app_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "message_log_created_idx" ON "message_log" USING btree ("created_at");