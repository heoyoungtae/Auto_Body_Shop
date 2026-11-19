CREATE TABLE "std_section" (
	"key" text PRIMARY KEY NOT NULL,
	"part" text NOT NULL,
	"ch" text NOT NULL,
	"doc_no" text NOT NULL,
	"no" text DEFAULT '' NOT NULL,
	"title" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"grp" text,
	"chapter" boolean DEFAULT false NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"roles" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"rev" text,
	"revised_on" text,
	"revised_ref" text,
	"history" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "std_section" ADD CONSTRAINT "std_section_updated_by_app_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "std_section_ch_idx" ON "std_section" USING btree ("ch","sort");