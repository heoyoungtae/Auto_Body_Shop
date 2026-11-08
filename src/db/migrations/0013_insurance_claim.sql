CREATE TABLE "insurance_claim" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"doc_no" text NOT NULL,
	"repair_order_id" uuid NOT NULL,
	"status" text DEFAULT 'info' NOT NULL,
	"insurer" text NOT NULL,
	"claim_no" text NOT NULL,
	"coverage" text NOT NULL,
	"fault_pct" integer,
	"deductible_won" integer DEFAULT 0 NOT NULL,
	"adjuster_name" text,
	"adjuster_phone" text,
	"requested_at" timestamp with time zone,
	"requested_by" uuid,
	"request_note" text,
	"adjusted_won" integer,
	"customer_extra_won" integer DEFAULT 0 NOT NULL,
	"scope_note" text,
	"scoped_at" timestamp with time zone,
	"scoped_by" uuid,
	"claimed_won" integer,
	"docs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"claimed_at" timestamp with time zone,
	"claimed_by" uuid,
	"paid_on" text,
	"paid_won" integer,
	"cut_won" integer,
	"cut_reason" text,
	"paid_by" uuid,
	"dunned_at" timestamp with time zone,
	"dun_note" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "insurance_claim" ADD CONSTRAINT "insurance_claim_repair_order_id_repair_order_id_fk" FOREIGN KEY ("repair_order_id") REFERENCES "public"."repair_order"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "insurance_claim" ADD CONSTRAINT "insurance_claim_requested_by_app_user_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "insurance_claim" ADD CONSTRAINT "insurance_claim_scoped_by_app_user_id_fk" FOREIGN KEY ("scoped_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "insurance_claim" ADD CONSTRAINT "insurance_claim_claimed_by_app_user_id_fk" FOREIGN KEY ("claimed_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "insurance_claim" ADD CONSTRAINT "insurance_claim_paid_by_app_user_id_fk" FOREIGN KEY ("paid_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "insurance_claim" ADD CONSTRAINT "insurance_claim_created_by_app_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "insurance_claim_no_uq" ON "insurance_claim" USING btree ("doc_no");--> statement-breakpoint
CREATE UNIQUE INDEX "insurance_claim_ro_uq" ON "insurance_claim" USING btree ("repair_order_id");--> statement-breakpoint
CREATE INDEX "insurance_claim_status_idx" ON "insurance_claim" USING btree ("status");