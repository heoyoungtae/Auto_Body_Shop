ALTER TABLE "supplier" ADD COLUMN "bank_name" text;--> statement-breakpoint
ALTER TABLE "supplier" ADD COLUMN "bank_account_enc" text;--> statement-breakpoint
ALTER TABLE "supplier" ADD COLUMN "bank_account_masked" text;--> statement-breakpoint
ALTER TABLE "supplier" ADD COLUMN "bank_holder" text;--> statement-breakpoint
ALTER TABLE "supplier" ADD COLUMN "bank_changed_by" uuid;--> statement-breakpoint
ALTER TABLE "supplier" ADD COLUMN "bank_changed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "supplier" ADD COLUMN "bank_verified_by" uuid;--> statement-breakpoint
ALTER TABLE "supplier" ADD COLUMN "bank_verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "supplier" ADD COLUMN "bank_verify_note" text;--> statement-breakpoint
ALTER TABLE "supplier" ADD CONSTRAINT "supplier_bank_changed_by_app_user_id_fk" FOREIGN KEY ("bank_changed_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier" ADD CONSTRAINT "supplier_bank_verified_by_app_user_id_fk" FOREIGN KEY ("bank_verified_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;