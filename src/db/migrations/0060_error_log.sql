CREATE TABLE "error_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"kind" text NOT NULL,
	"fingerprint" text NOT NULL,
	"message" text NOT NULL,
	"detail" text DEFAULT '' NOT NULL,
	"path" text DEFAULT '' NOT NULL,
	"user_id" uuid,
	"code" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE INDEX "error_log_at_idx" ON "error_log" USING btree ("at");--> statement-breakpoint
CREATE INDEX "error_log_fp_idx" ON "error_log" USING btree ("fingerprint","at");--> statement-breakpoint
CREATE INDEX "error_log_code_idx" ON "error_log" USING btree ("code");