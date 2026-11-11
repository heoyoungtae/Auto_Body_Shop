CREATE TABLE "context_review" (
	"year" integer PRIMARY KEY NOT NULL,
	"issues" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"parties" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"note" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"imported_from" integer,
	"saved_by" uuid,
	"saved_at" timestamp with time zone DEFAULT now() NOT NULL,
	"confirmed_by" uuid,
	"confirmed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "doc_register" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"no" text NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"rev" text NOT NULL,
	"effective_on" text,
	"owner" text,
	"location" text,
	"source" text,
	"received_on" text,
	"note" text,
	"status" text DEFAULT 'current' NOT NULL,
	"history" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "goal_month" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ym" text NOT NULL,
	"key" text NOT NULL,
	"value" real,
	"numer" real,
	"denom" real,
	"target" real NOT NULL,
	"ok" boolean,
	"nc_id" uuid,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "goal_quarter_sign" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"year" integer NOT NULL,
	"quarter" integer NOT NULL,
	"note" text,
	"by" uuid,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mgmt_review" (
	"year" integer PRIMARY KEY NOT NULL,
	"held_on" text,
	"attendees" text,
	"inputs" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"comments" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"next_goals" text,
	"resources" text,
	"actions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"saved_by" uuid,
	"saved_at" timestamp with time zone DEFAULT now() NOT NULL,
	"confirmed_by" uuid,
	"confirmed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "quality_goal" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"year" integer NOT NULL,
	"key" text NOT NULL,
	"target" real NOT NULL,
	"reason" text,
	"set_by" uuid,
	"set_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "context_review" ADD CONSTRAINT "context_review_saved_by_app_user_id_fk" FOREIGN KEY ("saved_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "context_review" ADD CONSTRAINT "context_review_confirmed_by_app_user_id_fk" FOREIGN KEY ("confirmed_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doc_register" ADD CONSTRAINT "doc_register_updated_by_app_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goal_quarter_sign" ADD CONSTRAINT "goal_quarter_sign_by_app_user_id_fk" FOREIGN KEY ("by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mgmt_review" ADD CONSTRAINT "mgmt_review_saved_by_app_user_id_fk" FOREIGN KEY ("saved_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mgmt_review" ADD CONSTRAINT "mgmt_review_confirmed_by_app_user_id_fk" FOREIGN KEY ("confirmed_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quality_goal" ADD CONSTRAINT "quality_goal_set_by_app_user_id_fk" FOREIGN KEY ("set_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "doc_register_no_uq" ON "doc_register" USING btree ("no");--> statement-breakpoint
CREATE UNIQUE INDEX "goal_month_uq" ON "goal_month" USING btree ("ym","key");--> statement-breakpoint
CREATE UNIQUE INDEX "goal_quarter_uq" ON "goal_quarter_sign" USING btree ("year","quarter");--> statement-breakpoint
CREATE UNIQUE INDEX "quality_goal_uq" ON "quality_goal" USING btree ("year","key");