CREATE TABLE "complaint" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"doc_no" text NOT NULL,
	"channel" text NOT NULL,
	"received_at" timestamp with time zone NOT NULL,
	"received_by" uuid,
	"repair_order_id" uuid,
	"statement_id" uuid,
	"customer_id" uuid,
	"vehicle_id" uuid,
	"who" text,
	"phone_enc" text,
	"category" text NOT NULL,
	"content" text NOT NULL,
	"wish" text,
	"urgent" boolean DEFAULT false NOT NULL,
	"ack_due" text NOT NULL,
	"ack_at" timestamp with time zone,
	"ack_by" uuid,
	"ack_note" text,
	"judge_due" text NOT NULL,
	"inspect_note" text,
	"photos" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"verdict" text,
	"verdict_reason" text,
	"nc_id" uuid,
	"judged_by" uuid,
	"judged_at" timestamp with time zone,
	"plan" text,
	"resolution" text,
	"warranty_ro_id" uuid,
	"agreed_at" timestamp with time zone,
	"agreed_by" uuid,
	"comp_won" integer,
	"comp_note" text,
	"comp_approved_by" uuid,
	"comp_approved_at" timestamp with time zone,
	"reply_due" text NOT NULL,
	"satisfied" boolean,
	"close_note" text,
	"closed_by" uuid,
	"closed_at" timestamp with time zone,
	"status" text DEFAULT 'received' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "survey" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" text NOT NULL,
	"repair_order_id" uuid NOT NULL,
	"statement_id" uuid,
	"customer_id" uuid,
	"sent_at" timestamp with time zone NOT NULL,
	"sent_ok" boolean DEFAULT false NOT NULL,
	"send_error" text,
	"answered_at" timestamp with time zone,
	"scores" jsonb,
	"comment" text,
	"complaint_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "complaint" ADD CONSTRAINT "complaint_received_by_app_user_id_fk" FOREIGN KEY ("received_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "complaint" ADD CONSTRAINT "complaint_repair_order_id_repair_order_id_fk" FOREIGN KEY ("repair_order_id") REFERENCES "public"."repair_order"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "complaint" ADD CONSTRAINT "complaint_statement_id_repair_statement_id_fk" FOREIGN KEY ("statement_id") REFERENCES "public"."repair_statement"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "complaint" ADD CONSTRAINT "complaint_customer_id_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customer"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "complaint" ADD CONSTRAINT "complaint_vehicle_id_vehicle_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicle"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "complaint" ADD CONSTRAINT "complaint_ack_by_app_user_id_fk" FOREIGN KEY ("ack_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "complaint" ADD CONSTRAINT "complaint_nc_id_nonconformance_id_fk" FOREIGN KEY ("nc_id") REFERENCES "public"."nonconformance"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "complaint" ADD CONSTRAINT "complaint_judged_by_app_user_id_fk" FOREIGN KEY ("judged_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "complaint" ADD CONSTRAINT "complaint_warranty_ro_id_repair_order_id_fk" FOREIGN KEY ("warranty_ro_id") REFERENCES "public"."repair_order"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "complaint" ADD CONSTRAINT "complaint_agreed_by_app_user_id_fk" FOREIGN KEY ("agreed_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "complaint" ADD CONSTRAINT "complaint_comp_approved_by_app_user_id_fk" FOREIGN KEY ("comp_approved_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "complaint" ADD CONSTRAINT "complaint_closed_by_app_user_id_fk" FOREIGN KEY ("closed_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survey" ADD CONSTRAINT "survey_repair_order_id_repair_order_id_fk" FOREIGN KEY ("repair_order_id") REFERENCES "public"."repair_order"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survey" ADD CONSTRAINT "survey_statement_id_repair_statement_id_fk" FOREIGN KEY ("statement_id") REFERENCES "public"."repair_statement"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survey" ADD CONSTRAINT "survey_customer_id_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customer"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survey" ADD CONSTRAINT "survey_complaint_id_complaint_id_fk" FOREIGN KEY ("complaint_id") REFERENCES "public"."complaint"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "complaint_no_uq" ON "complaint" USING btree ("doc_no");--> statement-breakpoint
CREATE INDEX "complaint_status" ON "complaint" USING btree ("status");--> statement-breakpoint
CREATE INDEX "complaint_ro" ON "complaint" USING btree ("repair_order_id");--> statement-breakpoint
CREATE INDEX "complaint_received" ON "complaint" USING btree ("received_at");--> statement-breakpoint
CREATE UNIQUE INDEX "survey_token_uq" ON "survey" USING btree ("token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "survey_ro_uq" ON "survey" USING btree ("repair_order_id");