CREATE TABLE "bank_import" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"file_kind" text NOT NULL,
	"file_name" text NOT NULL,
	"account_id" text,
	"row_count" integer NOT NULL,
	"added" integer NOT NULL,
	"dup" integer NOT NULL,
	"skipped" integer NOT NULL,
	"columns" text,
	"first_on" text,
	"last_on" text,
	"by" uuid,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"undone_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "bank_tx" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"account_id" text,
	"account_label" text,
	"on" text NOT NULL,
	"at" text,
	"amount_won" integer NOT NULL,
	"balance_won" integer,
	"party" text,
	"party_biz_no" text,
	"memo" text,
	"approval_no" text,
	"supply_won" integer,
	"vat_won" integer,
	"source" text NOT NULL,
	"import_id" uuid,
	"raw" text,
	"dedupe_key" text NOT NULL,
	"match_kind" text,
	"match_id" text,
	"match_no" text,
	"cls" text,
	"match_note" text,
	"matched_auto" boolean DEFAULT false NOT NULL,
	"matched_by" uuid,
	"matched_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bank_import" ADD CONSTRAINT "bank_import_by_app_user_id_fk" FOREIGN KEY ("by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_tx" ADD CONSTRAINT "bank_tx_matched_by_app_user_id_fk" FOREIGN KEY ("matched_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "bank_tx_dedupe_uq" ON "bank_tx" USING btree ("dedupe_key");--> statement-breakpoint
CREATE INDEX "bank_tx_on_idx" ON "bank_tx" USING btree ("on");--> statement-breakpoint
CREATE INDEX "bank_tx_match_idx" ON "bank_tx" USING btree ("match_kind","match_id");--> statement-breakpoint
CREATE INDEX "bank_tx_import_idx" ON "bank_tx" USING btree ("import_id");