CREATE TABLE "fixture" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"no" text NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"spec" text,
	"purchased_on" text,
	"price_won" integer DEFAULT 0 NOT NULL,
	"asset" boolean DEFAULT false NOT NULL,
	"location" text,
	"holder_id" uuid,
	"received_at" timestamp with time zone,
	"warranty_until" text,
	"supplier_id" uuid,
	"expense_ref" text,
	"labeled_at" timestamp with time zone,
	"status" text DEFAULT 'in_use' NOT NULL,
	"note" text,
	"disposed_on" text,
	"dispose_method" text,
	"dispose_note" text,
	"data_wiped" boolean,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fixture_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fixture_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"detail" text,
	"by" uuid,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "fixture" ADD CONSTRAINT "fixture_holder_id_app_user_id_fk" FOREIGN KEY ("holder_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fixture" ADD CONSTRAINT "fixture_supplier_id_supplier_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."supplier"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fixture" ADD CONSTRAINT "fixture_created_by_app_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fixture_event" ADD CONSTRAINT "fixture_event_fixture_id_fixture_id_fk" FOREIGN KEY ("fixture_id") REFERENCES "public"."fixture"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fixture_event" ADD CONSTRAINT "fixture_event_by_app_user_id_fk" FOREIGN KEY ("by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "fixture_no_uq" ON "fixture" USING btree ("no");--> statement-breakpoint
CREATE INDEX "fixture_holder_idx" ON "fixture" USING btree ("holder_id");--> statement-breakpoint
CREATE INDEX "fixture_event_fx_idx" ON "fixture_event" USING btree ("fixture_id","at");