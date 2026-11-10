CREATE TABLE "perf_review" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"doc_no" text NOT NULL,
	"year" integer NOT NULL,
	"user_id" uuid NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"evidence" jsonb NOT NULL,
	"scores" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"comments" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"total" real,
	"grade" text,
	"strengths" text,
	"improve" text,
	"training_needs" text,
	"wage_note" text,
	"interviewed_on" text,
	"employee_comment" text,
	"employee_ack_at" timestamp with time zone,
	"reviewer_id" uuid,
	"confirmed_by" uuid,
	"confirmed_at" timestamp with time zone,
	"training_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "perf_review_doc_no_unique" UNIQUE("doc_no")
);
--> statement-breakpoint
ALTER TABLE "perf_review" ADD CONSTRAINT "perf_review_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "perf_review" ADD CONSTRAINT "perf_review_reviewer_id_app_user_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "perf_review" ADD CONSTRAINT "perf_review_confirmed_by_app_user_id_fk" FOREIGN KEY ("confirmed_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "perf_review" ADD CONSTRAINT "perf_review_training_id_training_id_fk" FOREIGN KEY ("training_id") REFERENCES "public"."training"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "perf_review_year_user_uq" ON "perf_review" USING btree ("year","user_id");