import { describe, expect, it } from "vitest";
import { addBusinessDays, closedReason, DEFAULT_CALENDAR, isBusinessDay, type ShopCalendar } from "@/modules/platform/business-days";
import { panelsFor } from "@/modules/dashboard/service";

const cal = (o: Partial<ShopCalendar> = {}): ShopCalendar => ({ ...DEFAULT_CALENDAR, ...o });

describe("영업일 설정", () => {
  it("공휴일에 쉬기로 하면 공휴일·대체공휴일을 건너뛴다", () => {
    // 2026-09-23(수) → 추석 9/24~26, 주말 → 9/28(월)
    expect(addBusinessDays("2026-09-23", 1, cal())).toBe("2026-09-28");
    expect(closedReason(cal(), "2026-10-05")).toBe("대체공휴일(개천절)");
  });
  it("공휴일에도 영업하면 영업 요일인 공휴일은 센다", () => {
    expect(addBusinessDays("2026-09-23", 1, cal({ excludeHolidays: false }))).toBe("2026-09-24");
    expect(isBusinessDay(cal({ excludeHolidays: false }), "2026-09-26")).toBe(false); // 토요일
  });
  it("토요일 영업, 가게 휴무, 특별 영업일, 공휴일 추가", () => {
    const c = cal({ workdays: [1, 2, 3, 4, 5, 6], days: { "2026-11-11": { kind: "closed", name: "설비 점검" }, "2026-11-15": { kind: "open", name: "" }, "2026-11-12": { kind: "holiday", name: "임시공휴일" } } });
    expect(isBusinessDay(c, "2026-11-14")).toBe(true);
    expect(closedReason(c, "2026-11-11")).toBe("가게 휴무: 설비 점검");
    expect(isBusinessDay(c, "2026-11-15")).toBe(true); // 일요일이지만 특별 영업
    expect(closedReason(c, "2026-11-12")).toBe("임시공휴일");
    expect(isBusinessDay({ ...c, excludeHolidays: false }, "2026-11-12")).toBe(true);
  });
});

describe("대시보드 패널", () => {
  it("역할에 따라 패널이 다르다", () => {
    expect(panelsFor(["advisor"])).toEqual(expect.arrayContaining(["intake", "due", "consent", "todo"]));
    expect(panelsFor(["advisor"])).not.toContain("month");
    expect(panelsFor(["technician"])).not.toContain("intake");
    expect(panelsFor(["technician"])).toContain("mywork");
    expect(panelsFor(["owner"])).toContain("month");
  });
});
