ALTER TABLE "ro_damage" ADD COLUMN "from_intake" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- 이미 입고 도면에서 불러온 진단 줄 표시(그때 적은 메모로 알아본다)
UPDATE "ro_damage" SET "from_intake" = true WHERE "note" LIKE '입고 도면에서 불러옴%';
