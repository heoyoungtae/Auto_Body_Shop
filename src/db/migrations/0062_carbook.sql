CREATE TABLE "carbook_link" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"customer_id" uuid NOT NULL,
	"repair_order_id" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"opened_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "carbook_otp" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"phone_hash" text NOT NULL,
	"customer_id" uuid,
	"code_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"tries" integer DEFAULT 0 NOT NULL,
	"used_at" timestamp with time zone,
	"ip" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "carbook_session" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"customer_id" uuid NOT NULL,
	"scope" text NOT NULL,
	"repair_order_id" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"ip" text,
	"user_agent" text,
	"last_seen_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "carbook_sold" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"vehicle_id" uuid NOT NULL,
	"sold_on" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "customer" ADD COLUMN "carbook_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "customer" ADD COLUMN "carbook_seen_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "repair_order" ADD COLUMN "customer_hidden_photos" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "carbook_link" ADD CONSTRAINT "carbook_link_customer_id_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customer"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "carbook_link" ADD CONSTRAINT "carbook_link_repair_order_id_repair_order_id_fk" FOREIGN KEY ("repair_order_id") REFERENCES "public"."repair_order"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "carbook_otp" ADD CONSTRAINT "carbook_otp_customer_id_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customer"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "carbook_session" ADD CONSTRAINT "carbook_session_customer_id_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customer"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "carbook_session" ADD CONSTRAINT "carbook_session_repair_order_id_repair_order_id_fk" FOREIGN KEY ("repair_order_id") REFERENCES "public"."repair_order"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "carbook_sold" ADD CONSTRAINT "carbook_sold_customer_id_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customer"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "carbook_sold" ADD CONSTRAINT "carbook_sold_vehicle_id_vehicle_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicle"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "carbook_link_customer_idx" ON "carbook_link" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "carbook_otp_phone_idx" ON "carbook_otp" USING btree ("phone_hash","created_at");--> statement-breakpoint
CREATE INDEX "carbook_session_customer_idx" ON "carbook_session" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "carbook_sold_customer_idx" ON "carbook_sold" USING btree ("customer_id");