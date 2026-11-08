CREATE TABLE "inspection" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"repair_order_id" uuid NOT NULL,
	"work_order_id" uuid NOT NULL,
	"round" integer DEFAULT 1 NOT NULL,
	"inspector" uuid NOT NULL,
	"independence_note" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"passed" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"gap_mm_x10" integer,
	"film_um" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"photos" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"result" text,
	"fails" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"fail_note" text,
	"judged_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "repair_statement" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"doc_no" text NOT NULL,
	"repair_order_id" uuid NOT NULL,
	"estimate_id" uuid NOT NULL,
	"snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"parts_won" integer DEFAULT 0 NOT NULL,
	"labor_won" integer DEFAULT 0 NOT NULL,
	"vat_won" integer DEFAULT 0 NOT NULL,
	"total_won" integer DEFAULT 0 NOT NULL,
	"mileage_out" integer,
	"issued_on" text NOT NULL,
	"issued_by" uuid,
	"pay_method" text,
	"notices" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"receiver_name" text,
	"proxy" boolean DEFAULT false NOT NULL,
	"proxy_note" text,
	"signature" text,
	"delivered_at" timestamp with time zone,
	"delivered_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "repair_order" ADD COLUMN "ready_notice_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "inspection" ADD CONSTRAINT "inspection_repair_order_id_repair_order_id_fk" FOREIGN KEY ("repair_order_id") REFERENCES "public"."repair_order"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspection" ADD CONSTRAINT "inspection_work_order_id_work_order_id_fk" FOREIGN KEY ("work_order_id") REFERENCES "public"."work_order"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspection" ADD CONSTRAINT "inspection_inspector_app_user_id_fk" FOREIGN KEY ("inspector") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repair_statement" ADD CONSTRAINT "repair_statement_repair_order_id_repair_order_id_fk" FOREIGN KEY ("repair_order_id") REFERENCES "public"."repair_order"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repair_statement" ADD CONSTRAINT "repair_statement_estimate_id_estimate_id_fk" FOREIGN KEY ("estimate_id") REFERENCES "public"."estimate"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repair_statement" ADD CONSTRAINT "repair_statement_issued_by_app_user_id_fk" FOREIGN KEY ("issued_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repair_statement" ADD CONSTRAINT "repair_statement_delivered_by_app_user_id_fk" FOREIGN KEY ("delivered_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "inspection_ro_idx" ON "inspection" USING btree ("repair_order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "repair_statement_no_uq" ON "repair_statement" USING btree ("doc_no");--> statement-breakpoint
CREATE INDEX "repair_statement_ro_idx" ON "repair_statement" USING btree ("repair_order_id");