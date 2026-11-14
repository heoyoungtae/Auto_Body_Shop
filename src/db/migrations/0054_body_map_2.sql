ALTER TABLE "consultation" ADD COLUMN "damage_zones" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "vehicle" ADD COLUMN "body_type" text;--> statement-breakpoint
ALTER TABLE "ro_photo" ADD COLUMN "damage_id" uuid;