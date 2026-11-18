CREATE TABLE "portal_order" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"platform" text NOT NULL,
	"ext_id" text NOT NULL,
	"ext_no" text,
	"requested_at" text,
	"plate_no" text,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"consultation_id" uuid,
	"posted" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ar_bill" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"doc_no" text NOT NULL,
	"customer_id" uuid NOT NULL,
	"ym" text NOT NULL,
	"issued_on" text NOT NULL,
	"due_on" text NOT NULL,
	"pay_term" text NOT NULL,
	"supply_won" integer NOT NULL,
	"vat_won" integer NOT NULL,
	"total_won" integer NOT NULL,
	"tax_invoice_no" text,
	"tax_invoice_on" text,
	"note" text,
	"cancelled_at" timestamp with time zone,
	"cancel_reason" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "customer" ADD COLUMN "kind" text DEFAULT 'person' NOT NULL;--> statement-breakpoint
ALTER TABLE "customer" ADD COLUMN "biz_no" text;--> statement-breakpoint
ALTER TABLE "customer" ADD COLUMN "contact_name" text;--> statement-breakpoint
ALTER TABLE "customer" ADD COLUMN "tax_email" text;--> statement-breakpoint
ALTER TABLE "customer" ADD COLUMN "pay_term" text;--> statement-breakpoint
ALTER TABLE "customer" ADD COLUMN "pay_day" integer;--> statement-breakpoint
ALTER TABLE "customer" ADD COLUMN "credit_limit_won" integer;--> statement-breakpoint
ALTER TABLE "customer" ADD COLUMN "invoice_mode" text DEFAULT 'monthly' NOT NULL;--> statement-breakpoint
ALTER TABLE "customer" ADD COLUMN "portal" text;--> statement-breakpoint
ALTER TABLE "customer" ADD COLUMN "portal_url" text;--> statement-breakpoint
ALTER TABLE "customer" ADD COLUMN "portal_note" text;--> statement-breakpoint
ALTER TABLE "repair_statement" ADD COLUMN "credit_due_on" text;--> statement-breakpoint
ALTER TABLE "repair_statement" ADD COLUMN "bill_id" uuid;--> statement-breakpoint
ALTER TABLE "payment" ADD COLUMN "bill_id" uuid;--> statement-breakpoint
ALTER TABLE "portal_order" ADD CONSTRAINT "portal_order_customer_id_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customer"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portal_order" ADD CONSTRAINT "portal_order_consultation_id_consultation_id_fk" FOREIGN KEY ("consultation_id") REFERENCES "public"."consultation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portal_order" ADD CONSTRAINT "portal_order_created_by_app_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ar_bill" ADD CONSTRAINT "ar_bill_customer_id_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customer"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ar_bill" ADD CONSTRAINT "ar_bill_created_by_app_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "portal_order_ext_uq" ON "portal_order" USING btree ("platform","ext_id");--> statement-breakpoint
CREATE INDEX "portal_order_consult_idx" ON "portal_order" USING btree ("consultation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ar_bill_no_uq" ON "ar_bill" USING btree ("doc_no");--> statement-breakpoint
CREATE INDEX "ar_bill_customer_idx" ON "ar_bill" USING btree ("customer_id");