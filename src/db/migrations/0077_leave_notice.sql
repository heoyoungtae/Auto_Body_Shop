CREATE TABLE "leave_notice" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"round" integer NOT NULL,
	"year_from" text NOT NULL,
	"year_to" text NOT NULL,
	"remain" real NOT NULL,
	"sent_on" text NOT NULL,
	"sent_by" uuid,
	"dates" text,
	"plan_text" text,
	"plan_on" text,
	"confirmed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "leave_notice" ADD CONSTRAINT "leave_notice_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_notice" ADD CONSTRAINT "leave_notice_sent_by_app_user_id_fk" FOREIGN KEY ("sent_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "leave_notice_uq" ON "leave_notice" USING btree ("user_id","year_from","round");