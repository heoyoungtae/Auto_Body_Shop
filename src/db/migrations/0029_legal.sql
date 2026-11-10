CREATE TABLE "legal_eval_year" (
	"year" integer PRIMARY KEY NOT NULL,
	"confirmed_by" uuid,
	"confirmed_at" timestamp with time zone,
	"summary" text
);
--> statement-breakpoint
CREATE TABLE "legal_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"year" integer,
	"result" text,
	"changed" boolean,
	"fix_due" text,
	"nc_id" uuid,
	"detail" text,
	"by" uuid,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "legal_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"area" text NOT NULL,
	"law_name" text NOT NULL,
	"clause" text,
	"duty" text NOT NULL,
	"std_ref" text,
	"applies" text DEFAULT 'check' NOT NULL,
	"basis" text,
	"owner_id" uuid,
	"cycle" text DEFAULT 'none' NOT NULL,
	"next_due" text,
	"evidence" text,
	"authority" text,
	"permit_no" text,
	"valid_until" text,
	"rev_checked_on" text,
	"active" boolean DEFAULT true NOT NULL,
	"note" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "legal_eval_year" ADD CONSTRAINT "legal_eval_year_confirmed_by_app_user_id_fk" FOREIGN KEY ("confirmed_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legal_event" ADD CONSTRAINT "legal_event_item_id_legal_item_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."legal_item"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legal_event" ADD CONSTRAINT "legal_event_by_app_user_id_fk" FOREIGN KEY ("by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legal_item" ADD CONSTRAINT "legal_item_owner_id_app_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legal_item" ADD CONSTRAINT "legal_item_created_by_app_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "legal_event_item_idx" ON "legal_event" USING btree ("item_id","at");--> statement-breakpoint
CREATE INDEX "legal_item_due_idx" ON "legal_item" USING btree ("next_due");