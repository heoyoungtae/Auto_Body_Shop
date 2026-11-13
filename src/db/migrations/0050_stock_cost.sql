ALTER TABLE "stock_item" ADD COLUMN "value_won" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "stock_move" ADD COLUMN "unit_won" integer;--> statement-breakpoint
ALTER TABLE "stock_move" ADD COLUMN "amount_won" integer;--> statement-breakpoint
-- 이미 있는 재고: 단가 기록이 없으므로 최근 매입 단가로 금액을 채운다(개업 전이라 기록이 거의 없음)
UPDATE "stock_item" SET "value_won" = GREATEST("qty", 0) * "unit_won";--> statement-breakpoint
UPDATE "stock_move" m SET "unit_won" = i."unit_won", "amount_won" = m."qty" * i."unit_won" FROM "stock_item" i WHERE i."id" = m."item_id";
