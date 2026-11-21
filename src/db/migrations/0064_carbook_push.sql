CREATE TABLE "carbook_cert" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"doc_no" text NOT NULL,
	"code" text NOT NULL,
	"customer_id" uuid NOT NULL,
	"vehicle_id" uuid NOT NULL,
	"with_amount" boolean DEFAULT false NOT NULL,
	"snapshot" jsonb NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "carbook_inbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"url" text NOT NULL,
	"shown_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "carbook_push" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"endpoint" text NOT NULL,
	"user_agent" text,
	"last_ok_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "consultation" ADD COLUMN "photos" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "carbook_cert" ADD CONSTRAINT "carbook_cert_customer_id_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customer"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "carbook_cert" ADD CONSTRAINT "carbook_cert_vehicle_id_vehicle_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicle"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "carbook_inbox" ADD CONSTRAINT "carbook_inbox_customer_id_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customer"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "carbook_push" ADD CONSTRAINT "carbook_push_customer_id_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customer"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "carbook_cert_code_uq" ON "carbook_cert" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "carbook_cert_no_uq" ON "carbook_cert" USING btree ("doc_no");--> statement-breakpoint
CREATE INDEX "carbook_inbox_customer_idx" ON "carbook_inbox" USING btree ("customer_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "carbook_push_endpoint_uq" ON "carbook_push" USING btree ("endpoint");--> statement-breakpoint
CREATE INDEX "carbook_push_customer_idx" ON "carbook_push" USING btree ("customer_id");