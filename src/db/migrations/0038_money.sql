CREATE TABLE "ar_follow" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"repair_order_id" uuid NOT NULL,
	"note" text NOT NULL,
	"promised_on" text,
	"by" uuid,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "daily_close" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"day" text NOT NULL,
	"card_won" integer NOT NULL,
	"cash_won" integer NOT NULL,
	"transfer_won" integer NOT NULL,
	"card_terminal_won" integer NOT NULL,
	"cash_counted_won" integer NOT NULL,
	"diff_won" integer NOT NULL,
	"note" text,
	"closed_by" uuid,
	"closed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "expense" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"doc_no" text NOT NULL,
	"approval_doc_id" uuid NOT NULL,
	"category" text NOT NULL,
	"supplier_id" uuid,
	"payee_name" text NOT NULL,
	"source_kind" text DEFAULT 'none' NOT NULL,
	"source_id" uuid,
	"source_no" text,
	"purpose" text NOT NULL,
	"supply_won" integer NOT NULL,
	"vat_won" integer DEFAULT 0 NOT NULL,
	"amount_won" integer NOT NULL,
	"evidence_kind" text NOT NULL,
	"evidence_no" text,
	"evidence_on" text,
	"files" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"due_on" text,
	"pay_method" text NOT NULL,
	"paid_on" text,
	"paid_at" timestamp with time zone,
	"paid_by" uuid,
	"paid_to" text,
	"paid_note" text,
	"cancelled_at" timestamp with time zone,
	"cancelled_by" uuid,
	"cancel_reason" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "month_close" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ym" text NOT NULL,
	"status" text NOT NULL,
	"snapshot" jsonb NOT NULL,
	"note" text,
	"prepared_by" uuid,
	"prepared_at" timestamp with time zone NOT NULL,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"return_note" text
);
--> statement-breakpoint
CREATE TABLE "payment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"doc_no" text NOT NULL,
	"repair_order_id" uuid NOT NULL,
	"method" text NOT NULL,
	"amount_won" integer NOT NULL,
	"received_on" text NOT NULL,
	"receipt_kind" text NOT NULL,
	"receipt_no" text,
	"payer_name" text,
	"note" text,
	"reversal_of" uuid,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ar_follow" ADD CONSTRAINT "ar_follow_repair_order_id_repair_order_id_fk" FOREIGN KEY ("repair_order_id") REFERENCES "public"."repair_order"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ar_follow" ADD CONSTRAINT "ar_follow_by_app_user_id_fk" FOREIGN KEY ("by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_close" ADD CONSTRAINT "daily_close_closed_by_app_user_id_fk" FOREIGN KEY ("closed_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense" ADD CONSTRAINT "expense_approval_doc_id_approval_doc_id_fk" FOREIGN KEY ("approval_doc_id") REFERENCES "public"."approval_doc"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense" ADD CONSTRAINT "expense_supplier_id_supplier_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."supplier"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense" ADD CONSTRAINT "expense_paid_by_app_user_id_fk" FOREIGN KEY ("paid_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense" ADD CONSTRAINT "expense_cancelled_by_app_user_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense" ADD CONSTRAINT "expense_created_by_app_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "month_close" ADD CONSTRAINT "month_close_prepared_by_app_user_id_fk" FOREIGN KEY ("prepared_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "month_close" ADD CONSTRAINT "month_close_approved_by_app_user_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment" ADD CONSTRAINT "payment_repair_order_id_repair_order_id_fk" FOREIGN KEY ("repair_order_id") REFERENCES "public"."repair_order"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment" ADD CONSTRAINT "payment_created_by_app_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ar_follow_ro_idx" ON "ar_follow" USING btree ("repair_order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "daily_close_day_uq" ON "daily_close" USING btree ("day");--> statement-breakpoint
CREATE UNIQUE INDEX "expense_no_uq" ON "expense" USING btree ("doc_no");--> statement-breakpoint
CREATE INDEX "expense_source_idx" ON "expense" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "expense_supplier_idx" ON "expense" USING btree ("supplier_id");--> statement-breakpoint
CREATE UNIQUE INDEX "month_close_ym_uq" ON "month_close" USING btree ("ym");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_no_uq" ON "payment" USING btree ("doc_no");--> statement-breakpoint
CREATE INDEX "payment_ro_idx" ON "payment" USING btree ("repair_order_id");--> statement-breakpoint
CREATE INDEX "payment_on_idx" ON "payment" USING btree ("received_on");