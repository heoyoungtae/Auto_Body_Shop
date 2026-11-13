CREATE TABLE "budget_line" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ym" text NOT NULL,
	"key" text NOT NULL,
	"won" integer NOT NULL,
	"by" uuid,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mgmt_report" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ym" text NOT NULL,
	"approval_doc_id" uuid NOT NULL,
	"sections" jsonb NOT NULL,
	"comment" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "report_snapshot" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ym" text NOT NULL,
	"report_id" text NOT NULL,
	"body" jsonb NOT NULL,
	"saved_by" uuid,
	"saved_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "budget_line" ADD CONSTRAINT "budget_line_by_app_user_id_fk" FOREIGN KEY ("by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mgmt_report" ADD CONSTRAINT "mgmt_report_created_by_app_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_snapshot" ADD CONSTRAINT "report_snapshot_saved_by_app_user_id_fk" FOREIGN KEY ("saved_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "budget_line_uq" ON "budget_line" USING btree ("ym","key");--> statement-breakpoint
CREATE INDEX "mgmt_report_ym_idx" ON "mgmt_report" USING btree ("ym");--> statement-breakpoint
CREATE UNIQUE INDEX "report_snapshot_uq" ON "report_snapshot" USING btree ("ym","report_id");