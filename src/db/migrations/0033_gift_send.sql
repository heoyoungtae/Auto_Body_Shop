CREATE TABLE "gift_send" (
	"id" serial PRIMARY KEY NOT NULL,
	"doc_no" text NOT NULL,
	"customer_id" uuid,
	"customer_name" text NOT NULL,
	"to_enc" text NOT NULL,
	"to_masked" text NOT NULL,
	"purpose" text NOT NULL,
	"reason" text NOT NULL,
	"complaint_id" uuid,
	"goods_code" text NOT NULL,
	"goods_name" text NOT NULL,
	"price" integer NOT NULL,
	"provider" text NOT NULL,
	"tr_id" text NOT NULL,
	"order_no" text,
	"status" text NOT NULL,
	"error" text,
	"sent_by" uuid,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"cancelled_by" uuid,
	"cancelled_at" timestamp with time zone,
	"cancel_reason" text
);
--> statement-breakpoint
ALTER TABLE "gift_send" ADD CONSTRAINT "gift_send_sent_by_app_user_id_fk" FOREIGN KEY ("sent_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gift_send" ADD CONSTRAINT "gift_send_cancelled_by_app_user_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "gift_send_tr_uq" ON "gift_send" USING btree ("tr_id");--> statement-breakpoint
CREATE INDEX "gift_send_customer_idx" ON "gift_send" USING btree ("customer_id","sent_at");