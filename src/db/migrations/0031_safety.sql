CREATE TABLE "chemical" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"maker" text,
	"category" text NOT NULL,
	"hazards" text,
	"monthly_use" text,
	"location" text,
	"ppe" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"flammable" boolean DEFAULT false NOT NULL,
	"msds_path" text,
	"msds_name" text,
	"msds_revised_on" text,
	"msds_uploaded_at" timestamp with time zone,
	"trained_on" text,
	"active" boolean DEFAULT true NOT NULL,
	"note" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hazard_assessment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"doc_no" text NOT NULL,
	"kind" text NOT NULL,
	"year" integer NOT NULL,
	"reason" text,
	"incident_id" uuid,
	"participants" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"done_by" uuid,
	"done_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hazard_row" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assessment_id" uuid NOT NULL,
	"process" text NOT NULL,
	"hazard" text NOT NULL,
	"current" text,
	"likelihood" integer NOT NULL,
	"severity" integer NOT NULL,
	"score" integer NOT NULL,
	"measure_type" text,
	"measure" text,
	"owner_id" uuid,
	"due" text,
	"measure_done_at" timestamp with time zone,
	"measure_done_by" uuid,
	"measure_result" text,
	"residual_l" integer,
	"residual_s" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "incident" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"doc_no" text NOT NULL,
	"kind" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"place" text NOT NULL,
	"process" text,
	"description" text NOT NULL,
	"severity" text DEFAULT 'none' NOT NULL,
	"injured_enc" text,
	"injury_enc" text,
	"damage" text,
	"immediate" text,
	"cause" text,
	"prevention" text,
	"legal_needed" boolean,
	"legal_reported_on" text,
	"legal_note" text,
	"hazard_review" text,
	"nc_id" uuid,
	"status" text DEFAULT 'reported' NOT NULL,
	"reported_by" uuid,
	"reported_at" timestamp with time zone DEFAULT now() NOT NULL,
	"investigated_by" uuid,
	"investigated_at" timestamp with time zone,
	"closed_by" uuid,
	"closed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "chemical" ADD CONSTRAINT "chemical_created_by_app_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hazard_assessment" ADD CONSTRAINT "hazard_assessment_done_by_app_user_id_fk" FOREIGN KEY ("done_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hazard_assessment" ADD CONSTRAINT "hazard_assessment_created_by_app_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hazard_row" ADD CONSTRAINT "hazard_row_assessment_id_hazard_assessment_id_fk" FOREIGN KEY ("assessment_id") REFERENCES "public"."hazard_assessment"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hazard_row" ADD CONSTRAINT "hazard_row_owner_id_app_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hazard_row" ADD CONSTRAINT "hazard_row_measure_done_by_app_user_id_fk" FOREIGN KEY ("measure_done_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incident" ADD CONSTRAINT "incident_reported_by_app_user_id_fk" FOREIGN KEY ("reported_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incident" ADD CONSTRAINT "incident_investigated_by_app_user_id_fk" FOREIGN KEY ("investigated_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incident" ADD CONSTRAINT "incident_closed_by_app_user_id_fk" FOREIGN KEY ("closed_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "hazard_assessment_no_uq" ON "hazard_assessment" USING btree ("doc_no");--> statement-breakpoint
CREATE INDEX "hazard_assessment_year_idx" ON "hazard_assessment" USING btree ("year");--> statement-breakpoint
CREATE INDEX "hazard_row_idx" ON "hazard_row" USING btree ("assessment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "incident_no_uq" ON "incident" USING btree ("doc_no");--> statement-breakpoint
CREATE INDEX "incident_status_idx" ON "incident" USING btree ("status");