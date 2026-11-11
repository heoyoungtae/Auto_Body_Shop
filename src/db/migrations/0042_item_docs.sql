CREATE TABLE "stock_item_doc" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"title" text,
	"issuer" text,
	"issued_on" text,
	"expires_on" text,
	"result" text,
	"lot" text,
	"path" text,
	"file_name" text,
	"note" text,
	"active" boolean DEFAULT true NOT NULL,
	"uploaded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "stock_item" ADD COLUMN "vat_mode" text DEFAULT 'excluded' NOT NULL;--> statement-breakpoint
ALTER TABLE "stock_item" ADD COLUMN "pack_amount" double precision;--> statement-breakpoint
ALTER TABLE "stock_item" ADD COLUMN "pack_unit" text;--> statement-breakpoint
ALTER TABLE "stock_item" ADD COLUMN "exp_category" text;--> statement-breakpoint
ALTER TABLE "stock_item" ADD COLUMN "chemical_id" uuid;--> statement-breakpoint
ALTER TABLE "stock_item" ADD COLUMN "wind_down" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "stock_item" ADD COLUMN "stop_reason" text;--> statement-breakpoint
ALTER TABLE "stock_item" ADD COLUMN "stop_note" text;--> statement-breakpoint
ALTER TABLE "stock_item" ADD COLUMN "replaced_by_id" uuid;--> statement-breakpoint
ALTER TABLE "stock_item" ADD COLUMN "stopped_by" uuid;--> statement-breakpoint
ALTER TABLE "stock_item" ADD COLUMN "stopped_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "expense" ADD COLUMN "split" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "stock_item_doc" ADD CONSTRAINT "stock_item_doc_item_id_stock_item_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."stock_item"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_item_doc" ADD CONSTRAINT "stock_item_doc_uploaded_by_app_user_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "stock_item_doc_item_idx" ON "stock_item_doc" USING btree ("item_id");--> statement-breakpoint
ALTER TABLE "stock_item" ADD CONSTRAINT "stock_item_chemical_id_chemical_id_fk" FOREIGN KEY ("chemical_id") REFERENCES "public"."chemical"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_item" ADD CONSTRAINT "stock_item_replaced_by_id_stock_item_id_fk" FOREIGN KEY ("replaced_by_id") REFERENCES "public"."stock_item"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_item" ADD CONSTRAINT "stock_item_stopped_by_app_user_id_fk" FOREIGN KEY ("stopped_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;