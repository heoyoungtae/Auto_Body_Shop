CREATE TABLE "audit_finding" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"audit_id" uuid NOT NULL,
	"chapter" text NOT NULL,
	"target" text,
	"evidence" text NOT NULL,
	"finding" text,
	"verdict" text NOT NULL,
	"nc_id" uuid,
	"by" uuid,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "internal_audit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"doc_no" text NOT NULL,
	"year" integer NOT NULL,
	"planned_on" text NOT NULL,
	"scope" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"auditor_id" uuid,
	"external_auditor" text,
	"auditee_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"criteria" text,
	"status" text DEFAULT 'planned' NOT NULL,
	"summary" text,
	"reported_at" timestamp with time zone,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "risk_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"risk_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"detail" text,
	"by" uuid,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "risk_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"doc_no" text NOT NULL,
	"kind" text DEFAULT 'risk' NOT NULL,
	"content" text NOT NULL,
	"chapter" text,
	"likelihood" integer NOT NULL,
	"impact" integer NOT NULL,
	"score" integer NOT NULL,
	"control" text,
	"plan" text,
	"owner_id" uuid,
	"due" text,
	"result" text,
	"status" text DEFAULT 'open' NOT NULL,
	"source" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "risk_review" (
	"quarter" text PRIMARY KEY NOT NULL,
	"by" uuid,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"summary" text,
	"note" text
);
--> statement-breakpoint
ALTER TABLE "audit_finding" ADD CONSTRAINT "audit_finding_audit_id_internal_audit_id_fk" FOREIGN KEY ("audit_id") REFERENCES "public"."internal_audit"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_finding" ADD CONSTRAINT "audit_finding_by_app_user_id_fk" FOREIGN KEY ("by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "internal_audit" ADD CONSTRAINT "internal_audit_auditor_id_app_user_id_fk" FOREIGN KEY ("auditor_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "internal_audit" ADD CONSTRAINT "internal_audit_approved_by_app_user_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "internal_audit" ADD CONSTRAINT "internal_audit_created_by_app_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risk_event" ADD CONSTRAINT "risk_event_risk_id_risk_item_id_fk" FOREIGN KEY ("risk_id") REFERENCES "public"."risk_item"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risk_event" ADD CONSTRAINT "risk_event_by_app_user_id_fk" FOREIGN KEY ("by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risk_item" ADD CONSTRAINT "risk_item_owner_id_app_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risk_item" ADD CONSTRAINT "risk_item_created_by_app_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risk_review" ADD CONSTRAINT "risk_review_by_app_user_id_fk" FOREIGN KEY ("by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_finding_idx" ON "audit_finding" USING btree ("audit_id");--> statement-breakpoint
CREATE UNIQUE INDEX "internal_audit_no_uq" ON "internal_audit" USING btree ("doc_no");--> statement-breakpoint
CREATE INDEX "internal_audit_year_idx" ON "internal_audit" USING btree ("year");--> statement-breakpoint
CREATE INDEX "risk_event_idx" ON "risk_event" USING btree ("risk_id","at");--> statement-breakpoint
CREATE UNIQUE INDEX "risk_item_no_uq" ON "risk_item" USING btree ("doc_no");--> statement-breakpoint
CREATE INDEX "risk_item_status_idx" ON "risk_item" USING btree ("status");