CREATE TABLE "consent" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"version" text NOT NULL,
	"required" boolean NOT NULL,
	"photo" boolean DEFAULT false NOT NULL,
	"marketing" boolean DEFAULT false NOT NULL,
	"method" text NOT NULL,
	"withdrawal" boolean DEFAULT false NOT NULL,
	"note" text,
	"recorded_by" uuid,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "consultation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"doc_no" text NOT NULL,
	"form_rev" text DEFAULT 'v0.2' NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"channel" text NOT NULL,
	"customer_id" uuid NOT NULL,
	"vehicle_id" uuid,
	"damage_types" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"damage_parts" text,
	"cause" text,
	"photo_count" integer DEFAULT 0 NOT NULL,
	"methods" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"structural" boolean DEFAULT false NOT NULL,
	"insurance" text DEFAULT 'self' NOT NULL,
	"insurer" text,
	"claim_no" text,
	"want_date" date,
	"parts_pref" text,
	"rental" boolean DEFAULT false NOT NULL,
	"needs" text,
	"est_min" integer,
	"est_max" integer,
	"est_noticed" boolean DEFAULT false NOT NULL,
	"result" text DEFAULT 'open' NOT NULL,
	"reserved_at" timestamp with time zone,
	"over_capacity_ok" boolean DEFAULT false NOT NULL,
	"recontact_on" date,
	"close_reason" text,
	"reply_due" date,
	"replied_at" timestamp with time zone,
	"confirm_sent_at" timestamp with time zone,
	"reminder_sent_at" timestamp with time zone,
	"from_id" uuid,
	"advisor_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customer" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"phone_enc" text,
	"phone_hash" text,
	"phone_masked" text,
	"memo" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"purged_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "vehicle" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"plate_no" text NOT NULL,
	"model" text,
	"year" integer,
	"color_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "consent" ADD CONSTRAINT "consent_customer_id_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customer"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consent" ADD CONSTRAINT "consent_recorded_by_app_user_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consultation" ADD CONSTRAINT "consultation_customer_id_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customer"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consultation" ADD CONSTRAINT "consultation_vehicle_id_vehicle_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicle"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consultation" ADD CONSTRAINT "consultation_advisor_id_app_user_id_fk" FOREIGN KEY ("advisor_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer" ADD CONSTRAINT "customer_created_by_app_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle" ADD CONSTRAINT "vehicle_customer_id_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customer"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "consent_customer_idx" ON "consent" USING btree ("customer_id","at");--> statement-breakpoint
CREATE UNIQUE INDEX "consultation_no_uq" ON "consultation" USING btree ("doc_no");--> statement-breakpoint
CREATE INDEX "consultation_customer_idx" ON "consultation" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "consultation_result_idx" ON "consultation" USING btree ("result");--> statement-breakpoint
CREATE INDEX "consultation_reserved_idx" ON "consultation" USING btree ("reserved_at");--> statement-breakpoint
CREATE UNIQUE INDEX "customer_phone_uq" ON "customer" USING btree ("phone_hash");--> statement-breakpoint
CREATE INDEX "customer_name_idx" ON "customer" USING btree ("name");--> statement-breakpoint
CREATE UNIQUE INDEX "vehicle_plate_uq" ON "vehicle" USING btree ("plate_no");--> statement-breakpoint
CREATE INDEX "vehicle_customer_idx" ON "vehicle" USING btree ("customer_id");