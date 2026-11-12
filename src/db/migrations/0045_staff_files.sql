CREATE TABLE "staff_file" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"license_name" text,
	"path" text,
	"file_name" text NOT NULL,
	"mime" text NOT NULL,
	"size" integer NOT NULL,
	"uploaded_by" uuid,
	"checked_by" uuid,
	"checked_at" timestamp with time zone,
	"removed_at" timestamp with time zone,
	"removed_by" uuid,
	"remove_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "staff_file" ADD CONSTRAINT "staff_file_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_file" ADD CONSTRAINT "staff_file_uploaded_by_app_user_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_file" ADD CONSTRAINT "staff_file_checked_by_app_user_id_fk" FOREIGN KEY ("checked_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_file" ADD CONSTRAINT "staff_file_removed_by_app_user_id_fk" FOREIGN KEY ("removed_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "staff_file_user_idx" ON "staff_file" USING btree ("user_id");