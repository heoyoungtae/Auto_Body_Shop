// 고정 연장근로수당(포괄 약정 + 차액 정산)과 상시 근로자 5명 이상 자동 판정(대표 결정 2026-11-25)
import { describe, expect, it } from "vitest";
import { DEFAULT_CALENDAR } from "@/modules/platform/business-days";
import { checkContract, contractNumbers, fixedOtPay, type ContractTerms } from "@/modules/staff/contract-rules";
import { countHeadcount, priorMonth } from "@/modules/staff/headcount";
import { computeSlip, grossForNet, type PayPolicy } from "@/modules/staff/payroll-rules";

const terms = (o: Partial<ContractTerms> = {}): ContractTerms => ({
  contractType: "regular",
  startOn: "2026-01-01",
  endOn: "",
  place: "공업사",
  duties: "판금",
  workDays: [1, 2, 3, 4, 5],
  workStart: "09:00",
  workEnd: "18:00",
  breakStart: "12:00",
  breakEnd: "13:00",
  holiday: 0,
  payType: "monthly",
  basePay: 2_600_000,
  allowances: [{ name: "직무수당", amount: 200_000 }],
  bonus: "",
  payDay: 10,
  payMethod: "account",
  insurances: ["employment", "accident", "pension", "health"],
  extra: "",
  ...o,
});

const pol: PayPolicy = {
  legal5: true,
  fixedOtReviewMonths: 3,
  minWage: 10_320,
  pensionRate: 4750,
  healthRate: 3595,
  ltcRatio: 13140,
  employmentRate: 900,
  pensionCap: 6_370_000,
  pensionFloor: 400_000,
  mealExempt: 200_000,
  carExempt: 200_000,
  childcareExempt: 200_000,
  otExemptPayCap: 2_600_000,
  otExemptAnnual: 2_400_000,
  employmentEmployerRate: 1150,
  accidentRate: 0,
  taxTable: { pensionRate: 4500, pensionCap: 6_170_000, pensionFloor: 390_000, childOne: 12_500, childTwo: 29_160, childMore: 25_000 },
};
const att = (overtime: number) => ({ overtime, night: 0, holiday: 0, holidayOver8: 0, absentDays: 0, sickDays: 0, shortHours: 0, otApproved: overtime });
const slip = (t: ContractTerms, ot: number, extra: Partial<Parameters<typeof computeSlip>[0]> = {}) =>
  computeSlip({ name: "김판금", terms: t, ym: "2026-11", hiredOn: "2026-01-01", leftOn: null, att: att(ot), pol, incomeTax: 0, incomeTaxSource: "auto", family: 1, extras: [], ...extra });

describe("고정 연장근로수당", () => {
  const t = terms({ fixedOtHours: 20 });
  t.fixedOtAmount = fixedOtPay(t, true);

  it("통상시급에 넣지 않고, 금액은 통상시급 × 시간 × 1.5(5명 미만 × 1)", () => {
    expect(contractNumbers(t).hourly).toBe(13_397);
    expect(fixedOtPay(t, true)).toBe(401_910);
    expect(fixedOtPay(t, false)).toBe(267_940);
  });

  it("약정보다 덜 일해도 깎지 않고 차액 없음", () => {
    const d = slip(t, 15);
    expect(d.pays.find((p) => p.code === "fixot")?.amount).toBe(401_910);
    expect(d.pays.some((p) => p.code === "ot")).toBe(false);
    expect(d.fixedOt).toMatchObject({ hours: 20, actual: 15, diff: 0, overStreak: 0, underStreak: 0 });
  });

  it("약정보다 많이 일하면 그 달 차액을 더 준다", () => {
    const d = slip(t, 26);
    expect(d.pays.find((p) => p.code === "ot")).toMatchObject({ name: "연장수당 차액", amount: 120_573 });
    expect(d.fixedOt?.diff).toBe(120_573);
    expect(d.gross).toBe(2_800_000 + 401_910 + 120_573);
  });

  it("연속 차액·약정 절반 미만이 정책값 달 수만큼 이어지면 재검토를 알린다", () => {
    const over = slip(t, 26, { prevFixedOt: { hours: 20, amount: 401_910, actual: 25, legal: 0, diff: 1, overStreak: 2, underStreak: 0 } });
    expect(over.fixedOt?.overStreak).toBe(3);
    expect(over.warnings.some((w) => w.includes("3달 연속 약정 20시간보다 많이"))).toBe(true);
    const under = slip(t, 5, { prevFixedOt: { hours: 20, amount: 401_910, actual: 4, legal: 0, diff: 0, overStreak: 0, underStreak: 2 } });
    expect(under.warnings.some((w) => w.includes("절반에 못 미칩니다"))).toBe(true);
  });

  it("입사 달은 일할한다", () => {
    const d = computeSlip({ name: "김판금", terms: t, ym: "2026-11", hiredOn: "2026-11-16", leftOn: null, att: att(0), pol, incomeTax: 0, incomeTaxSource: "auto", family: 1, extras: [] });
    expect(d.pays.find((p) => p.code === "fixot")?.amount).toBe(Math.round((401_910 * 15) / 30));
  });

  it("약정 없으면 지금처럼 실제 시간만", () => {
    const d = slip(terms(), 10);
    expect(d.pays.find((p) => p.code === "ot")).toMatchObject({ name: "연장근로수당", amount: Math.round(13_397 * 10 * 1.5) });
    expect(d.fixedOt).toBeUndefined();
  });

  it("계약서: 연장수당을 고정 수당 칸에 넣거나 상한을 넘기면 저장을 막는다", () => {
    const o = { minWage: 10_320, legal5: true, fixedOtMax: 52 };
    expect(checkContract(terms({ allowances: [{ name: "고정 연장수당", amount: 300_000 }] }), o).errors.join()).toContain("약정 연장시간");
    expect(checkContract(terms({ fixedOtHours: 60 }), o).errors.join()).toContain("52시간");
    expect(checkContract(terms({ fixedOtHours: 20 }), o).errors).toEqual([]);
  });
});

