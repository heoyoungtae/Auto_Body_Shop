CREATE TABLE "carbook_alert_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"key" text NOT NULL,
	"kind" text NOT NULL,
	"ok" boolean NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "carbook_car" (
	"customer_id" uuid NOT NULL,
	"vehicle_id" uuid NOT NULL,
	"insurance_until" date,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "carbook_car_customer_id_vehicle_id_pk" PRIMARY KEY("customer_id","vehicle_id")
);
--> statement-breakpoint
CREATE TABLE "carbook_consent" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"version" text NOT NULL,
	"agreed" boolean NOT NULL,
	"ip" text,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "carbook_entry" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"vehicle_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"sub" text,
	"on" date NOT NULL,
	"mileage" integer,
	"amount_won" integer,
	"qty_x100" integer,
	"unit_price" integer,
	"place" text,
	"memo" text,
	"interval_km" integer,
	"interval_months" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "carbook_pref" (
	"customer_id" uuid PRIMARY KEY NOT NULL,
	"alerts" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "carbook_alert_log" ADD CONSTRAINT "carbook_alert_log_customer_id_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customer"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "carbook_car" ADD CONSTRAINT "carbook_car_customer_id_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customer"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "carbook_car" ADD CONSTRAINT "carbook_car_vehicle_id_vehicle_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicle"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "carbook_consent" ADD CONSTRAINT "carbook_consent_customer_id_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customer"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "carbook_entry" ADD CONSTRAINT "carbook_entry_customer_id_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customer"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "carbook_entry" ADD CONSTRAINT "carbook_entry_vehicle_id_vehicle_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicle"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "carbook_pref" ADD CONSTRAINT "carbook_pref_customer_id_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customer"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "carbook_alert_log_uq" ON "carbook_alert_log" USING btree ("customer_id","key");--> statement-breakpoint
CREATE INDEX "carbook_consent_customer_idx" ON "carbook_consent" USING btree ("customer_id","at");--> statement-breakpoint
CREATE INDEX "carbook_entry_customer_idx" ON "carbook_entry" USING btree ("customer_id","vehicle_id","on");