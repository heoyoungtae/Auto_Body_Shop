CREATE TABLE "claim_note" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"claim_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"note" text NOT NULL,
	"by" uuid,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "insurer" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"kind" text DEFAULT 'insurer' NOT NULL,
	"rate_won" integer,
	"parts_discount_x10" integer,
	"contacts" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"note" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX "insurance_claim_ro_uq";--> statement-breakpoint
ALTER TABLE "insurance_claim" ADD COLUMN "seq" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "insurance_claim" ADD COLUMN "insurer_id" uuid;--> statement-breakpoint
ALTER TABLE "insurance_claim" ADD COLUMN "depreciation_won" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "insurance_claim" ADD COLUMN "parts_discount_won" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "insurance_claim" ADD COLUMN "salvage_won" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "insurance_claim" ADD COLUMN "other_deduct_won" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "insurance_claim" ADD COLUMN "other_deduct_payer" text DEFAULT 'shop' NOT NULL;--> statement-breakpoint
ALTER TABLE "insurance_claim" ADD COLUMN "other_deduct_note" text;--> statement-breakpoint
ALTER TABLE "insurance_claim" ADD COLUMN "line_adjust" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "insurance_claim" ADD COLUMN "dispute" text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "insurance_claim" ADD COLUMN "dispute_note" text;--> statement-breakpoint
ALTER TABLE "insurance_claim" ADD COLUMN "disputed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "insurance_claim" ADD COLUMN "settle" text;--> statement-breakpoint
ALTER TABLE "insurance_claim" ADD COLUMN "aos" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "claim_note" ADD CONSTRAINT "claim_note_claim_id_insurance_claim_id_fk" FOREIGN KEY ("claim_id") REFERENCES "public"."insurance_claim"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_note" ADD CONSTRAINT "claim_note_by_app_user_id_fk" FOREIGN KEY ("by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "claim_note_claim_idx" ON "claim_note" USING btree ("claim_id");--> statement-breakpoint
CREATE UNIQUE INDEX "insurer_name_uq" ON "insurer" USING btree ("name");--> statement-breakpoint
ALTER TABLE "insurance_claim" ADD CONSTRAINT "insurance_claim_insurer_id_insurer_id_fk" FOREIGN KEY ("insurer_id") REFERENCES "public"."insurer"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "insurance_claim_ro_seq_uq" ON "insurance_claim" USING btree ("repair_order_id","seq");--> statement-breakpoint
CREATE INDEX "insurance_claim_ro_idx" ON "insurance_claim" USING btree ("repair_order_id");--> statement-breakpoint
INSERT INTO "claim_note" ("claim_id", "kind", "note", "at") SELECT "id", 'dun', "dun_note", "dunned_at" FROM "insurance_claim" WHERE "dun_note" IS NOT NULL AND "dunned_at" IS NOT NULL;--> statement-breakpoint
INSERT INTO "insurer" ("name", "kind") VALUES ('삼성화재', 'insurer'), ('현대해상', 'insurer'), ('DB손해보험', 'insurer'), ('KB손해보험', 'insurer'), ('메리츠화재', 'insurer'), ('한화손해보험', 'insurer'), ('롯데손해보험', 'insurer'), ('흥국화재', 'insurer'), ('MG손해보험', 'insurer'), ('AXA손해보험', 'insurer'), ('하나손해보험', 'insurer'), ('캐롯손해보험', 'insurer'), ('전국택시공제조합', 'mutual'), ('전국버스공제조합', 'mutual'), ('전국화물자동차공제조합', 'mutual'), ('전국렌터카공제조합', 'mutual') ON CONFLICT DO NOTHING;
