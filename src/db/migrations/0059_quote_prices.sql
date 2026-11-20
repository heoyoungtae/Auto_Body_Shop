CREATE TABLE "price_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" uuid NOT NULL,
	"supplier_id" uuid,
	"before_won" integer,
	"after_won" integer NOT NULL,
	"source" text NOT NULL,
	"ref" text,
	"quote_id" uuid,
	"by" uuid,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "price_quote" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"doc_no" text NOT NULL,
	"supplier_id" uuid,
	"read_biz_no" text,
	"read_name" text,
	"quoted_on" text NOT NULL,
	"valid_until" text,
	"vat_mode" text DEFAULT 'excluded' NOT NULL,
	"source" text NOT NULL,
	"file_name" text,
	"path" text,
	"lines" jsonb NOT NULL,
	"read_total_won" integer,
	"total_won" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"added" integer DEFAULT 0 NOT NULL,
	"updated" integer DEFAULT 0 NOT NULL,
	"skipped" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"done_at" timestamp with time zone,
	CONSTRAINT "price_quote_doc_no_unique" UNIQUE("doc_no")
);
--> statement-breakpoint
CREATE TABLE "supplier_price" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" uuid NOT NULL,
	"supplier_id" uuid NOT NULL,
	"unit_won" integer NOT NULL,
	"vat_mode" text DEFAULT 'excluded' NOT NULL,
	"sup_name" text,
	"sup_unit" text,
	"pack_qty" integer,
	"quoted_on" text,
	"valid_until" text,
	"source" text NOT NULL,
	"ref" text,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "stock_item" ADD COLUMN "track_mode" text DEFAULT 'qty' NOT NULL;--> statement-breakpoint
ALTER TABLE "stock_item" ADD COLUMN "buy_unit" text;--> statement-breakpoint
ALTER TABLE "stock_item" ADD COLUMN "buy_qty" integer;--> statement-breakpoint
ALTER TABLE "price_history" ADD CONSTRAINT "price_history_item_id_stock_item_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."stock_item"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_history" ADD CONSTRAINT "price_history_supplier_id_supplier_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."supplier"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_history" ADD CONSTRAINT "price_history_by_app_user_id_fk" FOREIGN KEY ("by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_quote" ADD CONSTRAINT "price_quote_supplier_id_supplier_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."supplier"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_quote" ADD CONSTRAINT "price_quote_created_by_app_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_price" ADD CONSTRAINT "supplier_price_item_id_stock_item_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."stock_item"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_price" ADD CONSTRAINT "supplier_price_supplier_id_supplier_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."supplier"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_price" ADD CONSTRAINT "supplier_price_updated_by_app_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "price_history_item_idx" ON "price_history" USING btree ("item_id","at");--> statement-breakpoint
CREATE INDEX "price_quote_sup_idx" ON "price_quote" USING btree ("supplier_id");--> statement-breakpoint
CREATE UNIQUE INDEX "supplier_price_item_sup_idx" ON "supplier_price" USING btree ("item_id","supplier_id");--> statement-breakpoint
CREATE INDEX "supplier_price_sup_idx" ON "supplier_price" USING btree ("supplier_id");--> statement-breakpoint
INSERT INTO "supplier_price" ("item_id", "supplier_id", "unit_won", "vat_mode", "source", "updated_at")
SELECT "id", "supplier_id", "unit_won", "vat_mode", 'manual', "updated_at" FROM "stock_item" WHERE "supplier_id" IS NOT NULL AND "unit_won" > 0;
