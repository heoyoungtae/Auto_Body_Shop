// 근로소득 간이세액표(소득세법 시행령 별표 2) 계산. 화면·서버·테스트가 같이 쓴다(DB 없음).
// 표는 아래 산출 방식으로 만든 것이라 같은 방식으로 계산한다(별표 2 '작성 방법').
//   1 월급여(비과세 제외)가 든 구간의 중간값 × 12 = 연간 총급여
//   2 근로소득공제 → 근로소득금액
//   3 인적공제(가족 1명당 150만 원) + 연금보험료공제(표 작성 요율) + 특별소득공제 등(가족 수·총급여 구간 식)
//   4 기본세율 → 산출세액 − 근로소득세액공제 = 결정세액 ÷ 12(10원 미만 버림)
//   5 8~20세 자녀 수에 따라 정해진 금액을 뺀다, 직원이 고른 비율(80·100·120%)을 곱한다
// 국세청 표와 원 단위가 다를 수 있다. 다르면 회계 담당이 직접 넣은 값이 이긴다 [확인 필요].

export type TaxTablePolicy = {
  /** 표 작성에 쓴 국민연금 요율, ÷1000 %(4500 = 4.5%) */
  pensionRate: number;
  pensionCap: number;
  pensionFloor: number;
  /** 8~20세 자녀 1명·2명일 때 월 공제액, 3명째부터 1명당 더 빼는 금액 */
  childOne: number;
  childTwo: number;
  childMore: number;
};

/** 기본세율(소득세법 제55조) — 과세표준 상한, 세율 */
const RATES: [number, number][] = [
  [14_000_000, 0.06],
  [50_000_000, 0.15],
  [88_000_000, 0.24],
  [150_000_000, 0.35],
  [300_000_000, 0.38],
  [500_000_000, 0.4],
  [1_000_000_000, 0.42],
  [Infinity, 0.45],
];

export function basicTax(base: number) {
  let tax = 0;
  let prev = 0;
  for (const [cap, r] of RATES) {
    if (base > prev) tax += (Math.min(base, cap) - prev) * r;
    prev = cap;
  }
  return tax;
}

/** 근로소득공제(소득세법 제47조, 한도 2,000만 원) */
export function earnedDeduction(total: number) {
  const steps: [number, number, number][] = [
    [0, 5_000_000, 0.7],
    [5_000_000, 15_000_000, 0.4],
    [15_000_000, 45_000_000, 0.15],
    [45_000_000, 100_000_000, 0.05],
    [100_000_000, Infinity, 0.02],
  ];
  let d = 0;
  for (const [lo, hi, r] of steps)
    if (total > lo) d += (Math.min(total, hi) - lo) * r;
  return Math.min(d, 20_000_000);
}

/** 특별소득공제 등(별표 2 작성 방법의 가족 수·총급여 구간 식) */
export function specialDeduction(total: number, family: number) {
  if (total > 120_000_000) return 0;
  if (family <= 2) {
    const fixed = family === 1 ? 3_100_000 : 3_600_000;
    if (total <= 30_000_000) return fixed + total * 0.04;
    if (total <= 45_000_000)
      return fixed + total * 0.04 - (total - 30_000_000) * 0.05;
    if (total <= 70_000_000)
      return fixed + total * (family === 1 ? 0.015 : 0.02);
    return fixed + total * (family === 1 ? 0.005 : 0.01);
  }
  const over40 = Math.max(0, total - 40_000_000) * 0.04;
  if (total <= 30_000_000) return 5_000_000 + total * 0.07 + over40;
  if (total <= 45_000_000)
    return 5_000_000 + total * 0.07 - (total - 30_000_000) * 0.05 + over40;
  if (total <= 70_000_000) return 5_000_000 + total * 0.05 + over40;
  return 5_000_000 + total * 0.03 + over40;
}

/** 근로소득세액공제(소득세법 제59조, 총급여별 한도) */
export function earnedCredit(total: number, tax: number) {
  const c = tax <= 1_300_000 ? tax * 0.55 : 715_000 + (tax - 1_300_000) * 0.3;
  let cap: number;
  if (total <= 33_000_000) cap = 740_000;
  else if (total <= 70_000_000)
    cap = Math.max(740_000 - (total - 33_000_000) * 0.008, 660_000);
  else if (total <= 120_000_000)
    cap = Math.max(660_000 - (total - 70_000_000) / 2, 500_000);
  else cap = Math.max(500_000 - (total - 120_000_000) / 2, 200_000);
  return Math.min(c, cap);
}

