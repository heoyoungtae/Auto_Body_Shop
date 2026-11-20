CREATE TABLE "edit_presence" (
	"doc" text NOT NULL,
	"user_id" uuid NOT NULL,
	"tab" text NOT NULL,
	"editing" boolean DEFAULT false NOT NULL,
	"since" timestamp with time zone DEFAULT now() NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "edit_presence_doc_tab_pk" PRIMARY KEY("doc","tab")
);
--> statement-breakpoint
ALTER TABLE "edit_presence" ADD CONSTRAINT "edit_presence_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "edit_presence_at_idx" ON "edit_presence" USING btree ("at");