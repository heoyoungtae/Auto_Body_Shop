CREATE TABLE "staff_push" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"endpoint" text NOT NULL,
	"user_agent" text,
	"last_ok_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notification" ADD COLUMN "pushed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "notification" ADD COLUMN "push_shown_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "staff_push" ADD CONSTRAINT "staff_push_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "staff_push_endpoint_uq" ON "staff_push" USING btree ("endpoint");--> statement-breakpoint
CREATE INDEX "staff_push_user_idx" ON "staff_push" USING btree ("user_id");