describe("상시 근로자 5명 이상 자동 판정", () => {
  const m = (hiredOn: string, leftOn: string | null = null) => ({ hiredOn, leftOn });

  it("판단하는 날 전 1개월", () => {
    expect(priorMonth("2026-11-25")).toEqual({ from: "2026-10-25", to: "2026-11-24" });
    expect(priorMonth("2026-03-31")).toEqual({ from: "2026-02-28", to: "2026-03-30" });
  });

  it("5명 미만인 날이 영업일 절반 미만이면 5명 이상", () => {
    const five = [1, 2, 3, 4, 5].map(() => m("2026-01-01"));
    expect(countHeadcount(five, "2026-11-25", DEFAULT_CALENDAR)).toMatchObject({ legal5: true, belowDays: 0, registered: true });
    expect(countHeadcount(five.slice(0, 4), "2026-11-25", DEFAULT_CALENDAR).legal5).toBe(false);
    // 다섯째 직원이 기간 중간 넘어 들어오면(미만인 날이 절반 이상) 5명 미만
    expect(countHeadcount([...five.slice(0, 4), m("2026-11-20")], "2026-11-25", DEFAULT_CALENDAR).legal5).toBe(false);
    // 다섯째가 기간 초반에 들어오면 5명 이상
    expect(countHeadcount([...five.slice(0, 4), m("2026-10-27")], "2026-11-25", DEFAULT_CALENDAR).legal5).toBe(true);
  });

  it("직원 등록 전이면 registered=false", () => {
    expect(countHeadcount([], "2026-11-25", DEFAULT_CALENDAR).registered).toBe(false);
  });
});

describe("실수령액에서 세전 기본급 거꾸로 계산", () => {
  it("구한 기본급으로 계산하면 실수령이 목표 이상이고, 1,000원 적으면 목표 미만", () => {
    const t = terms({ allowances: [{ name: "식대", amount: 200_000 }], fixedOtHours: 20 });
    const r = grossForNet({ target: 3_000_000, terms: t, pol, family: 1, children: 0 })!;
    expect(r.net).toBeGreaterThanOrEqual(3_000_000);
    expect(r.basePay % 1000).toBe(0);
    const less = grossForNet({ target: r.net, terms: t, pol, family: 1, children: 0 })!;
    expect(less.basePay).toBe(r.basePay);
    expect(r.cost).toBeGreaterThan(r.gross);
  });

  it("비과세 식대를 넣으면 같은 실수령에 회사 총비용이 줄어든다", () => {
    const plain = grossForNet({ target: 2_800_000, terms: terms({ allowances: [] }), pol, family: 1, children: 0 })!;
    const meal = grossForNet({ target: 2_800_000, terms: terms({ allowances: [{ name: "식대", amount: 200_000 }] }), pol, family: 1, children: 0 })!;
    expect(meal.cost).toBeLessThan(plain.cost);
  });
});

describe("미사용 연차수당", () => {
  it("보상하면 통상임금 일급 × 남은 일수, 촉진 완료면 줄 없이 안내만", () => {
    const paid = slip(terms(), 0, { leavePay: { days: 3, reason: "남은 3일", paid: true } });
    expect(paid.pays.find((p) => p.code === "leave")?.amount).toBe(Math.round(13_397 * 8) * 3);
    const done = slip(terms(), 0, { leavePay: { days: 3, reason: "남은 3일", paid: false } });
    expect(done.pays.some((p) => p.code === "leave")).toBe(false);
    expect(done.warnings.join()).toContain("촉진");
  });
});
