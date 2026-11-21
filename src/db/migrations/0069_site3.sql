CREATE TABLE "site_article" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"category" text NOT NULL,
	"title" text NOT NULL,
	"summary" text NOT NULL,
	"body" text NOT NULL,
	"minutes" integer DEFAULT 3 NOT NULL,
	"sort" integer DEFAULT 100 NOT NULL,
	"published" boolean DEFAULT false NOT NULL,
	"origin" text,
	"starter_key" text,
	"views" integer DEFAULT 0 NOT NULL,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "site_article_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "site_article" ADD CONSTRAINT "site_article_updated_by_app_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "site_article_pub_idx" ON "site_article" USING btree ("published","category","sort");