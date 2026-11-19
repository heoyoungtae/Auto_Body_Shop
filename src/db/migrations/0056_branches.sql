CREATE TABLE "branch" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"code" text DEFAULT '' NOT NULL,
	"is_main" boolean DEFAULT false NOT NULL,
	"biz_no" text DEFAULT '' NOT NULL,
	"sub_biz_no" text DEFAULT '' NOT NULL,
	"repair_reg_no" text DEFAULT '' NOT NULL,
	"zip" text DEFAULT '' NOT NULL,
	"address" text DEFAULT '' NOT NULL,
	"address_detail" text DEFAULT '' NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"opened_on" date,
	"closed_on" date,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
-- 본점(고정 id). 지점 칸의 기본값이 이 줄을 가리킨다
INSERT INTO "branch" ("id", "name", "code", "is_main") VALUES ('00000000-0000-4000-8000-000000000001', '본점', '', true);
--> statement-breakpoint
CREATE TABLE "workplace" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"branch_id" uuid DEFAULT '00000000-0000-4000-8000-000000000001' NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"bays" integer DEFAULT 0 NOT NULL,
	"manager_id" uuid,
	"note" text DEFAULT '' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "consultation" ADD COLUMN "branch_id" uuid DEFAULT '00000000-0000-4000-8000-000000000001' NOT NULL;--> statement-breakpoint
ALTER TABLE "repair_order" ADD COLUMN "branch_id" uuid DEFAULT '00000000-0000-4000-8000-000000000001' NOT NULL;--> statement-breakpoint
ALTER TABLE "work_step" ADD COLUMN "workplace_id" uuid;--> statement-breakpoint
ALTER TABLE "staff_profile" ADD COLUMN "home_branch_id" uuid DEFAULT '00000000-0000-4000-8000-000000000001' NOT NULL;--> statement-breakpoint
ALTER TABLE "work_day" ADD COLUMN "branch_id" uuid DEFAULT '00000000-0000-4000-8000-000000000001' NOT NULL;--> statement-breakpoint
ALTER TABLE "equipment" ADD COLUMN "branch_id" uuid DEFAULT '00000000-0000-4000-8000-000000000001' NOT NULL;--> statement-breakpoint
ALTER TABLE "equipment" ADD COLUMN "workplace_id" uuid;--> statement-breakpoint
ALTER TABLE "tool" ADD COLUMN "branch_id" uuid DEFAULT '00000000-0000-4000-8000-000000000001' NOT NULL;--> statement-breakpoint
ALTER TABLE "five_s_zone" ADD COLUMN "branch_id" uuid DEFAULT '00000000-0000-4000-8000-000000000001' NOT NULL;--> statement-breakpoint
ALTER TABLE "five_s_zone" ADD COLUMN "workplace_id" uuid;--> statement-breakpoint
ALTER TABLE "fixture" ADD COLUMN "branch_id" uuid DEFAULT '00000000-0000-4000-8000-000000000001' NOT NULL;--> statement-breakpoint
ALTER TABLE "purchase_order" ADD COLUMN "branch_id" uuid DEFAULT '00000000-0000-4000-8000-000000000001' NOT NULL;--> statement-breakpoint
ALTER TABLE "stock_count" ADD COLUMN "branch_id" uuid DEFAULT '00000000-0000-4000-8000-000000000001' NOT NULL;--> statement-breakpoint
ALTER TABLE "stock_move" ADD COLUMN "branch_id" uuid DEFAULT '00000000-0000-4000-8000-000000000001' NOT NULL;--> statement-breakpoint
ALTER TABLE "chemical" ADD COLUMN "branch_id" uuid DEFAULT '00000000-0000-4000-8000-000000000001' NOT NULL;--> statement-breakpoint
ALTER TABLE "hazard_assessment" ADD COLUMN "branch_id" uuid DEFAULT '00000000-0000-4000-8000-000000000001' NOT NULL;--> statement-breakpoint
ALTER TABLE "incident" ADD COLUMN "branch_id" uuid DEFAULT '00000000-0000-4000-8000-000000000001' NOT NULL;--> statement-breakpoint
ALTER TABLE "daily_close" ADD COLUMN "branch_id" uuid DEFAULT '00000000-0000-4000-8000-000000000001' NOT NULL;--> statement-breakpoint
ALTER TABLE "expense" ADD COLUMN "branch_id" uuid DEFAULT '00000000-0000-4000-8000-000000000001' NOT NULL;--> statement-breakpoint
ALTER TABLE "payment" ADD COLUMN "branch_id" uuid DEFAULT '00000000-0000-4000-8000-000000000001' NOT NULL;--> statement-breakpoint
ALTER TABLE "daily_journal" ADD COLUMN "branch_id" uuid DEFAULT '00000000-0000-4000-8000-000000000001' NOT NULL;--> statement-breakpoint
ALTER TABLE "workplace" ADD CONSTRAINT "workplace_branch_id_branch_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branch"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workplace" ADD CONSTRAINT "workplace_manager_id_app_user_id_fk" FOREIGN KEY ("manager_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "branch_name_uq" ON "branch" USING btree ("name");--> statement-breakpoint
CREATE UNIQUE INDEX "workplace_branch_name_uq" ON "workplace" USING btree ("branch_id","name");--> statement-breakpoint
ALTER TABLE "consultation" ADD CONSTRAINT "consultation_branch_id_branch_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branch"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repair_order" ADD CONSTRAINT "repair_order_branch_id_branch_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branch"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_step" ADD CONSTRAINT "work_step_workplace_id_workplace_id_fk" FOREIGN KEY ("workplace_id") REFERENCES "public"."workplace"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_profile" ADD CONSTRAINT "staff_profile_home_branch_id_branch_id_fk" FOREIGN KEY ("home_branch_id") REFERENCES "public"."branch"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_day" ADD CONSTRAINT "work_day_branch_id_branch_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branch"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipment" ADD CONSTRAINT "equipment_branch_id_branch_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branch"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipment" ADD CONSTRAINT "equipment_workplace_id_workplace_id_fk" FOREIGN KEY ("workplace_id") REFERENCES "public"."workplace"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tool" ADD CONSTRAINT "tool_branch_id_branch_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branch"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "five_s_zone" ADD CONSTRAINT "five_s_zone_branch_id_branch_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branch"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "five_s_zone" ADD CONSTRAINT "five_s_zone_workplace_id_workplace_id_fk" FOREIGN KEY ("workplace_id") REFERENCES "public"."workplace"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fixture" ADD CONSTRAINT "fixture_branch_id_branch_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branch"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order" ADD CONSTRAINT "purchase_order_branch_id_branch_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branch"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_count" ADD CONSTRAINT "stock_count_branch_id_branch_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branch"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_move" ADD CONSTRAINT "stock_move_branch_id_branch_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branch"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chemical" ADD CONSTRAINT "chemical_branch_id_branch_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branch"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hazard_assessment" ADD CONSTRAINT "hazard_assessment_branch_id_branch_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branch"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incident" ADD CONSTRAINT "incident_branch_id_branch_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branch"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_close" ADD CONSTRAINT "daily_close_branch_id_branch_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branch"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense" ADD CONSTRAINT "expense_branch_id_branch_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branch"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment" ADD CONSTRAINT "payment_branch_id_branch_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branch"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_journal" ADD CONSTRAINT "daily_journal_branch_id_branch_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branch"("id") ON DELETE no action ON UPDATE no action;