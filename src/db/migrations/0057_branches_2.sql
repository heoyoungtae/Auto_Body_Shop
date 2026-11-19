CREATE TABLE "user_branch" (
	"user_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"roles" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_branch_user_id_branch_id_pk" PRIMARY KEY("user_id","branch_id")
);
--> statement-breakpoint
CREATE TABLE "user_branch_pref" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"branch_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_transfer" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"doc_no" text NOT NULL,
	"from_branch_id" uuid NOT NULL,
	"to_branch_id" uuid NOT NULL,
	"status" text DEFAULT 'sent' NOT NULL,
	"lines" jsonb NOT NULL,
	"amount_won" integer DEFAULT 0 NOT NULL,
	"note" text,
	"sent_by" uuid NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"received_by" uuid,
	"received_at" timestamp with time zone,
	"received_note" text,
	CONSTRAINT "stock_transfer_doc_no_unique" UNIQUE("doc_no")
);
--> statement-breakpoint
DROP INDEX "daily_close_day_uq";--> statement-breakpoint
ALTER TABLE "branch" ADD COLUMN "seal_path" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "user_branch" ADD CONSTRAINT "user_branch_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_branch" ADD CONSTRAINT "user_branch_branch_id_branch_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branch"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_branch_pref" ADD CONSTRAINT "user_branch_pref_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_branch_pref" ADD CONSTRAINT "user_branch_pref_branch_id_branch_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branch"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_transfer" ADD CONSTRAINT "stock_transfer_from_branch_id_branch_id_fk" FOREIGN KEY ("from_branch_id") REFERENCES "public"."branch"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_transfer" ADD CONSTRAINT "stock_transfer_to_branch_id_branch_id_fk" FOREIGN KEY ("to_branch_id") REFERENCES "public"."branch"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_transfer" ADD CONSTRAINT "stock_transfer_sent_by_app_user_id_fk" FOREIGN KEY ("sent_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_transfer" ADD CONSTRAINT "stock_transfer_received_by_app_user_id_fk" FOREIGN KEY ("received_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "daily_close_branch_day_uq" ON "daily_close" USING btree ("branch_id","day");