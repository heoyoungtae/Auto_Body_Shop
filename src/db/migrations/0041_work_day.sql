CREATE TABLE "work_day" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"day" text NOT NULL,
	"in_at" timestamp with time zone NOT NULL,
	"in_ip" text,
	"out_at" timestamp with time zone,
	"out_ip" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "work_day" ADD CONSTRAINT "work_day_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "work_day_user_day_uq" ON "work_day" USING btree ("user_id","day");--> statement-breakpoint
CREATE INDEX "work_day_day_idx" ON "work_day" USING btree ("day");