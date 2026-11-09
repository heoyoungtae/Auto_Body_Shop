CREATE TABLE "five_s_daily" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"zone" text NOT NULL,
	"check_date" text NOT NULL,
	"results" jsonb NOT NULL,
	"items" jsonb NOT NULL,
	"note" text,
	"photos" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"checked_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "five_s_monthly" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ym" text NOT NULL,
	"zone" text NOT NULL,
	"scores" jsonb NOT NULL,
	"total" integer NOT NULL,
	"remarks" text,
	"nc_id" uuid,
	"rated_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "five_s_zone" (
	"code" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"owner_id" uuid,
	"deputy_id" uuid,
	"ref_photo" text,
	"active" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nonconformance" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"doc_no" text NOT NULL,
	"source" text NOT NULL,
	"ref_type" text,
	"ref_id" text,
	"ref_label" text,
	"occurred_at" timestamp with time zone NOT NULL,
	"found_by" uuid NOT NULL,
	"content" text NOT NULL,
	"photos" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"immediate" text,
	"major" boolean DEFAULT false NOT NULL,
	"whys" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"root_cause" text,
	"corrective" text,
	"assignee_id" uuid,
	"due_on" text,
	"std_revision" boolean DEFAULT false NOT NULL,
	"revision_ref" text,
	"planned_by" uuid,
	"planned_at" timestamp with time zone,
	"action_done" text,
	"action_photos" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"action_at" timestamp with time zone,
	"effect_on" text,
	"recurred" boolean,
	"effect_note" text,
	"effect_by" uuid,
	"status" text DEFAULT 'open' NOT NULL,
	"closed_by" uuid,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "five_s_daily" ADD CONSTRAINT "five_s_daily_checked_by_app_user_id_fk" FOREIGN KEY ("checked_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "five_s_monthly" ADD CONSTRAINT "five_s_monthly_nc_id_nonconformance_id_fk" FOREIGN KEY ("nc_id") REFERENCES "public"."nonconformance"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "five_s_monthly" ADD CONSTRAINT "five_s_monthly_rated_by_app_user_id_fk" FOREIGN KEY ("rated_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "five_s_zone" ADD CONSTRAINT "five_s_zone_owner_id_app_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "five_s_zone" ADD CONSTRAINT "five_s_zone_deputy_id_app_user_id_fk" FOREIGN KEY ("deputy_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nonconformance" ADD CONSTRAINT "nonconformance_found_by_app_user_id_fk" FOREIGN KEY ("found_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nonconformance" ADD CONSTRAINT "nonconformance_assignee_id_app_user_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nonconformance" ADD CONSTRAINT "nonconformance_planned_by_app_user_id_fk" FOREIGN KEY ("planned_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nonconformance" ADD CONSTRAINT "nonconformance_effect_by_app_user_id_fk" FOREIGN KEY ("effect_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nonconformance" ADD CONSTRAINT "nonconformance_closed_by_app_user_id_fk" FOREIGN KEY ("closed_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "five_s_daily_uq" ON "five_s_daily" USING btree ("zone","check_date");--> statement-breakpoint
CREATE UNIQUE INDEX "five_s_monthly_uq" ON "five_s_monthly" USING btree ("ym","zone");--> statement-breakpoint
CREATE UNIQUE INDEX "nonconformance_no_uq" ON "nonconformance" USING btree ("doc_no");--> statement-breakpoint
CREATE INDEX "nonconformance_ref" ON "nonconformance" USING btree ("ref_type","ref_id");--> statement-breakpoint
CREATE INDEX "nonconformance_status" ON "nonconformance" USING btree ("status");