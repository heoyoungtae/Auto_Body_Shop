ALTER TABLE "estimate" ADD COLUMN "approval_token_hash" text;--> statement-breakpoint
ALTER TABLE "estimate" ADD COLUMN "approval_sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "estimate" ADD COLUMN "approval_sent_ok" boolean;--> statement-breakpoint
ALTER TABLE "estimate" ADD COLUMN "approved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "estimate" ADD COLUMN "approval_method" text;--> statement-breakpoint
ALTER TABLE "estimate" ADD COLUMN "approver_name" text;--> statement-breakpoint
ALTER TABLE "estimate" ADD COLUMN "approval_ref" text;--> statement-breakpoint
ALTER TABLE "estimate" ADD COLUMN "approval_signature" text;--> statement-breakpoint
ALTER TABLE "estimate" ADD COLUMN "approval_recorded_by" uuid;--> statement-breakpoint
ALTER TABLE "estimate" ADD CONSTRAINT "estimate_approval_recorded_by_app_user_id_fk" FOREIGN KEY ("approval_recorded_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "estimate_approval_token_idx" ON "estimate" USING btree ("approval_token_hash");