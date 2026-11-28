// 급여 계산 규칙(STD-11 5절, 취업규칙 제22~24조). 화면·서버·테스트가 같이 쓴다(DB 없음).
// 근거: 근로기준법 제43조(전액 지급)·제48조(임금명세서)·제56조(가산임금), 소득세법 시행령 제12조(비과세 식대 등).
// 4대 보험 요율·상하한은 정책값(해마다 바뀜) [확인 필요]. 소득세는 국세청 간이세액표 값을 회계 담당이 넣는다.
import {
  closedReason,
  type ShopCalendar,
} from "@/modules/platform/business-days";
import { contractNumbers, fixedOtPay, type ContractTerms } from "./contract-rules";
import { simpleIncomeTax, type TaxTablePolicy } from "./income-tax";

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
  /** false = 비과세(예전 자료·기타). tf 가 있으면 그 종류의 한도·조건을 따른다 */
  taxable?: boolean;
  /** 법에 정한 비과세 종류(기타 지급만) */
  tf?: ExtraTf;
};

/**
 * 고정 수당의 비과세 종류(소득세법 제12조 제3호, 시행령 제12조·제17조의2). 이름으로 고른다.
 * 조건(식사 현물 제공 없음 등)은 급여 화면에서 사람별로 확인(tfOk)해야 비과세로 본다.
 */
export const ALLOWANCE_TF = {
  meal: { label: "식대", ok: "회사가 식사를 현물로 주지 않습니다(점심을 주면 식대는 과세)" },
  car: { label: "자가운전보조금", ok: "직원 본인(배우자 공동) 명의 차를 직접 운전해 업무에 쓰고, 그 출장 교통비는 따로 받지 않습니다" },
  childcare: { label: "출산·보육수당", ok: "직원(배우자)이 출산했거나 6세 이하 자녀가 있습니다(자녀 수와 상관없이 1명당 월 한도)" },
} as const;
export type AllowanceTf = keyof typeof ALLOWANCE_TF;
/** 수당 이름으로 비과세 종류를 고른다. 교통비·차량 없는 직원의 차량비는 과세(자가운전 조건이 안 맞음) */
export function allowanceTf(name: string): AllowanceTf | null {
  if (/식대|식비|중식|석식|점심/.test(name)) return "meal";
  if (/자가운전|차량|유류/.test(name)) return "car";
  if (/보육|출산|육아/.test(name)) return "childcare";
  return null;
}

/**
 * 기타 지급의 비과세 종류. cap = 정책값 연 한도 키, inKind = 현물(돈으로 주지 않음 → 같은 금액을 공제 줄로 빼 실수령은 그대로)
 * 근거: 소득세법 제12조 제3호(출산지원금·단체보험·종업원 할인), 시행령 제12조(실비변상: 숙직료·여비), 시행규칙 제10조(경조금)
 */
export const EXTRA_TF = {
  birth: { label: "출산지원금(전액 비과세)", note: "자녀 출생일 뒤 2년 안, 같은 출산에 2번까지. 대표의 친족인 직원은 해당 없음" },
  condolence: { label: "직원 경조금(사회통념 범위)", note: "경조금 기준표 안의 금액" },
  duty: { label: "숙직·일직료(실비)", note: "사규로 정한 실비 범위만" },
  travel: { label: "출장 여비(실비 정산)", note: "업무 출장의 교통·숙박비를 영수증·사규로 정산한 금액. 출퇴근 교통비는 과세" },
  groupIns: { label: "단체 보장성보험료(현물, 연 한도)", note: "직원이 보험금 받는 단체 보장성보험의 회사 납부액", inKind: true },
  discount: { label: "직원 할인(현물, 연 한도)", note: "직원 차를 할인해 고쳐 준 금액. 시가의 20%와 연 한도 중 큰 금액까지", inKind: true },
  other: { label: "기타 비과세", note: "법에 정한 비과세인지 세무사에게 확인" },
} as const;
export type ExtraTf = keyof typeof EXTRA_TF;
export const isExtraTf = (s: string): s is ExtraTf => s in EXTRA_TF;

