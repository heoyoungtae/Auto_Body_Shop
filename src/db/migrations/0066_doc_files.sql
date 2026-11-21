ALTER TABLE "doc_register" ADD COLUMN "files" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "doc_register" ADD COLUMN "reviewed_on" text;--> statement-breakpoint
ALTER TABLE "doc_register" ADD COLUMN "review_note" text;