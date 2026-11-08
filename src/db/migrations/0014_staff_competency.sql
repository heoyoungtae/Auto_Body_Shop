CREATE TABLE "competency" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"skill" text NOT NULL,
	"level" integer NOT NULL,
	"note" text,
	"assessed_on" text NOT NULL,
	"assessed_by" uuid,
	"confirmed_by" uuid,
	"confirmed_at" timestamp with time zone,
	"rejected_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "staff_profile" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"job" text,
	"gender" text,
	"birth_enc" text,
	"address_enc" text,
	"career" text,
	"hired_on" text,
	"contract_kind" text,
	"contract_end" text,
	"licenses" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"left_on" text,
	"left_reason" text,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "work_step" ADD COLUMN "mentor" uuid;--> statement-breakpoint
ALTER TABLE "competency" ADD CONSTRAINT "competency_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competency" ADD CONSTRAINT "competency_assessed_by_app_user_id_fk" FOREIGN KEY ("assessed_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competency" ADD CONSTRAINT "competency_confirmed_by_app_user_id_fk" FOREIGN KEY ("confirmed_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_profile" ADD CONSTRAINT "staff_profile_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_profile" ADD CONSTRAINT "staff_profile_updated_by_app_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "competency_user_skill_idx" ON "competency" USING btree ("user_id","skill");--> statement-breakpoint
ALTER TABLE "work_step" ADD CONSTRAINT "work_step_mentor_app_user_id_fk" FOREIGN KEY ("mentor") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;