/** 같은 해 앞 달까지 비과세로 본 금액(연 한도용)과 그동안 준 출산지원금 횟수 */
export type TfUsed = { groupIns?: number; discount?: number; birthCount?: number };
export type PayBank = { name: string; account: string; holder: string };
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
  /** auto=간이세액표 계산, manual=회계 담당이 직접 넣음, last=지난달 직접 넣은 값, none=예전 자료 */
  incomeTaxSource: "auto" | "manual" | "last" | "none";
  family: number;
  /** 8~20세 자녀 수(간이세액표 자녀 공제) */
  children?: number;
  /** 원천징수 비율 80·100·120(직원 선택, 기본 100) */
  withholdRate?: number;
  extras: Extra[];
  /** 생산직(연장·야간·휴일 수당 비과세 대상으로 회계 담당이 표시) */
  production?: boolean;
  /** 이달 생산직 연장수당 비과세로 본 금액(연 한도 누적용) */
  otTaxfree?: number;
  /** 비과세 조건을 확인한 고정 수당 종류. 없음 = 아직 확인 전(예전 자료, 이름만 보고 비과세) */
  tfOk?: AllowanceTf[];
  /** 이달 기타 지급 비과세(종류별, 연 한도 누적용) */
  tfExtra?: Partial<Record<ExtraTf, number>>;
  /** 급여 받을 계좌(명세서 전체가 암호화되어 저장됨). 다음 달로 이어진다 */
  bank?: PayBank | null;
  insurances: string[];
  /** 고정 연장근로수당(포괄 약정) 정산 내역. streak 은 연속 달 수(약정 재검토 알림) */
  fixedOt?: FixedOt;
  /** 회사가 따로 내는 보험료·퇴직급여 적립(명세서 지급액과 별개) */
  employer?: PayLine[];
  employerTotal?: number;
  warnings: string[];
};

export type FixedOt = {
  hours: number;
  amount: number;
  /** 이달 인정 평일 연장시간과 그 법정 수당 */
  actual: number;
  legal: number;
  diff: number;
  overStreak: number;
  underStreak: number;
};

