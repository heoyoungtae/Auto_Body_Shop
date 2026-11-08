CREATE TABLE "repair_order" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"doc_no" text NOT NULL,
	"form_rev" text DEFAULT 'v0.2' NOT NULL,
	"status" text DEFAULT 'intake' NOT NULL,
	"consultation_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"vehicle_id" uuid NOT NULL,
	"insurance" text DEFAULT 'self' NOT NULL,
	"insurer" text,
	"claim_no" text,
	"in_at" timestamp with time zone DEFAULT now() NOT NULL,
	"delivered_by_driver" boolean DEFAULT false NOT NULL,
	"driver_name" text,
	"mileage" integer,
	"fuel_pct" integer,
	"body_notes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"warning_lights" text,
	"marks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"valuables" text,
	"valuables_none" boolean DEFAULT false NOT NULL,
	"devices" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"key_count" integer,
	"key_tag" text,
	"covers_on" boolean DEFAULT false NOT NULL,
	"park_spot" text,
	"intake_note" text,
	"agree_checked" boolean DEFAULT false NOT NULL,
	"agree_move" boolean DEFAULT false NOT NULL,
	"signer_name" text,
	"signature_path" text,
	"signed_at" timestamp with time zone,
	"advisor_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ro_photo" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"repair_order_id" uuid NOT NULL,
	"slot" text NOT NULL,
	"path" text NOT NULL,
	"width" integer,
	"height" integer,
	"bytes" integer NOT NULL,
	"note" text,
	"taken_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "repair_order" ADD CONSTRAINT "repair_order_consultation_id_consultation_id_fk" FOREIGN KEY ("consultation_id") REFERENCES "public"."consultation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repair_order" ADD CONSTRAINT "repair_order_customer_id_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customer"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repair_order" ADD CONSTRAINT "repair_order_vehicle_id_vehicle_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicle"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repair_order" ADD CONSTRAINT "repair_order_advisor_id_app_user_id_fk" FOREIGN KEY ("advisor_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ro_photo" ADD CONSTRAINT "ro_photo_repair_order_id_repair_order_id_fk" FOREIGN KEY ("repair_order_id") REFERENCES "public"."repair_order"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ro_photo" ADD CONSTRAINT "ro_photo_taken_by_app_user_id_fk" FOREIGN KEY ("taken_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "repair_order_no_uq" ON "repair_order" USING btree ("doc_no");--> statement-breakpoint
CREATE UNIQUE INDEX "repair_order_consult_uq" ON "repair_order" USING btree ("consultation_id");--> statement-breakpoint
CREATE INDEX "repair_order_status_idx" ON "repair_order" USING btree ("status");--> statement-breakpoint
CREATE INDEX "repair_order_vehicle_idx" ON "repair_order" USING btree ("vehicle_id");--> statement-breakpoint
CREATE INDEX "ro_photo_ro_idx" ON "ro_photo" USING btree ("repair_order_id");