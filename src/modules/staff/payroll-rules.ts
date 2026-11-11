// 급여 계산 규칙(STD-11 5절, 취업규칙 제22~24조). 화면·서버·테스트가 같이 쓴다(DB 없음).
// 근거: 근로기준법 제43조(전액 지급)·제48조(임금명세서)·제56조(가산임금), 소득세법 시행령 제12조(비과세 식대 등).
// 4대 보험 요율·상하한은 정책값(해마다 바뀜) [확인 필요]. 소득세는 국세청 간이세액표 값을 회계 담당이 넣는다.
import {
  closedReason,
  type ShopCalendar,
} from "@/modules/platform/business-days";
import { contractNumbers, type ContractTerms } from "./contract-rules";

export type PayLine = {
  code: string;
  name: string;
  amount: number;
  calc: string;
  taxfree?: number;
};
export type Extra = {
  kind: "pay" | "deduct";
  name: string;
  amount: number;
  reason: string;
  taxable?: boolean;
};
export type AttLeave = {
  leaveKind: string;
  fromDate: string;
  toDate: string;
  fromTime: string;
  toTime: string;
  days: number;
  hours: number;
};

export type SlipData = {
  name: string;
  payType: "monthly" | "hourly";
  hourly: number;
  monthHours: number;
  dailyHours: number;
  period: { from: string; to: string; days: number; monthDays: number };
  att: {
    overtime: number;
    night: number;
    holiday: number;
    holidayOver8: number;
    absentDays: number;
    sickDays: number;
    shortHours: number;
    /** 승인된 연장·휴일근로 시간(신청 기준). 인정 시간과 다르면 차이를 명세서에 보인다 */
    otApproved?: number;
    /** 승인 없이 더 일한 시간(수당 없음, 최저임금 점검용) */
    unapproved?: number;
  };
  pays: PayLine[];
  deducts: PayLine[];
  gross: number;
  taxfree: number;
  insBase: number;
  deductTotal: number;
  net: number;
  incomeTax: number;
  incomeTaxSource: "manual" | "last" | "none";
  family: number;
  extras: Extra[];
  insurances: string[];
  warnings: string[];
};

export type PayPolicy = {
  legal5: boolean;
  minWage: number;
  /** ÷1000 % 단위(4750 = 4.75%) */
  pensionRate: number;
  healthRate: number;
  ltcRatio: number;
  employmentRate: number;
  pensionCap: number;
  pensionFloor: number;
  mealExempt: number;
  carExempt: number;
};

const won = (n: number) => `${Math.round(n).toLocaleString("ko-KR")}원`;
const floor10 = (n: number) => Math.floor(n / 10) * 10;
const D = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
export const monthRange = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return {
    from: `${ym}-01`,
    to: `${ym}-${String(last).padStart(2, "0")}`,
    days: last,
  };
};
const daysIn = (from: string, to: string) =>
  Math.round((D(to) - D(from)) / 864e5) + 1;
