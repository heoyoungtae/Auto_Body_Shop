CREATE TABLE "training_manual" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"no" text NOT NULL,
	"title" text NOT NULL,
	"rev" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"files" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"video_url" text,
	"std_revs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"history" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"change_note" text,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "training_manual_no_unique" UNIQUE("no")
);
--> statement-breakpoint
CREATE TABLE "training_material" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"training_id" uuid NOT NULL,
	"ord" integer DEFAULT 0 NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"url" text,
	"file_path" text,
	"file_name" text,
	"manual_id" uuid,
	"doc_id" uuid,
	"minutes" integer,
	"link_ok" boolean,
	"link_checked_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "training_question" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"training_id" uuid NOT NULL,
	"ord" integer DEFAULT 0 NOT NULL,
	"question" text NOT NULL,
	"choices" jsonb NOT NULL,
	"answer" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "training" ADD COLUMN "mode" text DEFAULT 'class' NOT NULL;--> statement-breakpoint
ALTER TABLE "training" ADD COLUMN "pass_score" integer DEFAULT 80 NOT NULL;--> statement-breakpoint
ALTER TABLE "training" ADD COLUMN "allow_cert" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "training_attendee" ADD COLUMN "due_on" text;--> statement-breakpoint
ALTER TABLE "training_attendee" ADD COLUMN "viewed" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "training_attendee" ADD COLUMN "studied_sec" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "training_attendee" ADD COLUMN "score" integer;--> statement-breakpoint
ALTER TABLE "training_attendee" ADD COLUMN "attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "training_attendee" ADD COLUMN "how" text;--> statement-breakpoint
ALTER TABLE "training_attendee" ADD COLUMN "cert_file" jsonb;--> statement-breakpoint
ALTER TABLE "training_manual" ADD CONSTRAINT "training_manual_approved_by_app_user_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_manual" ADD CONSTRAINT "training_manual_created_by_app_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_material" ADD CONSTRAINT "training_material_training_id_training_id_fk" FOREIGN KEY ("training_id") REFERENCES "public"."training"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_material" ADD CONSTRAINT "training_material_created_by_app_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_question" ADD CONSTRAINT "training_question_training_id_training_id_fk" FOREIGN KEY ("training_id") REFERENCES "public"."training"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "training_material_tr_idx" ON "training_material" USING btree ("training_id");--> statement-breakpoint
CREATE INDEX "training_question_tr_idx" ON "training_question" USING btree ("training_id");