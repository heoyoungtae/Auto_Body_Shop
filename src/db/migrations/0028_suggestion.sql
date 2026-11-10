CREATE TABLE "suggestion" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"doc_no" text NOT NULL,
	"title" text NOT NULL,
	"area" text,
	"problem" text NOT NULL,
	"proposal" text NOT NULL,
	"effect" text,
	"photos" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"proposer_id" uuid NOT NULL,
	"status" text DEFAULT 'submitted' NOT NULL,
	"reply_due" text NOT NULL,
	"reply" text,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	"done_note" text,
	"effect_note" text,
	"done_by" uuid,
	"done_at" timestamp with time zone,
	"revision_ref" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "suggestion" ADD CONSTRAINT "suggestion_proposer_id_app_user_id_fk" FOREIGN KEY ("proposer_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suggestion" ADD CONSTRAINT "suggestion_decided_by_app_user_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suggestion" ADD CONSTRAINT "suggestion_done_by_app_user_id_fk" FOREIGN KEY ("done_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "suggestion_no_uq" ON "suggestion" USING btree ("doc_no");--> statement-breakpoint
CREATE INDEX "suggestion_status_idx" ON "suggestion" USING btree ("status");--> statement-breakpoint
CREATE INDEX "suggestion_proposer_idx" ON "suggestion" USING btree ("proposer_id");