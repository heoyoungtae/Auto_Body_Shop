CREATE TABLE "payable" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"supplier_id" uuid,
	"payee_name" text NOT NULL,
	"source_kind" text NOT NULL,
	"source_id" uuid NOT NULL,
	"source_no" text NOT NULL,
	"category" text NOT NULL,
	"split" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"supply_won" integer NOT NULL,
	"vat_won" integer NOT NULL,
	"amount_won" integer NOT NULL,
	"accrued_on" text NOT NULL,
	"due_on" text NOT NULL,
	"pay_term" text NOT NULL,
	"invoice_no" text,
	"settle_expense_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "purchase_order" ADD COLUMN "pay_term" text;--> statement-breakpoint
ALTER TABLE "purchase_order" ADD COLUMN "pay_day" integer;--> statement-breakpoint
ALTER TABLE "supplier" ADD COLUMN "pay_term" text DEFAULT 'next_end' NOT NULL;--> statement-breakpoint
ALTER TABLE "supplier" ADD COLUMN "pay_day" integer;--> statement-breakpoint
ALTER TABLE "payable" ADD CONSTRAINT "payable_supplier_id_supplier_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."supplier"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payable" ADD CONSTRAINT "payable_settle_expense_id_expense_id_fk" FOREIGN KEY ("settle_expense_id") REFERENCES "public"."expense"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payable_supplier_idx" ON "payable" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "payable_source_idx" ON "payable" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "payable_settle_idx" ON "payable" USING btree ("settle_expense_id");