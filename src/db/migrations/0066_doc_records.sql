CREATE TABLE "corr_doc" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dir" text NOT NULL,
	"no" text NOT NULL,
	"status" text NOT NULL,
	"party" text NOT NULL,
	"party_kind" text DEFAULT 'other' NOT NULL,
	"party_addr" text,
	"cc" text,
	"their_no" text,
	"their_date" text,
	"title" text NOT NULL,
	"body" text,
	"enclosures" text,
	"files" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"received_on" text,
	"sent_on" text,
	"via" text,
	"owner_id" uuid,
	"due_on" text,
	"need_reply" boolean DEFAULT false NOT NULL,
	"done_on" text,
	"done_note" text,
	"reply_to_id" uuid,
	"approval_id" uuid,
	"note" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "doc_register" ADD COLUMN "files" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "doc_register" ADD COLUMN "reviewed_on" text;--> statement-breakpoint
ALTER TABLE "doc_register" ADD COLUMN "review_note" text;--> statement-breakpoint
ALTER TABLE "legal_item" ADD COLUMN "files" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "corr_doc" ADD CONSTRAINT "corr_doc_owner_id_app_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "corr_doc" ADD CONSTRAINT "corr_doc_created_by_app_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "corr_doc_no_uq" ON "corr_doc" USING btree ("no");--> statement-breakpoint
CREATE INDEX "corr_doc_dir_idx" ON "corr_doc" USING btree ("dir","status");--> statement-breakpoint
CREATE INDEX "corr_doc_reply_idx" ON "corr_doc" USING btree ("reply_to_id");