ALTER TABLE "consultation" ADD COLUMN "source" text;--> statement-breakpoint
ALTER TABLE "consultation" ADD COLUMN "web_reply" text;--> statement-breakpoint
ALTER TABLE "consultation" ADD COLUMN "web_reply_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "consultation" ADD COLUMN "web_reply_by" uuid;--> statement-breakpoint
ALTER TABLE "carbook_otp" ADD COLUMN "purpose" text DEFAULT 'login' NOT NULL;--> statement-breakpoint
ALTER TABLE "consultation" ADD CONSTRAINT "consultation_web_reply_by_app_user_id_fk" FOREIGN KEY ("web_reply_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;