/** 간이세액표의 월급여 구간(천 원 단위): [이상, 미만] */
export function bracketOf(monthly: number): [number, number] {
  const k = Math.floor(monthly / 1000);
  const step = k < 1_500 ? 5 : k < 3_000 ? 10 : 20;
  const lo = Math.floor(k / step) * step;
  return [lo * 1000, (lo + step) * 1000];
}

const floor10 = (n: number) => Math.floor(n / 10) * 10;

/** 구간 중간값으로 계산한 표의 한 칸(가족 수별, 자녀·비율 적용 전) */
function tableCell(mid: number, family: number, pol: TaxTablePolicy) {
  const total = mid * 12;
  const income = total - earnedDeduction(total);
  const pension =
    Math.min(pol.pensionCap, Math.max(pol.pensionFloor, mid)) *
    (pol.pensionRate / 100_000) *
    12;
  const base =
    income - 1_500_000 * family - pension - specialDeduction(total, family);
  const t = basicTax(Math.max(0, base));
  const decided = Math.max(0, t - earnedCredit(total, t));
  return floor10(decided / 12);
}

export type SimpleTaxInput = {
  /** 비과세를 뺀 월 급여 */
  monthly: number;
  /** 공제 대상 가족 수(본인 포함, 1~11) */
  family: number;
  /** 8세 이상 20세 이하 자녀 수 */
  children: number;
  /** 원천징수 비율 80·100·120 */
  rate: number;
};

/**
 * 월 소득세(지방소득세 빼고). 106만 원 미만은 0.
 * 1,000만 원 넘는 월급여는 별표 2 하단 식(1,000만 원 칸 + 초과분 비율)으로 계산한다.
 */
export function simpleIncomeTax(i: SimpleTaxInput, pol: TaxTablePolicy) {
  const family = Math.min(11, Math.max(1, Math.round(i.family)));
  const monthly = Math.max(0, Math.round(i.monthly));
  if (monthly < 1_060_000)
    return { amount: 0, calc: `과세 급여 106만 원 미만이라 소득세 없음` };
  let base: number;
  let how: string;
  if (monthly === 10_000_000) {
    base = tableCell(10_000_000, family, pol);
    how = `간이세액표 10,000천원 칸 · 가족 ${family}명`;
  } else if (monthly < 10_000_000) {
    const [lo, hi] = bracketOf(monthly);
    base = tableCell((lo + hi) / 2, family, pol);
    how = `간이세액표 ${(lo / 1000).toLocaleString("ko-KR")}~${(hi / 1000).toLocaleString("ko-KR")}천원 구간 · 가족 ${family}명`;
  } else {
    const at10 = tableCell(10_000_000, family, pol);
    const x = monthly;
    const over = (from: number) => x - from;
    if (x <= 14_000_000) base = at10 + over(10_000_000) * 0.98 * 0.35 + 25_000;
    else if (x <= 28_000_000)
      base = at10 + 1_397_000 + over(14_000_000) * 0.98 * 0.38;
    else if (x <= 30_000_000)
      base = at10 + 6_610_600 + over(28_000_000) * 0.98 * 0.4;
    else if (x <= 45_000_000)
      base = at10 + 7_394_600 + over(30_000_000) * 0.4;
    else if (x <= 87_000_000)
      base = at10 + 13_394_600 + over(45_000_000) * 0.42;
    else base = at10 + 31_034_600 + over(87_000_000) * 0.45;
    base = floor10(base);
    how = `간이세액표 1,000만 원 초과 식 · 가족 ${family}명`;
  }
  const kids = Math.max(0, Math.round(i.children));
  const childOff =
    kids === 0
      ? 0
      : kids === 1
        ? pol.childOne
        : pol.childTwo + (kids - 2) * pol.childMore;
  const afterKids = Math.max(0, base - childOff);
  const rate = [80, 100, 120].includes(i.rate) ? i.rate : 100;
  const amount = floor10((afterKids * rate) / 100);
  const parts = [how];
  if (kids) parts.push(`8~20세 자녀 ${kids}명 −${childOff.toLocaleString("ko-KR")}원`);
  if (rate !== 100) parts.push(`본인 선택 ${rate}%`);
  return { amount, calc: parts.join(" · ") };
}
