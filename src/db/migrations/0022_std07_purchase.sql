CREATE TABLE "outsource_job" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"doc_no" text NOT NULL,
	"supplier_id" uuid NOT NULL,
	"repair_order_id" uuid NOT NULL,
	"work_type" text NOT NULL,
	"scope" text NOT NULL,
	"required" text NOT NULL,
	"due_on" text NOT NULL,
	"amount_won" integer DEFAULT 0 NOT NULL,
	"move_out" boolean DEFAULT true NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"approver_role" text,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"return_note" text,
	"requested_at" timestamp with time zone,
	"customer_notice_at" timestamp with time zone,
	"customer_notice_by" uuid,
	"customer_notice_note" text,
	"out_at" timestamp with time zone,
	"out_km" integer,
	"in_at" timestamp with time zone,
	"in_km" integer,
	"result_note" text,
	"result_photos" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"result_at" timestamp with time zone,
	"result_by" uuid,
	"redo_count" integer DEFAULT 0 NOT NULL,
	"redo_note" text,
	"accepted_by" uuid,
	"accepted_at" timestamp with time zone,
	"cancel_reason" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchase_line" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"seq" integer NOT NULL,
	"name" text NOT NULL,
	"part_no" text,
	"spec" text,
	"part_code" text,
	"qty" integer DEFAULT 1 NOT NULL,
	"unit_won" integer DEFAULT 0 NOT NULL,
	"estimate_line_id" uuid,
	"stock_item_id" uuid,
	"received_qty" integer DEFAULT 0 NOT NULL,
	"rejected_qty" integer DEFAULT 0 NOT NULL,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "purchase_order" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"doc_no" text NOT NULL,
	"kind" text NOT NULL,
	"supplier_id" uuid,
	"repair_order_id" uuid,
	"estimate_id" uuid,
	"status" text DEFAULT 'draft' NOT NULL,
	"supply_won" integer DEFAULT 0 NOT NULL,
	"total_won" integer DEFAULT 0 NOT NULL,
	"due_on" text,
	"reply_due_on" text,
	"note" text,
	"approver_role" text,
	"submitted_at" timestamp with time zone,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"return_note" text,
	"sent_at" timestamp with time zone,
	"sent_by" uuid,
	"sent_via" text,
	"received_at" timestamp with time zone,
	"invoice_no" text,
	"invoice_on" text,
	"invoice_by" uuid,
	"cancel_reason" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchase_receipt" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"lines" jsonb NOT NULL,
	"checks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"bad_note" text,
	"photos" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"nc_id" uuid,
	"return_done_at" timestamp with time zone,
	"return_note" text,
	"received_by" uuid NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_count" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"lines" jsonb NOT NULL,
	"book_won" integer NOT NULL,
	"diff_won" integer NOT NULL,
	"note" text,
	"nc_id" uuid,
	"counted_by" uuid NOT NULL,
	"counted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"spec" text,
	"unit" text DEFAULT '개' NOT NULL,
	"location" text,
	"safety_qty" integer DEFAULT 0 NOT NULL,
	"qty" integer DEFAULT 0 NOT NULL,
	"unit_won" integer DEFAULT 0 NOT NULL,
	"expiry_tracked" boolean DEFAULT false NOT NULL,
	"supplier_id" uuid,
	"active" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_lot" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" uuid NOT NULL,
	"lot" text,
	"expires_on" text NOT NULL,
	"qty" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_move" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" uuid NOT NULL,
	"qty" integer NOT NULL,
	"reason" text NOT NULL,
	"ref" text,
	"repair_order_id" uuid,
	"lot" text,
	"note" text,
	"by" uuid,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supplier" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"biz_no" text,
	"kinds" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"items" text,
	"contact_name" text,
	"phone" text,
	"email" text,
	"lead_days" integer,
	"return_terms" text,
	"docs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"note" text,
	"status" text DEFAULT 'candidate' NOT NULL,
	"score" integer,
	"emergency_on" text,
	"emergency_due" text,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"stop_reason" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supplier_eval" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"supplier_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"year" integer NOT NULL,
	"scores" jsonb NOT NULL,
	"total" integer NOT NULL,
	"stats" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"note" text,
	"evaluated_by" uuid NOT NULL,
	"evaluated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"confirmed_by" uuid,
	"confirmed_at" timestamp with time zone,
	"outcome" text
);
--> statement-breakpoint
ALTER TABLE "outsource_job" ADD CONSTRAINT "outsource_job_supplier_id_supplier_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."supplier"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outsource_job" ADD CONSTRAINT "outsource_job_repair_order_id_repair_order_id_fk" FOREIGN KEY ("repair_order_id") REFERENCES "public"."repair_order"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outsource_job" ADD CONSTRAINT "outsource_job_approved_by_app_user_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outsource_job" ADD CONSTRAINT "outsource_job_customer_notice_by_app_user_id_fk" FOREIGN KEY ("customer_notice_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outsource_job" ADD CONSTRAINT "outsource_job_result_by_app_user_id_fk" FOREIGN KEY ("result_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outsource_job" ADD CONSTRAINT "outsource_job_accepted_by_app_user_id_fk" FOREIGN KEY ("accepted_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outsource_job" ADD CONSTRAINT "outsource_job_created_by_app_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_line" ADD CONSTRAINT "purchase_line_order_id_purchase_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."purchase_order"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_line" ADD CONSTRAINT "purchase_line_estimate_line_id_estimate_line_id_fk" FOREIGN KEY ("estimate_line_id") REFERENCES "public"."estimate_line"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_line" ADD CONSTRAINT "purchase_line_stock_item_id_stock_item_id_fk" FOREIGN KEY ("stock_item_id") REFERENCES "public"."stock_item"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order" ADD CONSTRAINT "purchase_order_supplier_id_supplier_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."supplier"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order" ADD CONSTRAINT "purchase_order_repair_order_id_repair_order_id_fk" FOREIGN KEY ("repair_order_id") REFERENCES "public"."repair_order"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order" ADD CONSTRAINT "purchase_order_estimate_id_estimate_id_fk" FOREIGN KEY ("estimate_id") REFERENCES "public"."estimate"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order" ADD CONSTRAINT "purchase_order_approved_by_app_user_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order" ADD CONSTRAINT "purchase_order_sent_by_app_user_id_fk" FOREIGN KEY ("sent_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order" ADD CONSTRAINT "purchase_order_invoice_by_app_user_id_fk" FOREIGN KEY ("invoice_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order" ADD CONSTRAINT "purchase_order_created_by_app_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_receipt" ADD CONSTRAINT "purchase_receipt_order_id_purchase_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."purchase_order"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_receipt" ADD CONSTRAINT "purchase_receipt_received_by_app_user_id_fk" FOREIGN KEY ("received_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_count" ADD CONSTRAINT "stock_count_counted_by_app_user_id_fk" FOREIGN KEY ("counted_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_item" ADD CONSTRAINT "stock_item_supplier_id_supplier_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."supplier"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_lot" ADD CONSTRAINT "stock_lot_item_id_stock_item_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."stock_item"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_move" ADD CONSTRAINT "stock_move_item_id_stock_item_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."stock_item"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_move" ADD CONSTRAINT "stock_move_repair_order_id_repair_order_id_fk" FOREIGN KEY ("repair_order_id") REFERENCES "public"."repair_order"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_move" ADD CONSTRAINT "stock_move_by_app_user_id_fk" FOREIGN KEY ("by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier" ADD CONSTRAINT "supplier_approved_by_app_user_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier" ADD CONSTRAINT "supplier_created_by_app_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_eval" ADD CONSTRAINT "supplier_eval_supplier_id_supplier_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."supplier"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_eval" ADD CONSTRAINT "supplier_eval_evaluated_by_app_user_id_fk" FOREIGN KEY ("evaluated_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_eval" ADD CONSTRAINT "supplier_eval_confirmed_by_app_user_id_fk" FOREIGN KEY ("confirmed_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "outsource_job_no_uq" ON "outsource_job" USING btree ("doc_no");--> statement-breakpoint
CREATE INDEX "outsource_job_ro_idx" ON "outsource_job" USING btree ("repair_order_id");--> statement-breakpoint
CREATE INDEX "outsource_job_status_idx" ON "outsource_job" USING btree ("status");--> statement-breakpoint
CREATE INDEX "purchase_line_order_idx" ON "purchase_line" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "purchase_order_no_uq" ON "purchase_order" USING btree ("doc_no");--> statement-breakpoint
CREATE INDEX "purchase_order_status_idx" ON "purchase_order" USING btree ("status");--> statement-breakpoint
CREATE INDEX "purchase_order_ro_idx" ON "purchase_order" USING btree ("repair_order_id");--> statement-breakpoint
CREATE INDEX "purchase_receipt_order_idx" ON "purchase_receipt" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "stock_item_kind_idx" ON "stock_item" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "stock_lot_item_idx" ON "stock_lot" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "stock_move_item_idx" ON "stock_move" USING btree ("item_id","at");--> statement-breakpoint
CREATE INDEX "supplier_status_idx" ON "supplier" USING btree ("status");--> statement-breakpoint
CREATE INDEX "supplier_eval_sup_idx" ON "supplier_eval" USING btree ("supplier_id");