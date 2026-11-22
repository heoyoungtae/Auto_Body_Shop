-- 덴트(PDR)·광택 작업을 하지 않는다(대표 2026-11-22). 개업 전이라 시연 기록만 옮긴다.
-- 수리 방법: 덴트·광택 → 부분 판금+도장
UPDATE "ro_damage" SET "method" = 'partial' WHERE "method" IN ('pdr', 'polish');--> statement-breakpoint
UPDATE "ro_damage" SET "suggested" = 'partial' WHERE "suggested" IN ('pdr', 'polish');--> statement-breakpoint
-- 견적 줄 구분: 덴트 → 판금, 광택 → 도장
UPDATE "estimate_line" SET "category" = 'sheet' WHERE "category" = 'dent';--> statement-breakpoint
UPDATE "estimate_line" SET "category" = 'paint' WHERE "category" = 'polish';--> statement-breakpoint
-- 공정: 덴트 → 판금('polish' 공정은 이름만 '도장 마무리(연마)'로 남는다)
UPDATE "work_step" SET "process" = 'sheet' WHERE "process" = 'dent';--> statement-breakpoint
-- 작업장 종류: 덴트실 → 판금, '광택·세차' → '세차'
UPDATE "workplace" SET "kind" = 'panel' WHERE "kind" = 'dent';--> statement-breakpoint
UPDATE "workplace" SET "kind" = 'wash' WHERE "kind" = 'polish';--> statement-breakpoint
-- 역량 표: 덴트 직무 없앰
DELETE FROM "competency" WHERE "skill" = 'dent';--> statement-breakpoint
-- 공업사가 더한 공임 항목의 구분도 같이 옮긴다
UPDATE "app_config" SET "data" = (
  SELECT COALESCE(jsonb_agg(CASE
    WHEN e->>'cat' = 'dent' THEN jsonb_set(e, '{cat}', '"sheet"')
    WHEN e->>'cat' = 'polish' THEN jsonb_set(e, '{cat}', '"paint"')
    ELSE e END), '[]'::jsonb)
  FROM jsonb_array_elements("data") e
) WHERE "key" = 'labor_custom' AND jsonb_typeof("data") = 'array';
