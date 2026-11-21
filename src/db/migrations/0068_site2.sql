CREATE TABLE "site_case" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"repair_order_id" uuid,
	"customer_id" uuid,
	"title" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"category" text NOT NULL,
	"car_label" text,
	"photos" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"published" boolean DEFAULT false NOT NULL,
	"worked_on" date,
	"views" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "site_faq" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category" text NOT NULL,
	"question" text NOT NULL,
	"answer" text NOT NULL,
	"sort" integer DEFAULT 100 NOT NULL,
	"published" boolean DEFAULT false NOT NULL,
	"origin" text,
	"starter_key" text,
	"consultation_id" uuid,
	"views" integer DEFAULT 0 NOT NULL,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "site_notice" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"pinned" boolean DEFAULT false NOT NULL,
	"banner" boolean DEFAULT false NOT NULL,
	"ad" boolean DEFAULT false NOT NULL,
	"published" boolean DEFAULT false NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date,
	"notify_carbook" boolean DEFAULT false NOT NULL,
	"notified_at" timestamp with time zone,
	"notified_count" integer,
	"views" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "site_case" ADD CONSTRAINT "site_case_repair_order_id_repair_order_id_fk" FOREIGN KEY ("repair_order_id") REFERENCES "public"."repair_order"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_case" ADD CONSTRAINT "site_case_customer_id_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customer"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_case" ADD CONSTRAINT "site_case_created_by_app_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_case" ADD CONSTRAINT "site_case_updated_by_app_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_faq" ADD CONSTRAINT "site_faq_consultation_id_consultation_id_fk" FOREIGN KEY ("consultation_id") REFERENCES "public"."consultation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_faq" ADD CONSTRAINT "site_faq_updated_by_app_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_notice" ADD CONSTRAINT "site_notice_created_by_app_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_notice" ADD CONSTRAINT "site_notice_updated_by_app_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "site_case_pub_idx" ON "site_case" USING btree ("published","worked_on");--> statement-breakpoint
CREATE INDEX "site_case_ro_idx" ON "site_case" USING btree ("repair_order_id");--> statement-breakpoint
CREATE INDEX "site_faq_pub_idx" ON "site_faq" USING btree ("published","category","sort");--> statement-breakpoint
CREATE INDEX "site_notice_pub_idx" ON "site_notice" USING btree ("published","starts_on");