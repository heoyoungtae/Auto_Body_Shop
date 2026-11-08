CREATE TABLE "ro_damage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"repair_order_id" uuid NOT NULL,
	"seq" integer NOT NULL,
	"part" text NOT NULL,
	"kind" text NOT NULL,
	"size_cm" integer,
	"depth_mm" integer,
	"paint_layer" text DEFAULT 'none' NOT NULL,
	"crease" boolean DEFAULT false NOT NULL,
	"broken" boolean DEFAULT false NOT NULL,
	"structural" boolean DEFAULT false NOT NULL,
	"film_panel" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"film_adjacent" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"method" text NOT NULL,
	"suggested" text NOT NULL,
	"method_reason" text,
	"calibrate" boolean DEFAULT false NOT NULL,
	"note" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "repair_order" ADD COLUMN "diagnosed_by" uuid;--> statement-breakpoint
ALTER TABLE "repair_order" ADD COLUMN "diagnosed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "repair_order" ADD COLUMN "diag_confirmed_by" uuid;--> statement-breakpoint
ALTER TABLE "repair_order" ADD COLUMN "diag_confirmed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "repair_order" ADD COLUMN "diag_note" text;--> statement-breakpoint
ALTER TABLE "ro_damage" ADD CONSTRAINT "ro_damage_repair_order_id_repair_order_id_fk" FOREIGN KEY ("repair_order_id") REFERENCES "public"."repair_order"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ro_damage" ADD CONSTRAINT "ro_damage_created_by_app_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ro_damage_ro_idx" ON "ro_damage" USING btree ("repair_order_id");--> statement-breakpoint
ALTER TABLE "repair_order" ADD CONSTRAINT "repair_order_diagnosed_by_app_user_id_fk" FOREIGN KEY ("diagnosed_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repair_order" ADD CONSTRAINT "repair_order_diag_confirmed_by_app_user_id_fk" FOREIGN KEY ("diag_confirmed_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;