CREATE TABLE "env_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"equipment_id" uuid,
	"on" text NOT NULL,
	"detail" text,
	"result" text,
	"next_due" text,
	"waste_log_id" uuid,
	"by" uuid,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "env_month_sign" (
	"ym" text PRIMARY KEY NOT NULL,
	"by" uuid,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"summary" text,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "waste_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"item" text NOT NULL,
	"qty" real NOT NULL,
	"on" text NOT NULL,
	"supplier_id" uuid,
	"slip_no" text,
	"note" text,
	"by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "env_event" ADD CONSTRAINT "env_event_equipment_id_equipment_id_fk" FOREIGN KEY ("equipment_id") REFERENCES "public"."equipment"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "env_event" ADD CONSTRAINT "env_event_by_app_user_id_fk" FOREIGN KEY ("by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "env_month_sign" ADD CONSTRAINT "env_month_sign_by_app_user_id_fk" FOREIGN KEY ("by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waste_log" ADD CONSTRAINT "waste_log_supplier_id_supplier_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."supplier"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waste_log" ADD CONSTRAINT "waste_log_by_app_user_id_fk" FOREIGN KEY ("by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "env_event_idx" ON "env_event" USING btree ("kind","on");--> statement-breakpoint
CREATE INDEX "waste_log_idx" ON "waste_log" USING btree ("item","on");