CREATE TABLE "training" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"doc_no" text NOT NULL,
	"year" integer NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"planned_month" text,
	"planned_hours" real,
	"target" text,
	"organizer_id" uuid,
	"status" text DEFAULT 'planned' NOT NULL,
	"held_on" text,
	"hours" real,
	"instructor" text,
	"content" text,
	"effect_due" text,
	"effect_method" text,
	"effect_result" text,
	"effect_note" text,
	"effect_by" uuid,
	"effect_at" timestamp with time zone,
	"cancel_reason" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "training_doc_no_unique" UNIQUE("doc_no")
);
--> statement-breakpoint
CREATE TABLE "training_attendee" (
	"id" serial PRIMARY KEY NOT NULL,
	"training_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"hours" real NOT NULL,
	"signed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "training" ADD CONSTRAINT "training_organizer_id_app_user_id_fk" FOREIGN KEY ("organizer_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training" ADD CONSTRAINT "training_effect_by_app_user_id_fk" FOREIGN KEY ("effect_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training" ADD CONSTRAINT "training_created_by_app_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_attendee" ADD CONSTRAINT "training_attendee_training_id_training_id_fk" FOREIGN KEY ("training_id") REFERENCES "public"."training"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_attendee" ADD CONSTRAINT "training_attendee_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "training_year_idx" ON "training" USING btree ("year");--> statement-breakpoint
CREATE UNIQUE INDEX "training_attendee_uq" ON "training_attendee" USING btree ("training_id","user_id");