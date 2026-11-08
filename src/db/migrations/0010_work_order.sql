CREATE TABLE "work_order" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"doc_no" text NOT NULL,
	"repair_order_id" uuid NOT NULL,
	"estimate_id" uuid NOT NULL,
	"status" text DEFAULT 'planned' NOT NULL,
	"due_date" text,
	"note" text,
	"created_by" uuid,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "work_step" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"work_order_id" uuid NOT NULL,
	"seq" integer NOT NULL,
	"process" text NOT NULL,
	"line_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"assignee" uuid,
	"plan_date" text,
	"std_minutes" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone,
	"started_by" uuid,
	"ended_at" timestamp with time zone,
	"ended_by" uuid,
	"actual_minutes" integer,
	"checks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"photos" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"detail" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"note" text
);
--> statement-breakpoint
ALTER TABLE "work_order" ADD CONSTRAINT "work_order_repair_order_id_repair_order_id_fk" FOREIGN KEY ("repair_order_id") REFERENCES "public"."repair_order"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_order" ADD CONSTRAINT "work_order_estimate_id_estimate_id_fk" FOREIGN KEY ("estimate_id") REFERENCES "public"."estimate"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_order" ADD CONSTRAINT "work_order_created_by_app_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_step" ADD CONSTRAINT "work_step_work_order_id_work_order_id_fk" FOREIGN KEY ("work_order_id") REFERENCES "public"."work_order"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_step" ADD CONSTRAINT "work_step_assignee_app_user_id_fk" FOREIGN KEY ("assignee") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_step" ADD CONSTRAINT "work_step_started_by_app_user_id_fk" FOREIGN KEY ("started_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_step" ADD CONSTRAINT "work_step_ended_by_app_user_id_fk" FOREIGN KEY ("ended_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "work_order_no_uq" ON "work_order" USING btree ("doc_no");--> statement-breakpoint
CREATE INDEX "work_order_ro_idx" ON "work_order" USING btree ("repair_order_id");--> statement-breakpoint
CREATE INDEX "work_step_wo_idx" ON "work_step" USING btree ("work_order_id");