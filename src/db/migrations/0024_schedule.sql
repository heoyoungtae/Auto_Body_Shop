CREATE TABLE "schedule_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope" text NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"start_on" text NOT NULL,
	"end_on" text NOT NULL,
	"start_time" text,
	"end_time" text,
	"place" text,
	"note" text,
	"attendee_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"repeat" text DEFAULT 'none' NOT NULL,
	"repeat_until" text,
	"remind_days" integer,
	"owner_id" uuid NOT NULL,
	"updated_by" uuid,
	"cancelled_at" timestamp with time zone,
	"cancelled_by" uuid,
	"cancel_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "schedule_event" ADD CONSTRAINT "schedule_event_owner_id_app_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_event" ADD CONSTRAINT "schedule_event_updated_by_app_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_event" ADD CONSTRAINT "schedule_event_cancelled_by_app_user_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "schedule_event_start" ON "schedule_event" USING btree ("start_on");--> statement-breakpoint
CREATE INDEX "schedule_event_owner" ON "schedule_event" USING btree ("owner_id","scope");