export type PayPolicy = {
  legal5: boolean;
  /** 고정 연장 약정 재검토 알림(연속 달 수) */
  fixedOtReviewMonths?: number;
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
  /** 보육수당 비과세 월 한도 */
  childcareExempt: number;
  /** 생산직 연장수당 비과세: 월정액급여 기준·연 한도 */
  otExemptPayCap: number;
  otExemptAnnual: number;
  /** 생산직 비과세: 직전 연도 총급여 기준(이하) */
  otExemptPrevGross?: number;
  /** 단체 보장성보험료·직원 할인 비과세 연 한도 */
  groupInsExempt?: number;
  discountExempt?: number;
  /** 고용보험 회사 몫(실업급여 + 고용안정·직업능력개발), ÷1000 % */
  employmentEmployerRate: number;
  /** 산재보험료율(업종 요율 + 출퇴근재해), ÷1000 %. 0이면 고지서 금액을 따로 봄 */
  accidentRate: number;
  taxTable: TaxTablePolicy;
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
  /** 직접 넣은 소득세(manual·last 일 때만 씀) */
  incomeTax: number;
  incomeTaxSource: SlipData["incomeTaxSource"];
  family: number;
  children?: number;
  withholdRate?: number;
  extras: Extra[];
  production?: boolean;
  /** 같은 해 앞 달까지 생산직 연장수당 비과세로 본 금액 */
  otTaxfreeUsed?: number;
  /** 직전 연도 앱 급여대장의 총급여(비과세 뺌). null·없음 = 기록 없음(회계 담당이 확인) */
  prevYearGross?: number | null;
  /** 비과세 조건을 확인한 고정 수당 종류(없음 = 확인 전) */
  tfOk?: AllowanceTf[];
  /** 같은 해 앞 달까지 기타 비과세 사용액·출산지원금 횟수 */
  tfUsed?: TfUsed;
  bank?: PayBank | null;
  /** 지난달 명세서의 고정 연장 정산(연속 달 수 이어 세기) */
  prevFixedOt?: FixedOt | null;
  /** 연차 연도가 끝났거나 퇴직한 달의 남은 연차(paid=false 면 촉진을 다 해 보상 없음) */
  leavePay?: { days: number; reason: string; paid: boolean } | null;
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
  // 고정 수당 비과세: 종류별 월 한도는 한 사람에 한 번(같은 종류 수당이 두 줄이어도 합쳐서 한도 안)
  const tfCap: Record<AllowanceTf, number> = { meal: pol.mealExempt, car: pol.carExempt, childcare: pol.childcareExempt };
  const tfLeft = { ...tfCap };
  /** 월정액급여 판정용: 일할하지 않은 금액 기준 비과세 */
  const tfLeftFull = { ...tfCap };
  let fixedTaxfreeFull = 0;
  const unconfirmed = new Set<AllowanceTf>();
  for (const a of t.allowances) {
    const amount = Math.round(a.amount * ratio);
    const kind = allowanceTf(a.name);
    let taxfree: number | undefined;
    let note = "";
    if (kind) {
      const ok = input.tfOk ? input.tfOk.includes(kind) : true;
      if (!input.tfOk) unconfirmed.add(kind);
      if (ok) {
        const f = Math.min(amount, tfLeft[kind]);
        tfLeft[kind] -= f;
        const ff = Math.min(a.amount, tfLeftFull[kind]);
        tfLeftFull[kind] -= ff;
        fixedTaxfreeFull += ff;
        taxfree = f || undefined;
        if (f < amount) note = ` · ${ALLOWANCE_TF[kind].label} 비과세 월 ${won(tfCap[kind])} 넘는 ${won(amount - f)}은 과세`;
      } else note = ` · ${ALLOWANCE_TF[kind].label} 비과세 조건 확인 안 함 → 과세`;
    }
    pays.push({
      code: `fix:${a.name}`,
      name: a.name,
      amount,
      calc: `고정 수당 월 ${won(a.amount)}${prorate ? ` × ${days}/${m.days}일` : ""}${note}`,
      taxfree,
    });
  }
  if (unconfirmed.size)
    warnings.push(
      `${[...unconfirmed].map((k) => ALLOWANCE_TF[k].label).join("·")}를 이름만 보고 비과세로 계산했습니다. 이 직원 칸의 '비과세 조건 확인'을 체크해 저장하세요(조건이 안 맞으면 체크하지 않으면 과세)`,
    );
  const mult = pol.legal5 ? 1.5 : 1;
  const otLegal = Math.round(hourly * att.overtime * mult);
  const fixH = t.fixedOtHours ?? 0;
  let fixedOt: FixedOt | undefined;
  if (fixH > 0 && t.fixedOtAmount) {
    // 고정 연장근로수당(포괄 약정): 약정액은 그대로 주고(덜 일해도 깎지 않음), 실제 법정 수당이 더 크면 그 달 차액을 더 준다.
    // 다음 달로 넘기거나 모자란 달과 상계하지 않는다. 입·퇴사 달만 일할(대표 결정 2026-11-25)
    const fixAmt = Math.round(t.fixedOtAmount * ratio);
    const diff = Math.max(0, otLegal - fixAmt);
    pays.push({
      code: "fixot",
      name: "고정 연장근로수당",
      amount: fixAmt,
      calc: `약정 월 ${fixH}시간(계약서 ${won(t.fixedOtAmount)})${prorate ? ` × ${days}/${m.days}일` : ""} · 이달 인정 연장 ${att.overtime}시간 = 법정 ${won(otLegal)} → ${diff ? `차액 ${won(diff)} 따로 지급` : "차액 없음(덜 일해도 깎지 않음)"}`,
    });
    if (diff)
      pays.push({
        code: "ot",
        name: "연장수당 차액",
        amount: diff,
        calc: `통상시급 ${won(hourly)} × ${att.overtime}시간 × ${mult} = ${won(otLegal)} − 고정 ${won(fixAmt)}`,
      });
    const prev = input.prevFixedOt;
    const under = att.overtime < (fixH * ratio) / 2;
    fixedOt = {
      hours: fixH,
      amount: fixAmt,
      actual: att.overtime,
      legal: otLegal,
      diff,
      overStreak: diff > 0 ? (prev?.overStreak ?? 0) + 1 : 0,
      underStreak: under ? (prev?.underStreak ?? 0) + 1 : 0,
    };
    const n2 = pol.fixedOtReviewMonths ?? 3;
    if (fixedOt.overStreak >= n2)
      warnings.push(`${fixedOt.overStreak}달 연속 약정 ${fixH}시간보다 많이 일해 차액이 생겼습니다(이달 ${att.overtime}시간). 약정 시간을 늘릴지 직원과 검토하세요`);
    if (fixedOt.underStreak >= n2)
      warnings.push(`${fixedOt.underStreak}달 연속 실제 연장이 약정 ${fixH}시간의 절반에 못 미칩니다(이달 ${att.overtime}시간). 약정을 줄이려면 직원 동의를 받아 새 계약서를 씁니다`);
    if (pol.legal5 && t.fixedOtAmount + 10 < Math.floor(hourly * fixH * 1.5))
      warnings.push(`계약서의 고정 연장근로수당 ${won(t.fixedOtAmount)}이 지금 기준(통상시급 × ${fixH}시간 × 1.5 = ${won(Math.floor(hourly * fixH * 1.5))})보다 적습니다. 차액은 실제 시간으로 계산해 손해는 없지만, 새 계약서로 고치세요`);
  } else if (att.overtime)
    pays.push({
      code: "ot",
      name: "연장근로수당",
      amount: otLegal,
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
  const lp = input.leavePay;
  if (lp && lp.days > 0) {
    if (lp.paid) {
      const dayPay = Math.round(hourly * n.daily);
      pays.push({
        code: "leave",
        name: "미사용 연차수당",
        amount: Math.round(dayPay * lp.days),
        calc: `${lp.reason} × 통상임금 일급 ${won(dayPay)}(통상시급 × ${n.daily}시간)`,
      });
    } else warnings.push(`${lp.reason}은 연차 사용 촉진(1·2차)을 기간 안에 다 해 보상하지 않습니다(근로기준법 제61조). 촉진 기록은 '연차 촉진' 화면에 있습니다`);
  }
  // 기타 지급 비과세: 종류별 연 한도(단체보험·직원 할인), 출산지원금 2번 확인, 현물은 공제 줄로 빼 실수령 그대로
  const tfExtra: Partial<Record<ExtraTf, number>> = {};
  const inKind: PayLine[] = [];
  const used = input.tfUsed ?? {};
  let birthCount = used.birthCount ?? 0;
  for (const e of input.extras.filter((e) => e.kind === "pay")) {
    const tf: ExtraTf | undefined = e.tf ?? (e.taxable === false ? "other" : undefined);
    let taxfree: number | undefined;
    let calc = e.reason;
    if (tf) {
      const yearCap = tf === "groupIns" ? pol.groupInsExempt : tf === "discount" ? pol.discountExempt : undefined;
      const prior = tf === "groupIns" ? (used.groupIns ?? 0) : tf === "discount" ? (used.discount ?? 0) : 0;
      const left = yearCap != null ? Math.max(0, yearCap - prior - (tfExtra[tf] ?? 0)) : e.amount;
      taxfree = Math.min(e.amount, left);
      tfExtra[tf] = (tfExtra[tf] ?? 0) + taxfree;
      calc += ` · ${EXTRA_TF[tf].label}`;
      if (taxfree < e.amount) {
        calc += ` · 연 한도 ${won(yearCap ?? 0)} 넘는 ${won(e.amount - taxfree)}은 과세`;
        warnings.push(`'${e.name}' 중 ${won(e.amount - taxfree)}은 ${EXTRA_TF[tf].label} 연 한도를 넘어 과세했습니다`);
      }
      if (tf === "birth") {
        birthCount += 1;
        if (birthCount > 2)
          warnings.push(`출산지원금을 이 직원에게 ${birthCount}번째 줍니다. 같은 출산에 2번까지만 비과세이니, 같은 자녀라면 과세로 바꾸세요`);
      }
      if (tf === "other")
        warnings.push(`'${e.name}'을 기타 비과세로 넣었습니다. 법에 정한 비과세가 아니면 과세입니다(세무사 확인)`);
      if ("inKind" in EXTRA_TF[tf] && EXTRA_TF[tf].inKind)
        inKind.push({ code: "inkind", name: `${e.name}(현물로 받음)`, amount: e.amount, calc: "돈으로 주지 않은 금액이라 실수령에서 뺍니다(신고용으로만 지급에 넣음)" });
      taxfree = taxfree || undefined;
    }
    pays.push({ code: "extra", name: e.name, amount: e.amount, calc, taxfree });
  }
  // 생산직 연장·야간·휴일 수당 비과세(소득세법 시행령 제17조): 월정액급여 기준 이하, 연 한도 안에서
  // 고정 연장근로수당은 실제로 일한 시간분(이달 인정 연장의 법정 수당)까지만 연장근로 대가로 본다.
  // 덜 일한 달에 보장해 준 나머지는 연장근로를 "하여 받는" 급여가 아니라 과세하고, 월정액급여에도 넣는다
  // (국세청: 실제 연장 여부와 관계없이 정액으로 주는 시간외수당은 비과세 아님) [세무사 확인]
  const fixPay = pays.find((p) => p.code === "fixot");
  const fixWorked = fixPay ? Math.min(fixPay.amount, otLegal) : 0;
  const fixUnworkedFull = fixedOt ? Math.max(0, (t.fixedOtAmount ?? 0) - Math.min(t.fixedOtAmount ?? 0, otLegal)) : 0;
  let otTaxfree = 0;
  if (input.production) {
    const monthlyFixed = baseFull + t.allowances.reduce((s2, a) => s2 + a.amount, 0) - fixedTaxfreeFull + fixUnworkedFull;
    const prevCap = pol.otExemptPrevGross ?? 0;
    const prevOver = prevCap > 0 && input.prevYearGross != null && input.prevYearGross > prevCap;
    if (prevOver)
      warnings.push(
        `생산직으로 표시했지만 지난해 앱 급여대장의 총급여 ${won(input.prevYearGross ?? 0)}가 ${won(prevCap)}를 넘어 연장수당을 과세했습니다(소득세법 시행령 제17조)`,
      );
    else if (monthlyFixed <= pol.otExemptPayCap) {
      let left = Math.max(0, pol.otExemptAnnual - (input.otTaxfreeUsed ?? 0));
      const prevNote = input.prevYearGross == null ? " · 지난해 총급여는 앱 기록이 없어 회계 담당 확인" : "";
      for (const p of pays) {
        if (!["fixot", "ot", "hol", "night"].includes(p.code) || left <= 0) continue;
        const room = p.code === "fixot" ? fixWorked : p.amount;
        const f = Math.min(room, left);
        if (p.code === "fixot" && room < p.amount)
          p.calc += ` · 실제로 안 일한 시간분 ${won(p.amount - room)}은 연장근로 대가가 아니라 과세`;
        if (f <= 0) continue;
        p.taxfree = f;
        p.calc += ` · 생산직 비과세 ${won(f)}${prevNote}`;
        left -= f;
        otTaxfree += f;
      }
      const otRoom = pays
        .filter((p) => ["fixot", "ot", "hol", "night"].includes(p.code))
        .reduce((s2, p) => s2 + (p.code === "fixot" ? fixWorked : p.amount), 0);
      if (otRoom > otTaxfree)
        warnings.push(
          `생산직 연장수당 비과세 연 한도 ${won(pol.otExemptAnnual)}를 다 썼습니다. 넘는 금액은 과세합니다`,
        );
    } else
      warnings.push(
        `생산직으로 표시했지만 월정액급여 ${won(monthlyFixed)}${fixUnworkedFull ? `(실제로 안 일한 고정 연장수당 ${won(fixUnworkedFull)} 포함)` : ""}가 ${won(pol.otExemptPayCap)}를 넘어 연장수당을 과세했습니다`,
      );
  }
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
  const children = Math.max(0, Math.round(input.children ?? 0));
  const withholdRate = input.withholdRate ?? 100;
  const auto = simpleIncomeTax(
    { monthly: insBase, family: input.family, children, rate: withholdRate },
    pol.taxTable,
  );
  const typed =
    input.incomeTaxSource === "manual" || input.incomeTaxSource === "last";
  const tax = typed ? floor10(input.incomeTax) : auto.amount;
  const source: SlipData["incomeTaxSource"] = typed
    ? input.incomeTaxSource
    : "auto";
  deducts.push({
    code: "income_tax",
    name: "소득세",
    amount: tax,
    calc: typed
      ? `직접 넣은 값${source === "last" ? "(지난달)" : ""} · 자동 계산이면 ${won(auto.amount)}(${auto.calc})`
      : auto.calc,
  });
  deducts.push({
    code: "local_tax",
    name: "지방소득세",
    amount: floor10(tax * 0.1),
    calc: "소득세 × 10%",
  });
  deducts.push(...inKind);
  for (const e of input.extras.filter((e) => e.kind === "deduct"))
    deducts.push({
      code: "extra",
      name: e.name,
      amount: e.amount,
      calc: e.reason,
    });
  const deductTotal = deducts.reduce((s, d) => s + d.amount, 0);
  if (typed && tax !== auto.amount)
    warnings.push(
      `소득세를 직접 넣은 값 ${won(tax)}으로 계산했습니다(간이세액표 계산 ${won(auto.amount)}). 특별한 사정이 없으면 칸을 비워 자동 계산으로 돌리세요`,
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
  const employer: PayLine[] = [];
  for (const d of deducts) {
    if (d.code === "pension" || d.code === "health" || d.code === "ltc")
      employer.push({ ...d, calc: `근로자 몫과 같은 금액(${d.calc})` });
  }
  if (ins.has("employment"))
    employer.push({
      code: "employment",
      name: "고용보험(회사)",
      amount: floor10((insBase * pol.employmentEmployerRate) / 100000),
      calc: `보수 ${won(insBase)} × ${pol.employmentEmployerRate / 1000}%(실업급여 + 고용안정·직업능력개발)`,
    });
  if (pol.accidentRate > 0)
    employer.push({
      code: "accident",
      name: "산재보험",
      amount: floor10((insBase * pol.accidentRate) / 100000),
      calc: `보수 ${won(insBase)} × ${pol.accidentRate / 1000}%(업종 요율 + 출퇴근재해)`,
    });
  employer.push({
    code: "severance",
    name: "퇴직급여 적립(참고)",
    amount: floor10(Math.max(0, gross - inKind.reduce((s, x) => s + x.amount, 0)) / 12),
    calc: `이달 지급 총액 ${won(gross)}${inKind.length ? "(현물 뺌)" : ""} ÷ 12 (1년 이상 근무하면 줄 퇴직금 몫)`,
  });
  const employerTotal = employer.reduce((s, e) => s + e.amount, 0);
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
    incomeTaxSource: source,
    production: input.production || undefined,
    otTaxfree: otTaxfree || undefined,
    tfOk: input.tfOk,
    tfExtra: Object.keys(tfExtra).length ? tfExtra : undefined,
    fixedOt,
    bank: input.bank ?? null,
    family: input.family,
    children,
    withholdRate,
    extras: input.extras,
    insurances: t.insurances,
    employer,
    employerTotal,
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

/**
 * 실수령액 보장 세전 계약(대표 결정 2026-11-25): 직원과 '월 실수령 ○○원'으로 정하면 그만큼 받도록 세전 기본급을 거꾸로 구한다.
 * 연장·결근이 없는 보통 달 기준(고정 수당·고정 연장근로수당은 계약서 값, 고정 연장수당은 기본급에 따라 다시 계산).
 * 소득세는 간이세액표(가족·자녀·원천징수 100%), 청년 소득세 감면 등은 넣지 않는다. 월급제만.
 */
export function grossForNet(input: {
  target: number;
  terms: ContractTerms;
  pol: PayPolicy;
  family: number;
  children: number;
  production?: boolean;
}) {
  const { target, pol } = input;
  const zero = { overtime: 0, night: 0, holiday: 0, holidayOver8: 0, absentDays: 0, sickDays: 0, shortHours: 0 };
  const at = (basePay: number) => {
    const t: ContractTerms = { ...input.terms, payType: "monthly", basePay };
    if (t.fixedOtHours && t.fixedOtHours > 0) t.fixedOtAmount = fixedOtPay(t, pol.legal5);
    return computeSlip({
      name: "",
      terms: t,
      ym: "2026-01",
      hiredOn: null,
      leftOn: null,
      // 고정 연장은 약정 시간만큼 일한다고 보고 계산(실제로 안 일한 몫은 과세라서 0시간으로 두면 실수령이 낮게 나옴)
      att: { ...zero, overtime: t.fixedOtHours && t.fixedOtHours > 0 ? t.fixedOtHours : 0 },
      pol,
      incomeTax: 0,
      incomeTaxSource: "auto",
      family: input.family,
      children: input.children,
      extras: [],
      production: input.production,
    });
  };
  if (!(target > 0)) return null;
  // 1,000원 단위로 찾는다: 이분 탐색 뒤 간이세액표 계단 때문에 모자라면 조금씩 올림
  let lo = 0;
  let hi = Math.ceil((target * 3) / 1000);
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (at(mid * 1000).net >= target) hi = mid;
    else lo = mid + 1;
  }
  let base = lo * 1000;
  let slip = at(base);
  for (let i = 0; i < 50 && slip.net < target; i++) slip = at((base += 1000));
  return {
    basePay: base,
    fixedOtAmount: slip.pays.find((p) => p.code === "fixot")?.amount ?? 0,
    gross: slip.gross,
    net: slip.net,
    taxfree: slip.taxfree,
    deductTotal: slip.deductTotal,
    employerTotal: slip.employerTotal ?? 0,
    cost: slip.gross + (slip.employerTotal ?? 0),
    hourly: slip.hourly,
    minWageOk: slip.hourly >= pol.minWage,
  };
}
