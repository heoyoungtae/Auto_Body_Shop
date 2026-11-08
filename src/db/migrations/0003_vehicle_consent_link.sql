CREATE TABLE "consent_request" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" text NOT NULL,
	"customer_id" uuid NOT NULL,
	"consult_id" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"sent_ok" boolean DEFAULT false NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "consultation" ADD COLUMN "mileage" integer;--> statement-breakpoint
ALTER TABLE "vehicle" ADD COLUMN "vin" text;--> statement-breakpoint
ALTER TABLE "vehicle" ADD COLUMN "maker" text;--> statement-breakpoint
ALTER TABLE "vehicle" ADD COLUMN "mileage" integer;--> statement-breakpoint
ALTER TABLE "vehicle" ADD COLUMN "mileage_on" date;--> statement-breakpoint
ALTER TABLE "consent_request" ADD CONSTRAINT "consent_request_customer_id_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customer"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consent_request" ADD CONSTRAINT "consent_request_created_by_app_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "consent_request_token_uq" ON "consent_request" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "consent_request_customer_idx" ON "consent_request" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "vehicle_vin_idx" ON "vehicle" USING btree ("vin");