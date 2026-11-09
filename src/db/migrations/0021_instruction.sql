CREATE TABLE "instruction" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"doc_no" text NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"photos" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"urgent" boolean DEFAULT false NOT NULL,
	"due_on" text NOT NULL,
	"need_photo" boolean DEFAULT false NOT NULL,
	"ref_type" text,
	"ref_id" text,
	"ref_label" text,
	"issued_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "instruction_task" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"instruction_id" uuid NOT NULL,
	"parent_task_id" uuid,
	"assignee_id" uuid NOT NULL,
	"from_user_id" uuid NOT NULL,
	"note" text,
	"status" text DEFAULT 'open' NOT NULL,
	"read_at" timestamp with time zone,
	"forwarded_at" timestamp with time zone,
	"result" text,
	"report" text,
	"report_photos" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"reported_at" timestamp with time zone,
	"return_note" text,
	"returned_at" timestamp with time zone,
	"confirmed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "instruction" ADD CONSTRAINT "instruction_issued_by_app_user_id_fk" FOREIGN KEY ("issued_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "instruction_task" ADD CONSTRAINT "instruction_task_instruction_id_instruction_id_fk" FOREIGN KEY ("instruction_id") REFERENCES "public"."instruction"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "instruction_task" ADD CONSTRAINT "instruction_task_parent_task_id_instruction_task_id_fk" FOREIGN KEY ("parent_task_id") REFERENCES "public"."instruction_task"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "instruction_task" ADD CONSTRAINT "instruction_task_assignee_id_app_user_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "instruction_task" ADD CONSTRAINT "instruction_task_from_user_id_app_user_id_fk" FOREIGN KEY ("from_user_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "instruction_no_uq" ON "instruction" USING btree ("doc_no");--> statement-breakpoint
CREATE INDEX "instruction_task_assignee" ON "instruction_task" USING btree ("assignee_id","status");--> statement-breakpoint
CREATE INDEX "instruction_task_from" ON "instruction_task" USING btree ("from_user_id","status");--> statement-breakpoint
CREATE INDEX "instruction_task_ins" ON "instruction_task" USING btree ("instruction_id");