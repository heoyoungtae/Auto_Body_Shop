CREATE TABLE "tool_min" (
	"name" text PRIMARY KEY NOT NULL,
	"min_qty" integer NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tool" ADD COLUMN "expense_id" uuid;--> statement-breakpoint
ALTER TABLE "tool" ADD COLUMN "price_won" integer;--> statement-breakpoint
ALTER TABLE "payment" ADD COLUMN "payer" text DEFAULT 'customer' NOT NULL;--> statement-breakpoint
ALTER TABLE "tool_min" ADD CONSTRAINT "tool_min_updated_by_app_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;