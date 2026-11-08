CREATE TABLE "estimate" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"doc_no" text NOT NULL,
	"repair_order_id" uuid NOT NULL,
	"rev" integer DEFAULT 1 NOT NULL,
	"kind" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"paint_grade" text DEFAULT 'solid' NOT NULL,
	"snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"parts_won" integer DEFAULT 0 NOT NULL,
	"labor_won" integer DEFAULT 0 NOT NULL,
	"vat_won" integer DEFAULT 0 NOT NULL,
	"total_won" integer DEFAULT 0 NOT NULL,
	"due_date" text,
	"issued_on" text,
	"valid_until" text,
	"note" text,
	"created_by" uuid,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "estimate_line" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"estimate_id" uuid NOT NULL,
	"seq" integer NOT NULL,
	"payer" text DEFAULT 'general' NOT NULL,
	"category" text NOT NULL,
	"damage_id" uuid,
	"labor_code" text,
	"name" text NOT NULL,
	"part_code" text,
	"part_no" text,
	"qty" integer DEFAULT 1 NOT NULL,
	"unit_won" integer DEFAULT 0 NOT NULL,
	"labor_minutes" integer DEFAULT 0 NOT NULL,
	"labor_won" integer DEFAULT 0 NOT NULL,
	"approved" boolean,
	"note" text
);
--> statement-breakpoint
ALTER TABLE "vehicle" ADD COLUMN "registered_on" date;--> statement-breakpoint
ALTER TABLE "estimate" ADD CONSTRAINT "estimate_repair_order_id_repair_order_id_fk" FOREIGN KEY ("repair_order_id") REFERENCES "public"."repair_order"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estimate" ADD CONSTRAINT "estimate_created_by_app_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estimate" ADD CONSTRAINT "estimate_reviewed_by_app_user_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estimate_line" ADD CONSTRAINT "estimate_line_estimate_id_estimate_id_fk" FOREIGN KEY ("estimate_id") REFERENCES "public"."estimate"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "estimate_no_uq" ON "estimate" USING btree ("doc_no");--> statement-breakpoint
CREATE INDEX "estimate_ro_idx" ON "estimate" USING btree ("repair_order_id");--> statement-breakpoint
CREATE INDEX "estimate_line_est_idx" ON "estimate_line" USING btree ("estimate_id");