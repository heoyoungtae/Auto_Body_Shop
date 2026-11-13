CREATE TABLE "acct_opening" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"on" text NOT NULL,
	"code" text NOT NULL,
	"won" integer NOT NULL,
	"note" text,
	"by" uuid,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fund_slip" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"doc_no" text NOT NULL,
	"on" text NOT NULL,
	"kind" text NOT NULL,
	"dr_code" text NOT NULL,
	"cr_code" text NOT NULL,
	"amount_won" integer NOT NULL,
	"memo" text,
	"bank_tx_id" uuid,
	"reversal_of" uuid,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "acct_opening" ADD CONSTRAINT "acct_opening_by_app_user_id_fk" FOREIGN KEY ("by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fund_slip" ADD CONSTRAINT "fund_slip_bank_tx_id_bank_tx_id_fk" FOREIGN KEY ("bank_tx_id") REFERENCES "public"."bank_tx"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fund_slip" ADD CONSTRAINT "fund_slip_created_by_app_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "acct_opening_code_uq" ON "acct_opening" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "fund_slip_no_uq" ON "fund_slip" USING btree ("doc_no");--> statement-breakpoint
CREATE INDEX "fund_slip_on_idx" ON "fund_slip" USING btree ("on");