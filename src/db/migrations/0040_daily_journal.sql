CREATE TABLE "daily_journal" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"day" text NOT NULL,
	"notes" text,
	"tomorrow" text,
	"off_app" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"suggestion_text" text,
	"suggestion_no" text,
	"safety_ok" boolean,
	"safety_note" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"closed_at" timestamp with time zone,
	"snapshot" jsonb,
	"confirm_role" text,
	"confirmed_by" uuid,
	"confirmed_at" timestamp with time zone,
	"return_note" text,
	"returned_at" timestamp with time zone,
	"addenda" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "daily_journal" ADD CONSTRAINT "daily_journal_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_journal" ADD CONSTRAINT "daily_journal_confirmed_by_app_user_id_fk" FOREIGN KEY ("confirmed_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "daily_journal_user_day_uq" ON "daily_journal" USING btree ("user_id","day");--> statement-breakpoint
CREATE INDEX "daily_journal_status_idx" ON "daily_journal" USING btree ("status","confirm_role");