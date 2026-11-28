// 비과세 급여 수당 점검 반영(대표 결정 2026-11-28): 고정 연장수당은 실제 인정 시간분만 비과세,
// 고정 수당 비과세 조건 확인·같은 종류 한도 합산, 기타 지급 비과세 종류(출산지원금·현물), 지난해 총급여 조건
import { describe, expect, it } from "vitest";
import { fixedOtPay, type ContractTerms } from "@/modules/staff/contract-rules";
import { computeSlip, type PayPolicy } from "@/modules/staff/payroll-rules";
import { payItemKey } from "@/modules/help/pay-items";

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
  basePay: 2_090_000,
  allowances: [{ name: "식대", amount: 200_000 }],
  bonus: "",
  payDay: 10,
  payMethod: "account",
  insurances: ["employment", "accident", "pension", "health"],
  extra: "",
  ...o,
});
const pol: PayPolicy = {
  legal5: true,
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
  otExemptPrevGross: 37_000_000,
  groupInsExempt: 700_000,
  discountExempt: 2_400_000,
  employmentEmployerRate: 1150,
  accidentRate: 0,
  taxTable: { pensionRate: 4500, pensionCap: 6_170_000, pensionFloor: 390_000, childOne: 12_500, childTwo: 29_160, childMore: 25_000 },
};
const att = (overtime: number) => ({ overtime, night: 0, holiday: 0, holidayOver8: 0, absentDays: 0, sickDays: 0, shortHours: 0 });
const slip = (t: ContractTerms, ot: number, extra: Partial<Parameters<typeof computeSlip>[0]> = {}) =>
  computeSlip({ name: "김판금", terms: t, ym: "2026-11", hiredOn: "2026-01-01", leftOn: null, att: att(ot), pol, incomeTax: 0, incomeTaxSource: "auto", family: 1, extras: [], tfOk: ["meal"], ...extra });

describe("고정 연장근로수당 비과세", () => {
  const t = terms({ fixedOtHours: 20 });
  t.fixedOtAmount = fixedOtPay(t, true);
  const hourly = Math.floor((2_090_000 + 200_000) / 209);

  it("덜 일한 달은 실제 인정 시간분만 비과세, 나머지는 과세", () => {
    const d = slip(t, 12, { production: true });
    const fix = d.pays.find((p) => p.code === "fixot")!;
    expect(fix.amount).toBe(t.fixedOtAmount);
    expect(fix.taxfree).toBe(Math.round(hourly * 12 * 1.5));
    expect(fix.calc).toContain("실제로 안 일한 시간분");
  });
  it("약정보다 더 일하면 고정분 전부와 차액이 비과세", () => {
    const d = slip(t, 25, { production: true });
    const fix = d.pays.find((p) => p.code === "fixot")!;
    const diff = d.pays.find((p) => p.code === "ot")!;
    expect(fix.taxfree).toBe(fix.amount);
    expect(diff.taxfree).toBe(diff.amount);
  });
  it("연장을 안 한 달은 고정 연장수당 전부 과세이고, 안 일한 몫이 월정액급여에 들어가 기준을 넘을 수 있다", () => {
    const d = slip(t, 0, { production: true });
    expect(d.pays.find((p) => p.code === "fixot")!.taxfree).toBeUndefined();
    expect(d.otTaxfree).toBeUndefined();
    // 기본급 240만: 연장을 다 하면 월정액 240만(기준 안), 하나도 안 하면 240만 + 고정 연장수당(기준 넘음)
    const t2 = terms({ basePay: 2_400_000, fixedOtHours: 20 });
    t2.fixedOtAmount = fixedOtPay(t2, true);
    expect(slip(t2, 20, { production: true }).otTaxfree).toBeGreaterThan(0);
    expect(slip(t2, 0, { production: true }).warnings.join(" ")).toContain("실제로 안 일한 고정 연장수당");
  });
  it("지난해 총급여가 기준을 넘으면 생산직이어도 과세", () => {
    const d = slip(t, 25, { production: true, prevYearGross: 38_000_000 });
    expect(d.otTaxfree).toBeUndefined();
    expect(d.warnings.join(" ")).toContain("지난해");
    expect(slip(t, 25, { production: true, prevYearGross: 30_000_000 }).otTaxfree).toBeGreaterThan(0);
  });
});

describe("고정 수당 비과세 조건·한도", () => {
  it("조건 확인을 안 한 수당은 과세, 확인 전(예전 자료)은 이름으로 보고 경고", () => {
    expect(slip(terms(), 0, { tfOk: [] }).taxfree).toBe(0);
    const legacy = slip(terms(), 0, { tfOk: undefined });
    expect(legacy.taxfree).toBe(200_000);
    expect(legacy.warnings.join(" ")).toContain("이름만 보고");
  });
  it("같은 종류 수당이 두 줄이면 한도를 합쳐 한 번만", () => {
    const d = slip(terms({ basePay: 2_000_000, allowances: [{ name: "식대", amount: 150_000 }, { name: "중식비", amount: 100_000 }] }), 0);
    expect(d.taxfree).toBe(200_000);
  });
  it("교통비는 과세", () => {
    const d = slip(terms({ allowances: [{ name: "교통비", amount: 100_000 }] }), 0);
    expect(d.taxfree).toBe(0);
    expect(payItemKey(d.pays[1], d, "pay")).toBe("allowance");
  });
});

describe("기타 지급 비과세 종류", () => {
  it("출산지원금은 전액 비과세, 3번째면 경고", () => {
    const e = { kind: "pay" as const, name: "출산지원금", amount: 3_000_000, reason: "첫째 출산", tf: "birth" as const, taxable: false };
    const d = slip(terms(), 0, { extras: [e] });
    expect(d.taxfree).toBe(200_000 + 3_000_000);
    expect(payItemKey(d.pays.find((p) => p.code === "extra")!, d, "pay")).toBe("birth");
    expect(slip(terms(), 0, { extras: [e], tfUsed: { birthCount: 2 } }).warnings.join(" ")).toContain("3번째");
  });
  it("직원 할인은 현물: 연 한도 넘는 몫만 과세, 실수령은 그대로", () => {
    const base = slip(terms(), 0);
    const e = { kind: "pay" as const, name: "판금 수리 할인", amount: 500_000, reason: "본인 차 범퍼", tf: "discount" as const, taxable: false };
    const d = slip(terms(), 0, { extras: [e], tfUsed: { discount: 2_100_000 } });
    expect(d.pays.find((p) => p.code === "extra")!.taxfree).toBe(300_000);
    expect(d.deducts.find((p) => p.code === "inkind")!.amount).toBe(500_000);
    expect(d.insBase - base.insBase).toBe(200_000);
    expect(d.tfExtra?.discount).toBe(300_000);
  });
});
