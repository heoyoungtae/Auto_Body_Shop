// 비품·설비 감가상각 계산·품명 짐작(대표 지시 2026-11-12)
import { describe, expect, it } from "vitest";
import { depNow, depOfMonth, depSchedule, guessAsset, memoValue } from "@/modules/asset/rules";
import { feeMonthsDue } from "@/modules/asset/service";

describe("감가상각", () => {
  it("정액법 5년: 첫해는 쓴 달만(월할), 끝나면 비망가액만 남는다", () => {
    const a = { cost: 6_000_000, method: "sl", years: 5, startOn: "2026-07-15" };
    const s = depSchedule(a, 2032);
    expect(s[0]).toMatchObject({ year: 2026, months: 6, dep: 600_000 });
    expect(s[1].dep).toBe(1_200_000);
    const last = s[s.length - 1];
    expect(last.book).toBe(memoValue(6_000_000));
    expect(last.book).toBe(1000);
    expect(depOfMonth(a, "2026-06")).toBe(0);
    expect(depOfMonth(a, "2026-07")).toBe(100_000);
    expect(depOfMonth(a, "2027-03")).toBe(100_000);
  });

  it("정률법 5년(상각률 0.451)은 장부가에 곱한다", () => {
    const s = depSchedule({ cost: 10_000_000, method: "db", years: 5, startOn: "2026-01-02" }, 2027);
    expect(s[0].dep).toBe(4_510_000);
    expect(s[1].dep).toBe(Math.round((10_000_000 - 4_510_000) * 0.451));
  });

  it("자본적 지출은 그 해부터 취득가에 더한다", () => {
    const base = { cost: 6_000_000, method: "sl", years: 5, startOn: "2026-01-05" };
    const plus = depNow({ ...base, adds: [{ on: "2027-03-02", won: 1_000_000 }] }, 2027);
    const without = depNow(base, 2027);
    expect(plus.cost).toBe(7_000_000);
    expect(plus.thisYear).toBeGreaterThan(without.thisYear);
  });

  it("산 날 비용 처리는 그 해 전액, 장부가 0. 상각 안 함·빌린 것은 0", () => {
    expect(depNow({ cost: 800_000, method: "expense", years: null, startOn: "2026-11-01" }, 2026)).toMatchObject({ thisYear: 800_000, book: 0 });
    expect(depNow({ cost: 800_000, method: "none", years: null, startOn: null }, 2026)).toMatchObject({ thisYear: 0, book: 800_000 });
  });

  it("처분한 해는 처분 달까지만", () => {
    const s = depSchedule({ cost: 1_200_000, method: "sl", years: 5, startOn: "2026-01-01", disposedOn: "2027-03-31" }, 2030);
    expect(s.map((r) => r.year)).toEqual([2026, 2027]);
    expect(s[1].months).toBe(3);
  });
});

describe("품명 짐작·사용료", () => {
  it("부스·리프트는 설비, 그 밖은 비품", () => {
    expect(guessAsset("도장 부스 필터 교체형")).toMatchObject({ kind: "equipment", eqKind: "booth" });
    expect(guessAsset("2주식 리프트")).toMatchObject({ kind: "equipment", eqKind: "lift" });
    expect(guessAsset("전동 샌더").kind).toBe("fixture");
  });

  it("유상 임차는 계약 시작 달부터 이번 달까지, 낸 달 다음부터", () => {
    const a = { ownership: "lease", status: "in_use", feeBilledYm: null, contract: { party: "렌탈사", start: "2026-09-10", feeWon: 100_000, repairBy: "owner" as const } };
    expect(feeMonthsDue(a, "2026-11-12")).toEqual(["2026-09", "2026-10", "2026-11"]);
    expect(feeMonthsDue({ ...a, feeBilledYm: "2026-10" }, "2026-11-12")).toEqual(["2026-11"]);
    expect(feeMonthsDue({ ...a, ownership: "loan" }, "2026-11-12")).toEqual([]);
  });
});