const hm = (t: string) => {
  const m = /^(\d{2}):(\d{2})$/.exec(t);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

/** 시각 구간 중 야간(22:00~06:00)에 든 시간. 끝이 시작보다 이르면 자정을 넘긴 것으로 본다 */
export function nightHours(fromTime: string, toTime: string) {
  const s = hm(fromTime);
  let e = hm(toTime);
  if (s == null || e == null) return 0;
  if (e <= s) e += 1440;
  const windows = [
    [0, 360],
    [1320, 1800],
    [2760, 2880],
  ];
  let m = 0;
  for (const [a, b] of windows)
    m += Math.max(0, Math.min(e, b) - Math.max(s, a));
  return m / 60;
}

/** 기간 안 영업일 수(결근·병가 공제 일수) */
function businessDays(cal: ShopCalendar, from: string, to: string) {
  let n = 0;
  for (let t = D(from); t <= D(to); t += 864e5)
    if (closedReason(cal, iso(t)) == null) n++;
  return n;
}

/**
 * 근태(승인된 F-11-04)를 그 달 시간으로 모은다.
 * actual 을 주면 연장·휴일근로는 승인 시각과 실제 출퇴근이 겹치는 부분만(분 단위) 센다(사용자 결정 2026-11-11).
 */
export function summarizeAttendance(
  leaves: AttLeave[],
  ym: string,
  cal: ShopCalendar,
  actual?: (day: string) => { from: number; to: number } | null | undefined,
) {
  const { from, to } = monthRange(ym);
  const a = {
    overtime: 0,
    night: 0,
    holiday: 0,
    holidayOver8: 0,
    absentDays: 0,
    sickDays: 0,
    shortHours: 0,
    otApproved: 0,
  };
  for (const l of leaves) {
    if (l.toDate < from || l.fromDate > to) continue;
    if (l.leaveKind === "overtime") {
      if (l.fromDate < from) continue;
      a.otApproved += l.hours;
      let h = l.hours;
      let fromTime = l.fromTime;
      let toTime = l.toTime;
      if (actual) {
        const s = hm(l.fromTime);
        const e = hm(l.toTime);
        const sp = actual(l.fromDate);
        const st = sp && s != null ? Math.max(s, sp.from) : 0;
        const en = sp && e != null ? Math.min(e, sp.to) : 0;
        if (!sp || en <= st) continue;
        h = Math.round(((en - st) / 60) * 100) / 100;
        const t = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
        fromTime = t(st);
        toTime = t(en);
      }
      a.night += nightHours(fromTime, toTime);
      if (closedReason(cal, l.fromDate) != null) {
        a.holiday += Math.min(h, 8);
        a.holidayOver8 += Math.max(0, h - 8);
      } else a.overtime += h;
    } else if (l.leaveKind === "absent" || l.leaveKind === "sick") {
      const d = businessDays(
        cal,
        l.fromDate < from ? from : l.fromDate,
        l.toDate > to ? to : l.toDate,
      );
      if (l.leaveKind === "absent") a.absentDays += d;
      else a.sickDays += d;
    } else if (
      ["late", "early", "out"].includes(l.leaveKind) &&
      l.fromDate >= from
    )
      a.shortHours += l.hours;
  }
  const r2 = (n: number) => Math.round(n * 100) / 100;
  return { ...a, overtime: r2(a.overtime), night: r2(a.night), holiday: r2(a.holiday), holidayOver8: r2(a.holidayOver8), otApproved: r2(a.otApproved) };
}

/**
 * 한 사람 한 달 급여 계산.
 * 월급: 기본급·고정 수당(입·퇴사 달은 일할) + 연장·야간·휴일 수당 − 결근·무급 병가·지각 등 공제.
 * 시급: 시급 × 월 소정근로시간(주휴 포함)을 기본으로 같은 방식.
 */
export function computeSlip(input: {
  name: string;
  terms: ContractTerms;
  ym: string;
  hiredOn: string | null;
  leftOn: string | null;
  att: SlipData["att"];
  pol: PayPolicy;
  incomeTax: number;
  incomeTaxSource: SlipData["incomeTaxSource"];
  family: number;
  extras: Extra[];
}): SlipData {
  const { terms: t, pol, att } = input;
  const n = contractNumbers(t);
  const m = monthRange(input.ym);
  const from = input.hiredOn && input.hiredOn > m.from ? input.hiredOn : m.from;
  const to = input.leftOn && input.leftOn < m.to ? input.leftOn : m.to;
  const days = Math.max(0, daysIn(from, to));
  const ratio = days / m.days;
  const prorate = ratio < 1;
  const warnings: string[] = [];
  const pays: PayLine[] = [];
  const hourly = n.hourly;

  const baseFull =
    t.payType === "hourly" ? t.basePay * n.monthHours : t.basePay;
  const base = Math.round(baseFull * ratio);
  pays.push({
    code: "base",
    name: "기본급",
    amount: base,
    calc:
      t.payType === "hourly"
        ? `시급 ${won(t.basePay)} × 월 ${n.monthHours}시간(주휴 포함)${prorate ? ` × ${days}/${m.days}일` : ""}`
        : `월 ${won(t.basePay)}${prorate ? ` × ${days}/${m.days}일(일할)` : ""}`,
  });
  for (const a of t.allowances) {
    const amount = Math.round(a.amount * ratio);
    const cap = /식대|식비/.test(a.name)
      ? pol.mealExempt
      : /차량|자가운전/.test(a.name)
        ? pol.carExempt
        : 0;
    pays.push({
      code: `fix:${a.name}`,
      name: a.name,
      amount,
      calc: `고정 수당 월 ${won(a.amount)}${prorate ? ` × ${days}/${m.days}일` : ""}`,
      taxfree: cap ? Math.min(amount, cap) : undefined,
    });
  }
  const mult = pol.legal5 ? 1.5 : 1;
  if (att.overtime)
    pays.push({
      code: "ot",
      name: "연장근로수당",
      amount: Math.round(hourly * att.overtime * mult),
      calc: `통상시급 ${won(hourly)} × ${att.overtime}시간 × ${mult}`,
    });
  if (att.holiday || att.holidayOver8) {
    const h = att.holiday * mult + att.holidayOver8 * (pol.legal5 ? 2 : 1);
    pays.push({
      code: "hol",
      name: "휴일근로수당",
      amount: Math.round(hourly * h),
      calc: `통상시급 ${won(hourly)} × (${att.holiday}시간 × ${mult}${att.holidayOver8 ? ` + 8시간 넘은 ${att.holidayOver8}시간 × ${pol.legal5 ? 2 : 1}` : ""})`,
    });
  }
  if (att.night && pol.legal5)
    pays.push({
      code: "night",
      name: "야간근로 가산",
      amount: Math.round(hourly * att.night * 0.5),
      calc: `통상시급 ${won(hourly)} × 야간 ${att.night}시간 × 0.5`,
    });
  if (t.payType === "monthly" && hourly) {
    const dayPay = Math.round(hourly * n.daily);
    const unpaid = att.absentDays + att.sickDays;
    if (unpaid)
      pays.push({
        code: "absent",
        name: "결근·무급 병가 공제",
        amount: -dayPay * unpaid,
        calc: `일급 ${won(dayPay)}(통상시급 × ${n.daily}시간) × ${unpaid}일(결근 ${att.absentDays} · 병가 ${att.sickDays})`,
      });
  } else if (att.absentDays + att.sickDays) {
    const unpaid = att.absentDays + att.sickDays;
    pays.push({
      code: "absent",
      name: "결근·무급 병가 공제",
      amount: -Math.round(t.basePay * n.daily * unpaid),
      calc: `시급 ${won(t.basePay)} × ${n.daily}시간 × ${unpaid}일`,
    });
  }
  if (att.shortHours)
    pays.push({
      code: "short",
      name: "지각·조퇴·외출 공제",
      amount: -Math.round(hourly * att.shortHours),
      calc: `통상시급 ${won(hourly)} × ${att.shortHours}시간`,
    });
  for (const e of input.extras.filter((e) => e.kind === "pay"))
    pays.push({
      code: "extra",
      name: e.name,
      amount: e.amount,
      calc: e.reason,
      taxfree: e.taxable === false ? e.amount : undefined,
    });
  if (att.absentDays)
    warnings.push(
      "결근한 주는 주휴수당이 생기지 않을 수 있습니다. 해당하면 '기타 공제'로 넣으세요 [확인 필요]",
    );

  const gross = pays.reduce((s, p) => s + p.amount, 0);
  const taxfree = pays.reduce((s, p) => s + (p.taxfree ?? 0), 0);
  const insBase = Math.max(0, gross - taxfree);
  const deducts: PayLine[] = [];
  const ins = new Set(t.insurances);
  if (ins.has("pension")) {
    const b =
      Math.floor(
        Math.min(pol.pensionCap, Math.max(pol.pensionFloor, insBase)) / 1000,
      ) * 1000;
    deducts.push({
      code: "pension",
      name: "국민연금",
      amount: floor10((b * pol.pensionRate) / 100000),
      calc: `기준소득월액 ${won(b)} × ${pol.pensionRate / 1000}%`,
    });
  }
  if (ins.has("health")) {
    const h = floor10((insBase * pol.healthRate) / 100000);
    deducts.push({
      code: "health",
      name: "건강보험",
      amount: h,
      calc: `보수 ${won(insBase)} × ${pol.healthRate / 1000}%`,
    });
    deducts.push({
      code: "ltc",
      name: "장기요양보험",
      amount: floor10((h * pol.ltcRatio) / 100000),
      calc: `건강보험료 ${won(h)} × ${pol.ltcRatio / 1000}%`,
    });
  }
  if (ins.has("employment"))
    deducts.push({
      code: "employment",
      name: "고용보험",
      amount: floor10((insBase * pol.employmentRate) / 100000),
      calc: `보수 ${won(insBase)} × ${pol.employmentRate / 1000}%`,
    });
  const tax = floor10(input.incomeTax);
  deducts.push({
    code: "income_tax",
    name: "소득세",
    amount: tax,
    calc:
      input.incomeTaxSource === "none"
        ? "간이세액표 값을 넣어 주세요"
        : `간이세액표(공제 대상 가족 ${input.family}명)${input.incomeTaxSource === "last" ? " · 지난달 값" : ""}`,
  });
  deducts.push({
    code: "local_tax",
    name: "지방소득세",
    amount: floor10(tax * 0.1),
    calc: "소득세 × 10%",
  });
  for (const e of input.extras.filter((e) => e.kind === "deduct"))
    deducts.push({
      code: "extra",
      name: e.name,
      amount: e.amount,
      calc: e.reason,
    });
  const deductTotal = deducts.reduce((s, d) => s + d.amount, 0);
  if (input.incomeTaxSource === "none" && insBase > 1_060_000)
    warnings.push(
      "소득세가 비어 있습니다. 국세청 간이세액표에서 찾아 넣으세요",
    );
  if (input.incomeTaxSource === "last")
    warnings.push(
      "소득세는 지난달 값을 불러왔습니다. 과세 급여가 바뀌었으면 간이세액표로 다시 확인하세요",
    );
  if (hourly && hourly < pol.minWage)
    warnings.push(
      `통상시급 ${won(hourly)}이 최저임금 ${won(pol.minWage)}보다 적습니다. 계약서를 고쳐야 합니다`,
    );
  const recog = att.overtime + att.holiday + att.holidayOver8;
  if (att.otApproved != null && att.otApproved - recog > 0.01)
    warnings.push(
      `승인된 연장·휴일근로 ${att.otApproved}시간 중 실제 출퇴근과 겹친 ${Math.round(recog * 100) / 100}시간만 인정했습니다. 출퇴근이 빠진 날은 '출퇴근 정정'이 확정되면 다시 계산하세요`,
    );
  if (att.unapproved) {
    warnings.push(
      `승인 없이 더 일한 ${att.unapproved}시간은 수당에 넣지 않았습니다. 공장장이 알고 일을 시킨 시간이면 사후 승인을 받아 다시 계산하세요`,
    );
    const fixedPay = baseFull + t.allowances.reduce((s, a) => s + a.amount, 0);
    const eff = n.monthHours ? fixedPay / (n.monthHours + att.unapproved) : 0;
    if (eff && eff < pol.minWage)
      warnings.push(
        `승인 없는 시간까지 치면 시간당 ${won(eff)}로 최저임금 ${won(pol.minWage)}보다 적습니다. 실제로 일한 시간이면 수당을 주어야 합니다(최저임금법 제6조)`,
      );
  }
  if (gross - deductTotal < 0)
    warnings.push("공제가 지급보다 큽니다. 공제 항목을 확인하세요");
  return {
    name: input.name,
    payType: t.payType,
    hourly,
    monthHours: n.monthHours,
    dailyHours: n.daily,
    period: { from, to, days, monthDays: m.days },
    att,
    pays,
    deducts,
    gross,
    taxfree,
    insBase,
    deductTotal,
    net: gross - deductTotal,
    incomeTax: tax,
    incomeTaxSource: input.incomeTaxSource,
    family: input.family,
    extras: input.extras,
    insurances: t.insurances,
    warnings,
  };
}

export const RUN_STATUS = {
  draft: "계산 중",
  submitted: "승인 대기",
  approved: "승인",
  paid: "지급 완료",
} as const;
export type RunStatus = keyof typeof RUN_STATUS;

/** 지급일: 그 달 다음 달 지급일. 휴일이면 앞 영업일(취업규칙 제23조) */
export function payDateFor(ym: string, payDay: number, cal: ShopCalendar) {
  const [y, m] = ym.split("-").map(Number);
  const next =
    m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  let t = D(`${next}-${String(payDay).padStart(2, "0")}`);
  for (let i = 0; i < 10 && closedReason(cal, iso(t)) != null; i++) t -= 864e5;
  return iso(t);
}
