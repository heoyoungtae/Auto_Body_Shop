CREATE TABLE "equipment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"no" text NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"model" text,
	"maker" text,
	"maker_contact" text,
	"bought_on" text,
	"price" integer,
	"zone" text,
	"rating" text,
	"grade" text NOT NULL,
	"owner_id" uuid,
	"operators" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"legal_kind" text,
	"legal_next_on" text,
	"manual_ref" text,
	"check_daily" boolean DEFAULT true NOT NULL,
	"check_monthly" boolean DEFAULT true NOT NULL,
	"daily_items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"monthly_items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"processes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"measure_range" text,
	"tolerance" text,
	"calib_months" integer,
	"calib_next_on" text,
	"status" text DEFAULT 'in_use' NOT NULL,
	"stop_reason" text,
	"stopped_at" timestamp with time zone,
	"trial_on" text,
	"note" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "equipment_calibration" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"equipment_id" uuid NOT NULL,
	"calibrated_on" text NOT NULL,
	"agency" text NOT NULL,
	"pass" boolean NOT NULL,
	"cert_no" text,
	"next_on" text NOT NULL,
	"recorded_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "equipment_check" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"equipment_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"check_date" text NOT NULL,
	"results" jsonb NOT NULL,
	"ok" boolean NOT NULL,
	"idle" boolean DEFAULT false NOT NULL,
	"note" text,
	"checked_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "equipment_failure" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"doc_no" text NOT NULL,
	"equipment_id" uuid NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"found_by" uuid NOT NULL,
	"symptom" text NOT NULL,
	"check_id" uuid,
	"action" text,
	"external" boolean DEFAULT false NOT NULL,
	"down_minutes" integer,
	"parts" text,
	"cost" integer,
	"cause" text,
	"prevention" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"nc_ref" text,
	"status" text DEFAULT 'open' NOT NULL,
	"closed_by" uuid,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "equipment_run_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"equipment_id" uuid NOT NULL,
	"log_date" text NOT NULL,
	"data" jsonb NOT NULL,
	"operator_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lube_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"point_id" uuid NOT NULL,
	"done_on" text NOT NULL,
	"used" text,
	"state" text NOT NULL,
	"action" text,
	"done_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lube_point" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"equipment_id" uuid NOT NULL,
	"code" text NOT NULL,
	"spot" text NOT NULL,
	"oil" text NOT NULL,
	"color" text,
	"amount" text,
	"cycle_days" integer NOT NULL,
	"method" text,
	"owner_id" uuid,
	"last_done_on" text,
	"next_due_on" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pm_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"equipment_id" uuid NOT NULL,
	"task" text NOT NULL,
	"cycle_months" integer NOT NULL,
	"months" jsonb NOT NULL,
	"day" integer DEFAULT 10 NOT NULL,
	"external" boolean DEFAULT false NOT NULL,
	"cost" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pm_plan" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"year" integer NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_by" uuid NOT NULL,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pm_task" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" uuid NOT NULL,
	"due_on" text NOT NULL,
	"done_on" text,
	"done_by" uuid,
	"work" text,
	"parts" text,
	"minutes" integer,
	"cost" integer,
	"vendor" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "equipment" ADD CONSTRAINT "equipment_owner_id_app_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipment" ADD CONSTRAINT "equipment_created_by_app_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipment_calibration" ADD CONSTRAINT "equipment_calibration_equipment_id_equipment_id_fk" FOREIGN KEY ("equipment_id") REFERENCES "public"."equipment"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipment_calibration" ADD CONSTRAINT "equipment_calibration_recorded_by_app_user_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipment_check" ADD CONSTRAINT "equipment_check_equipment_id_equipment_id_fk" FOREIGN KEY ("equipment_id") REFERENCES "public"."equipment"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipment_check" ADD CONSTRAINT "equipment_check_checked_by_app_user_id_fk" FOREIGN KEY ("checked_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipment_failure" ADD CONSTRAINT "equipment_failure_equipment_id_equipment_id_fk" FOREIGN KEY ("equipment_id") REFERENCES "public"."equipment"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipment_failure" ADD CONSTRAINT "equipment_failure_found_by_app_user_id_fk" FOREIGN KEY ("found_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipment_failure" ADD CONSTRAINT "equipment_failure_check_id_equipment_check_id_fk" FOREIGN KEY ("check_id") REFERENCES "public"."equipment_check"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipment_failure" ADD CONSTRAINT "equipment_failure_closed_by_app_user_id_fk" FOREIGN KEY ("closed_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipment_run_log" ADD CONSTRAINT "equipment_run_log_equipment_id_equipment_id_fk" FOREIGN KEY ("equipment_id") REFERENCES "public"."equipment"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipment_run_log" ADD CONSTRAINT "equipment_run_log_operator_id_app_user_id_fk" FOREIGN KEY ("operator_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lube_log" ADD CONSTRAINT "lube_log_point_id_lube_point_id_fk" FOREIGN KEY ("point_id") REFERENCES "public"."lube_point"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lube_log" ADD CONSTRAINT "lube_log_done_by_app_user_id_fk" FOREIGN KEY ("done_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lube_point" ADD CONSTRAINT "lube_point_equipment_id_equipment_id_fk" FOREIGN KEY ("equipment_id") REFERENCES "public"."equipment"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lube_point" ADD CONSTRAINT "lube_point_owner_id_app_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pm_item" ADD CONSTRAINT "pm_item_plan_id_pm_plan_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."pm_plan"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pm_item" ADD CONSTRAINT "pm_item_equipment_id_equipment_id_fk" FOREIGN KEY ("equipment_id") REFERENCES "public"."equipment"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pm_plan" ADD CONSTRAINT "pm_plan_created_by_app_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pm_plan" ADD CONSTRAINT "pm_plan_approved_by_app_user_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pm_task" ADD CONSTRAINT "pm_task_item_id_pm_item_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."pm_item"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pm_task" ADD CONSTRAINT "pm_task_done_by_app_user_id_fk" FOREIGN KEY ("done_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "equipment_no_uq" ON "equipment" USING btree ("no");--> statement-breakpoint
CREATE INDEX "equipment_calibration_eq" ON "equipment_calibration" USING btree ("equipment_id");--> statement-breakpoint
CREATE INDEX "equipment_check_eq_date" ON "equipment_check" USING btree ("equipment_id","check_date");--> statement-breakpoint
CREATE UNIQUE INDEX "equipment_failure_no_uq" ON "equipment_failure" USING btree ("doc_no");--> statement-breakpoint
CREATE INDEX "equipment_failure_eq" ON "equipment_failure" USING btree ("equipment_id");--> statement-breakpoint
CREATE INDEX "equipment_run_log_eq" ON "equipment_run_log" USING btree ("equipment_id","log_date");--> statement-breakpoint
CREATE INDEX "lube_log_point" ON "lube_log" USING btree ("point_id");--> statement-breakpoint
CREATE UNIQUE INDEX "lube_point_code_uq" ON "lube_point" USING btree ("equipment_id","code");--> statement-breakpoint
CREATE INDEX "pm_item_plan" ON "pm_item" USING btree ("plan_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pm_plan_year_uq" ON "pm_plan" USING btree ("year");--> statement-breakpoint
CREATE INDEX "pm_task_due" ON "pm_task" USING btree ("due_on");--> statement-breakpoint
CREATE UNIQUE INDEX "pm_task_item_due_uq" ON "pm_task" USING btree ("item_id","due_on");