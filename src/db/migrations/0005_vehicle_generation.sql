ALTER TABLE "vehicle" ADD COLUMN "generation" text;--> statement-breakpoint
ALTER TABLE "vehicle" ADD COLUMN "trim" text;--> statement-breakpoint
ALTER TABLE "vehicle" ADD COLUMN "options" jsonb DEFAULT '[]'::jsonb NOT NULL;