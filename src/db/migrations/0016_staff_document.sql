CREATE TABLE "staff_document" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"doc_no" text NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"terms" jsonb NOT NULL,
	"party_enc" text,
	"shop" jsonb,
	"sign_path" text,
	"signed_via" text,
	"signed_at" timestamp with time zone,
	"signed_by" uuid,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"delivered_how" text,
	"delivered_by" uuid,
	"cancelled_at" timestamp with time zone,
	"cancel_reason" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staff_document_doc_no_unique" UNIQUE("doc_no")
);
--> statement-breakpoint
ALTER TABLE "staff_document" ADD CONSTRAINT "staff_document_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_document" ADD CONSTRAINT "staff_document_signed_by_app_user_id_fk" FOREIGN KEY ("signed_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_document" ADD CONSTRAINT "staff_document_approved_by_app_user_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_document" ADD CONSTRAINT "staff_document_delivered_by_app_user_id_fk" FOREIGN KEY ("delivered_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_document" ADD CONSTRAINT "staff_document_created_by_app_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "staff_document_user_idx" ON "staff_document" USING btree ("user_id","kind");