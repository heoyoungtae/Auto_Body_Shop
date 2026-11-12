CREATE TABLE "asset_repair" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"asset_kind" text NOT NULL,
	"asset_id" uuid NOT NULL,
	"on" text NOT NULL,
	"what" text NOT NULL,
	"vendor" text,
	"cost_won" integer DEFAULT 0 NOT NULL,
	"capital" boolean DEFAULT false NOT NULL,
	"files" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"expense_id" uuid,
	"failure_id" uuid,
	"by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "equipment" ADD COLUMN "sub_manager_id" uuid;--> statement-breakpoint
ALTER TABLE "equipment" ADD COLUMN "expense_id" uuid;--> statement-breakpoint
ALTER TABLE "equipment" ADD COLUMN "ownership" text DEFAULT 'own' NOT NULL;--> statement-breakpoint
ALTER TABLE "equipment" ADD COLUMN "contract" jsonb;--> statement-breakpoint
ALTER TABLE "equipment" ADD COLUMN "fee_billed_ym" text;--> statement-breakpoint
ALTER TABLE "equipment" ADD COLUMN "dep_method" text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "equipment" ADD COLUMN "useful_years" integer;--> statement-breakpoint
ALTER TABLE "equipment" ADD COLUMN "dep_start_on" text;--> statement-breakpoint
ALTER TABLE "equipment" ADD COLUMN "dispose_won" integer;--> statement-breakpoint
ALTER TABLE "equipment" ADD COLUMN "labeled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "equipment" ADD COLUMN "disposed_on" text;--> statement-breakpoint
ALTER TABLE "fixture" ADD COLUMN "manager_id" uuid;--> statement-breakpoint
ALTER TABLE "fixture" ADD COLUMN "sub_manager_id" uuid;--> statement-breakpoint
ALTER TABLE "fixture" ADD COLUMN "expense_id" uuid;--> statement-breakpoint
ALTER TABLE "fixture" ADD COLUMN "ownership" text DEFAULT 'own' NOT NULL;--> statement-breakpoint
ALTER TABLE "fixture" ADD COLUMN "contract" jsonb;--> statement-breakpoint
ALTER TABLE "fixture" ADD COLUMN "fee_billed_ym" text;--> statement-breakpoint
ALTER TABLE "fixture" ADD COLUMN "dep_method" text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "fixture" ADD COLUMN "useful_years" integer;--> statement-breakpoint
ALTER TABLE "fixture" ADD COLUMN "dep_start_on" text;--> statement-breakpoint
ALTER TABLE "fixture" ADD COLUMN "dispose_won" integer;--> statement-breakpoint
ALTER TABLE "asset_repair" ADD CONSTRAINT "asset_repair_by_app_user_id_fk" FOREIGN KEY ("by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "asset_repair_asset_idx" ON "asset_repair" USING btree ("asset_kind","asset_id");--> statement-breakpoint
ALTER TABLE "equipment" ADD CONSTRAINT "equipment_sub_manager_id_app_user_id_fk" FOREIGN KEY ("sub_manager_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fixture" ADD CONSTRAINT "fixture_manager_id_app_user_id_fk" FOREIGN KEY ("manager_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fixture" ADD CONSTRAINT "fixture_sub_manager_id_app_user_id_fk" FOREIGN KEY ("sub_manager_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;