// 급여대장·임금명세서(F-11-05): 계산 규칙(가산·일할·공제·보험), 계산 → 승인 → 지급 → 명세서 열람 권한
import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { act } from "@/modules/approval/service";
import { DEFAULT_CALENDAR } from "@/modules/platform/business-days";
import { requestLeave } from "@/modules/staff/attendance";
import type { ContractTerms } from "@/modules/staff/contract-rules";
import {
  approveContract,
  saveContract,
  signDocument,
} from "@/modules/staff/documents";
import { saveProfile } from "@/modules/staff/service";
import {
  approvePayroll,
  getRun,
  getSlip,
  markPayrollPaid,
  mySlips,
  payrollTodos,
  preparePayroll,
  recalcPayroll,
  returnPayroll,
  setSlipInputs,
  submitPayroll,
} from "@/modules/staff/payroll";
import {
  computeSlip,
  nightHours,
  payDateFor,
  summarizeAttendance,
  type PayPolicy,
} from "@/modules/staff/payroll-rules";
import { workDay } from "@/db/schema";
import { seedShop, testDb } from "./db";

const terms = (o: Partial<ContractTerms> = {}): ContractTerms => ({
  contractType: "regular",
  startOn: "2026-10-01",
  endOn: "",
  place: "본 사업장",
  duties: "판금",
  workDays: [1, 2, 3, 4, 5],
  workStart: "09:00",
  workEnd: "18:00",
  breakStart: "12:00",
  breakEnd: "13:00",
  holiday: 0,
  payType: "monthly",
  basePay: 2_500_000,
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
  employmentEmployerRate: 1150,
  accidentRate: 0,
  taxTable: {
    pensionRate: 4500,
    pensionCap: 5_900_000,
    pensionFloor: 370_000,
    childOne: 12_500,
    childTwo: 29_160,
    childMore: 25_000,
  },
};
const att0 = {
  overtime: 0,
  night: 0,
  holiday: 0,
  holidayOver8: 0,
  absentDays: 0,
  sickDays: 0,
  shortHours: 0,
};

describe("급여 계산 규칙", () => {
  it("월급: 통상시급, 연장·야간·휴일 가산, 식대 비과세, 4대 보험, 소득세", () => {
    expect(nightHours("20:00", "23:30")).toBe(1.5);
    expect(nightHours("23:00", "02:00")).toBe(3);
    const d = computeSlip({
      name: "정기술",
      terms: terms(),
      ym: "2026-11",
      hiredOn: "2026-10-01",
      leftOn: null,
      att: { ...att0, overtime: 4, night: 1, holiday: 10, holidayOver8: 0 },
      pol,
      incomeTax: 50_000,
      incomeTaxSource: "manual",
      family: 1,
      extras: [],
    });
    // (2,500,000 + 200,000) ÷ 209 = 12,918
    expect(d.hourly).toBe(12_918);
    expect(d.pays.find((p) => p.code === "ot")!.amount).toBe(
      Math.round(12_918 * 4 * 1.5),
    );
    expect(d.pays.find((p) => p.code === "hol")!.amount).toBe(
      Math.round(12_918 * 10 * 1.5),
    );
    expect(d.pays.find((p) => p.code === "night")!.amount).toBe(
      Math.round(12_918 * 0.5),
    );
    expect(d.taxfree).toBe(200_000);
    expect(d.insBase).toBe(d.gross - 200_000);
    const pension = d.deducts.find((x) => x.code === "pension")!.amount;
    expect(pension).toBe(
      Math.floor((Math.floor(d.insBase / 1000) * 1000 * 0.0475) / 10) * 10,
    );
    expect(d.deducts.find((x) => x.code === "local_tax")!.amount).toBe(5_000);
    expect(d.net).toBe(d.gross - d.deductTotal);
  });

  it("5명 미만은 가산 없음, 입사 달 일할, 결근 공제, 휴일 8시간 넘으면 2배", () => {
    const small = computeSlip({
      name: "a",
      terms: terms({ allowances: [] }),
      ym: "2026-11",
      hiredOn: "2026-11-16",
      leftOn: null,
      att: { ...att0, overtime: 2, absentDays: 1 },
      pol: { ...pol, legal5: false },
      incomeTax: 0,
      incomeTaxSource: "none",
      family: 1,
      extras: [],
    });
    expect(small.pays[0].amount).toBe(Math.round((2_500_000 * 15) / 30));
    const hourly = Math.floor(2_500_000 / 209);
    expect(small.pays.find((p) => p.code === "ot")!.amount).toBe(
      Math.round(hourly * 2),
    );
    expect(small.pays.find((p) => p.code === "absent")!.amount).toBe(
      -Math.round(hourly * 8),
    );
    const big = computeSlip({
      name: "b",
      terms: terms({ allowances: [] }),
      ym: "2026-11",
      hiredOn: null,
      leftOn: null,
      att: { ...att0, holiday: 8, holidayOver8: 2 },
      pol,
      incomeTax: 0,
      incomeTaxSource: "none",
      family: 1,
      extras: [],
    });
    expect(big.pays.find((p) => p.code === "hol")!.amount).toBe(
      Math.round(hourly * (8 * 1.5 + 2 * 2)),
    );
    // 다음 달 10일이 휴일이면 앞 영업일: 2027-01-10 은 일요일 → 1월 8일(금)
    expect(payDateFor("2026-12", 10, DEFAULT_CALENDAR)).toBe("2027-01-08");
    const a = summarizeAttendance(
      [
        {
          leaveKind: "overtime",
          fromDate: "2026-11-07",
          toDate: "2026-11-07",
          fromTime: "09:00",
          toTime: "19:00",
          days: 1,
          hours: 10,
        },
        {
          leaveKind: "absent",
          fromDate: "2026-11-12",
          toDate: "2026-11-16",
          fromTime: "",
          toTime: "",
          days: 3,
          hours: 0,
        },
      ],
      "2026-11",
      DEFAULT_CALENDAR,
    );
    expect(a).toMatchObject({
      holiday: 8,
      holidayOver8: 2,
      absentDays: 3,
      overtime: 0,
    });
  });
});

let db: Db;
let ids: Awaited<ReturnType<typeof seedShop>>;
beforeEach(async () => {
  db = await testDb();
  ids = await seedShop(db);
});
const PNG = new Uint8Array(400).fill(7);
const owner = () => ({ id: ids.owner, roles: ["owner" as const] });
const acct = () => ({ id: ids.account, roles: ["accounting" as const] });
const tech = () => ({ id: ids.tech1, roles: ["technician" as const] });
const tech2 = () => ({ id: ids.tech2, roles: ["technician" as const] });

async function hire(
  userId: string,
  actor: { id: string; roles: "technician"[] },
  t: ContractTerms,
) {
  const at = new Date("2026-09-20T01:00:00Z");
  await saveProfile(
    db,
    acct(),
    userId,
    {
      job: "판금 기술자",
      gender: "",
      birth: "1990-01-02",
      phone: "01012345678",
      emName: "",
      emRelation: "",
      emPhone: "",
      zip: "12345",
      address: "서울 중구 세종대로 1",
      addressDetail: "",
      career: "",
      hiredOn: t.startOn,
      contractKind: "regular",
      contractEnd: "",
      licenses: [],
      leftOn: "",
      leftReason: "",
    },
    at,
  );
  const { doc } = await saveContract(db, acct(), userId, t, undefined, at);
  await approveContract(db, owner(), doc.id, at);
  await signDocument(db, actor, doc.id, PNG, at);
}

describe("급여대장 흐름", () => {
  it("계산 → 소득세 입력 → 승인 요청 → 돌려보냄 → 승인 → 지급 → 명세서", async () => {
    await hire(ids.tech1, tech(), terms());
    // 11월 연장근무(승인) 2시간
    const nov3 = new Date("2026-11-03T01:00:00Z");
    const ot = await requestLeave(
      db,
      tech(),
      {
        leaveKind: "overtime",
        fromDate: "2026-11-04",
        toDate: "",
        fromTime: "18:00",
        toTime: "20:00",
        reason: "출고 마감",
      },
      nov3,
    );
    await act(db, ot.id, ids.manager, "approve", null, nov3);
    // 실제 출퇴근(09:00~20:30): 승인 18:00~20:00 이 모두 겹쳐 2시간 인정
    await db.insert(workDay).values({ userId: ids.tech1, day: "2026-11-04", inAt: new Date("2026-11-04T00:00:00Z"), outAt: new Date("2026-11-04T11:30:00Z") });
    const dec4 = new Date("2026-12-04T01:00:00Z");
    expect(
      (await payrollTodos(db, acct(), "2026-12-04")).map((t) => t.key),
    ).toContain("py-prep-2026-11");
    await expect(preparePayroll(db, tech(), "2026-11", dec4)).rejects.toThrow(
      /회계/,
    );
    const { id } = await preparePayroll(db, acct(), "2026-11", dec4);
    await expect(preparePayroll(db, acct(), "2026-11", dec4)).rejects.toThrow(
      /이미/,
    );
    const r = (await getRun(db, acct(), "2026-11"))!;
    expect(r.r.payDate).toBe("2026-12-10");
    expect(r.slips).toHaveLength(1);
    const s = r.slips[0];
    expect(s.d.att.overtime).toBe(2);
    // 소득세는 간이세액표 방식으로 자동 계산
    expect(s.d.incomeTaxSource).toBe("auto");
    expect(s.d.incomeTax).toBeGreaterThan(0);
    const autoTax = s.d.incomeTax;
    // 회사 부담: 연금·건강·요양은 근로자와 같고, 고용보험은 회사 요율, 퇴직급여 적립 참고
    const emp = s.d.employer!;
    expect(emp.find((e) => e.code === "pension")!.amount).toBe(
      s.d.deducts.find((e) => e.code === "pension")!.amount,
    );
    expect(emp.find((e) => e.code === "employment")!.amount).toBe(
      Math.floor((s.d.insBase * 0.0115) / 10) * 10,
    );
    expect(s.d.employerTotal).toBe(emp.reduce((n, e) => n + e.amount, 0));
    // 자녀 수는 가족 수보다 적어야 함
    await expect(
      setSlipInputs(
        db,
        acct(),
        s.s.id,
        { incomeTax: null, family: 1, children: 1, extras: [] },
        dec4,
      ),
    ).rejects.toThrow(/자녀/);
    // 가족 2명(자녀 1명) → 자동 계산이 줄고, 비우면 자동으로 남는다
    await setSlipInputs(
      db,
      acct(),
      s.s.id,
      { incomeTax: null, family: 2, children: 1, extras: [] },
      dec4,
    );
    const kid = (await getRun(db, acct(), "2026-11"))!.slips[0].d;
    expect(kid.incomeTaxSource).toBe("auto");
    expect(kid.incomeTax).toBeLessThan(autoTax);
    await expect(getRun(db, tech(), "2026-11")).rejects.toThrow(/대표·회계/);
    await expect(
      setSlipInputs(
        db,
        acct(),
        s.s.id,
        {
          incomeTax: 40_000,
          family: 1,
          extras: [
            { kind: "pay", name: "성과급", amount: 100_000, reason: " " },
          ],
        },
        dec4,
      ),
    ).rejects.toThrow(/사유/);
    await setSlipInputs(
      db,
      acct(),
      s.s.id,
      {
        incomeTax: 40_000,
        family: 2,
        extras: [
          {
            kind: "pay",
            name: "성과급",
            amount: 100_000,
            reason: "무재작업 3개월",
          },
        ],
      },
      dec4,
    );
    // 다시 계산해도 입력값 유지
    await recalcPayroll(db, acct(), id, dec4);
    const after = (await getRun(db, acct(), "2026-11"))!.slips[0].d;
    expect(after).toMatchObject({
      incomeTax: 40_000,
      family: 2,
      incomeTaxSource: "manual",
    });
    expect(
      after.pays.some((p) => p.name === "성과급" && p.amount === 100_000),
    ).toBe(true);
    await submitPayroll(db, acct(), id, dec4);
    await expect(
      setSlipInputs(
        db,
        acct(),
        s.s.id,
        { incomeTax: 1, family: 1, extras: [] },
        dec4,
      ),
    ).rejects.toThrow(/계산 중/);
    expect(
      (await payrollTodos(db, owner(), "2026-12-04")).some(
        (t) => t.key === `py-approve-${id}`,
      ),
    ).toBe(true);
    await expect(approvePayroll(db, acct(), id, dec4)).rejects.toThrow(/대표/);
    await returnPayroll(db, owner(), id, "성과급 근거 첨부", dec4);
    await submitPayroll(db, acct(), id, dec4);
    await approvePayroll(db, owner(), id, dec4);
    // 지급 전에는 본인도 못 봄
    await expect(getSlip(db, tech(), s.s.id, dec4)).rejects.toThrow(/본인/);
    const dec10 = new Date("2026-12-10T01:00:00Z");
    await expect(
      markPayrollPaid(db, acct(), id, "2026-12-11", dec10),
    ).rejects.toThrow(/오늘 이후/);
    await markPayrollPaid(db, acct(), id, "2026-12-10", dec10);
    expect(await mySlips(db, tech())).toHaveLength(1);
    const mine = await getSlip(db, tech(), s.s.id, dec10);
    expect(mine.d.net).toBe(after.net);
    await expect(getSlip(db, tech2(), s.s.id, dec10)).rejects.toThrow(/본인/);
    // 다음 달은 지난달 소득세·가족 수를 불러온다
    await hire(
      ids.tech2,
      tech2(),
      terms({ basePay: 2_400_000, startOn: "2026-12-15" }),
    );
    const { id: dec } = await preparePayroll(
      db,
      acct(),
      "2026-12",
      new Date("2027-01-04T01:00:00Z"),
    );
    const decRun = (await getRun(db, acct(), "2026-12"))!;
    expect(decRun.r.id).toBe(dec);
    const t1 = decRun.slips.find((x) => x.s.userId === ids.tech1)!.d;
    expect(t1).toMatchObject({
      incomeTax: 40_000,
      family: 2,
      incomeTaxSource: "last",
    });
    const t2 = decRun.slips.find((x) => x.s.userId === ids.tech2)!.d;
    expect(t2.period).toMatchObject({
      from: "2026-12-15",
      days: 17,
      monthDays: 31,
    });
  });
});
