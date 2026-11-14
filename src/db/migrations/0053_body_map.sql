ALTER TABLE "ro_damage" ADD COLUMN "view" text;--> statement-breakpoint
ALTER TABLE "ro_damage" ADD COLUMN "cells" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "ro_damage" ADD COLUMN "sub_part" text;