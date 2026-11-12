ALTER TABLE "app_user" ADD COLUMN "must_change_password" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "app_user" ADD COLUMN "temp_password_enc" text;--> statement-breakpoint
ALTER TABLE "app_user" ADD COLUMN "temp_password_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "app_user" ADD COLUMN "last_login_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "session" ADD COLUMN "last_seen_at" timestamp with time zone;