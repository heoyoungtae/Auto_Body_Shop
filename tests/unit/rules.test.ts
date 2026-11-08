import { describe, expect, it } from "vitest";
import { DEFAULT_DELEGATION, pickApprover, validateBands, type Band } from "@/modules/platform/delegation";
import { DEFAULT_POLICY, defaultPolicy } from "@/modules/platform/policy";
import { addDays, seoulDate, seoulPeriod } from "@/modules/platform/time";

describe("전결 규정(부록 B)", () => {
  const discount = DEFAULT_DELEGATION.discount.bands as Band[];
  it("할인 5% 이하는 상담원, 10% 이하는 공장장, 그 위는 대표", () => {
    expect(pickApprover(discount, 5)).toBe("advisor");
    expect(pickApprover(discount, 5.5)).toBe("plant_manager");
    expect(pickApprover(discount, 10)).toBe("plant_manager");
    expect(pickApprover(discount, 12)).toBe("owner");
  });
  it("일반 지출 10만·30만 원 구간", () => {
    const b = DEFAULT_DELEGATION.expense.bands as Band[];
    expect(pickApprover(b, 100_000)).toBe("advisor");
    expect(pickApprover(b, 300_000)).toBe("plant_manager");
    expect(pickApprover(b, 300_001)).toBe("owner");
  });
  it("본인 건은 한 단계 위로 올린다(공장장 본인 연장근로는 대표)", () => {
    expect(pickApprover(DEFAULT_DELEGATION.overtime.bands as Band[], null, ["plant_manager"])).toBe("owner");
    expect(pickApprover(discount, 3, ["advisor"])).toBe("plant_manager");
  });
  it("구간 검사: 마지막은 상한 없음, 상한과 역할은 올라가는 순서", () => {
    expect(() => validateBands([{ upTo: 10, role: "owner" }])).toThrow();
    expect(() => validateBands([{ upTo: 10, role: "owner" }, { upTo: null, role: "plant_manager" }])).toThrow();
    expect(() => validateBands([{ upTo: 10, role: "advisor" }, { upTo: 5, role: "plant_manager" }, { upTo: null, role: "owner" }])).toThrow();
    expect(() => validateBands([{ upTo: 3, role: "advisor" }, { upTo: null, role: "owner" }])).not.toThrow();
  });
});

describe("정책값 기본값(부록 D)", () => {
  it("표준서의 제안값과 같다", () => {
    const p = defaultPolicy();
    expect(p["survey.delay_days"]).toBe(7);
    expect(p["five_s.nc_threshold"]).toBe(80);
    expect(p["lube.alert_days_before"]).toBe(3);
    expect(p["pm.alert_days_before"]).toBe(7);
    expect(p["estimate.valid_days"]).toBe(14);
    expect(p["competency.min_solo_level"]).toBe(2);
  });
  it("모든 정책값에 근거 조항과 이름이 있다", () => {
    for (const d of Object.values(DEFAULT_POLICY)) {
      expect(d.label).toBeTruthy();
      expect(d.clause).toBeTruthy();
    }
  });
});

describe("날짜", () => {
  it("한국 시각 기준", () => {
    expect(seoulDate(new Date("2026-11-07T16:00:00Z"))).toBe("2026-11-08");
    expect(seoulPeriod(new Date("2026-11-07T16:00:00Z"))).toBe("2611");
    expect(addDays("2026-12-30", 3)).toBe("2027-01-02");
  });
});
