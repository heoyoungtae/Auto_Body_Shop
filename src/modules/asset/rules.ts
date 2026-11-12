// 비품·설비 공통 규칙(대표 지시 2026-11-12): 소유 구분, 감가상각 계산, 사용계약
export const OWNERSHIP = {
  own: "자사 소유",
  lease: "유상 임차·렌탈·리스",
  loan: "무상 대여",
  customer: "고객·협력업체 물건",
} as const;
export type Ownership = keyof typeof OWNERSHIP;
export const isOwnership = (s: string): s is Ownership => s in OWNERSHIP;

export const DEP_METHODS = {
  sl: "정액법",
  db: "정률법",
  expense: "산 날 비용 처리",
  none: "상각 안 함",
} as const;
export type DepMethod = keyof typeof DEP_METHODS;
export const isDepMethod = (s: string): s is DepMethod => s in DEP_METHODS;

export const REPAIR_BY = { owner: "빌려준 쪽", us: "우리" } as const;

/** 정률법 상각률(법인세법 시행규칙 별표4, 잔존가액 5% 기준) */
export const DB_RATES: Record<number, number> = { 2: 0.777, 3: 0.632, 4: 0.528, 5: 0.451, 6: 0.394, 7: 0.349, 8: 0.313, 9: 0.284, 10: 0.259, 11: 0.239, 12: 0.221, 13: 0.206, 14: 0.193, 15: 0.182, 16: 0.171, 17: 0.162, 18: 0.154, 19: 0.146, 20: 0.14 };

/** 상각이 끝나도 남겨 두는 금액(비망가액): 취득가의 5%와 1,000원 중 적은 것 */
export const memoValue = (cost: number) => Math.min(1000, Math.round(cost * 0.05));

export type DepInput = { cost: number; method: string; years: number | null; startOn: string | null; adds?: { on: string; won: number }[]; disposedOn?: string | null };
export type DepYear = { year: number; months: number; base: number; dep: number; accum: number; book: number };

const ym = (d: string) => {
  const [y, m] = d.split("-").map(Number);
  return { y, m };
};

/**
 * 해마다(1~12월 사업연도) 감가상각비. 첫해·처분한 해는 쓴 달 수만큼(월할).
 * 자본적 지출(adds)은 그 달부터 취득가에 더한다(세법: 기존 자산 가액에 합산해 같은 방법·연수로 상각).
 */
export function depSchedule(a: DepInput, untilYear: number): DepYear[] {
  if (!a.startOn || !a.years || a.years < 1 || (a.method !== "sl" && a.method !== "db")) return [];
  const s = ym(a.startOn);
  const end = a.disposedOn ? ym(a.disposedOn) : null;
  const rate = a.method === "db" ? (DB_RATES[a.years] ?? 1 - Math.pow(0.05, 1 / a.years)) : 1 / a.years;
  const out: DepYear[] = [];
  let accum = 0;
  let cost = a.cost;
  for (let y = s.y; y <= untilYear; y++) {
    if (end && y > end.y) break;
    const addsThisYear = (a.adds ?? []).filter((x) => ym(x.on).y === y).reduce((t, x) => t + x.won, 0);
    const addsBefore = (a.adds ?? []).filter((x) => ym(x.on).y < y && ym(x.on).y >= s.y).reduce((t, x) => t + x.won, 0);
    if (y === s.y) cost = a.cost + addsThisYear;
    else cost = a.cost + addsBefore + addsThisYear;
    const from = y === s.y ? s.m : 1;
    const to = end && y === end.y ? end.m : 12;
    const months = Math.max(0, to - from + 1);
    const floor = memoValue(cost);
    const bookStart = cost - accum;
    const base = a.method === "sl" ? cost : bookStart;
    let dep = Math.round((base * rate * months) / 12);
    dep = Math.max(0, Math.min(dep, bookStart - floor));
    accum += dep;
    out.push({ year: y, months, base, dep, accum, book: cost - accum });
    if (cost - accum <= floor && !(a.adds ?? []).some((x) => ym(x.on).y > y)) break;
  }
  return out;
}

/** 지금(그 해까지) 장부가·누계·올해 상각비 */
export function depNow(a: DepInput, year: number) {
  const sch = depSchedule(a, year);
  const last = sch[sch.length - 1];
  const totalCost = a.cost + (a.adds ?? []).filter((x) => ym(x.on).y <= year).reduce((t, x) => t + x.won, 0);
  if (a.method === "expense") return { accum: totalCost, book: 0, thisYear: a.startOn && ym(a.startOn).y === year ? totalCost : 0, cost: totalCost };
  if (!last) return { accum: 0, book: totalCost, thisYear: 0, cost: totalCost };
  return { accum: last.accum, book: last.book, thisYear: sch.find((r) => r.year === year)?.dep ?? 0, cost: totalCost };
}

/** 한 달의 상각비(월 마감용): 그 해 상각비를 쓴 달 수로 나눈 값 */
export function depOfMonth(a: DepInput, ymStr: string) {
  const { y, m } = ym(`${ymStr}-01`);
  const row = depSchedule(a, y).find((r) => r.year === y);
  if (!row || !row.months || !a.startOn) return 0;
  const s = ym(a.startOn);
  const from = y === s.y ? s.m : 1;
  const end = a.disposedOn ? ym(a.disposedOn) : null;
  const to = end && end.y === y ? end.m : 12;
  if (m < from || m > to) return 0;
  return Math.round(row.dep / row.months);
}

/** 품명으로 비품·설비 짐작(지출 결의에서 대장 등록할 때 먼저 골라 둠) */
const EQUIP_WORDS: [RegExp, string][] = [
  [/부스/, "booth"],
  [/컴프레서|콤프레샤|압축기/, "compressor"],
  [/리프트/, "lift"],
  [/용접|스폿|스팟/, "welder"],
  [/측정|게이지|도막|막후계|계측/, "gauge"],
  [/건조|적외선|IR/i, "dryer"],
];
export function guessAsset(name: string): { kind: "equipment"; eqKind: string } | { kind: "fixture"; fxCategory: string } {
  for (const [re, k] of EQUIP_WORDS) if (re.test(name)) return { kind: "equipment", eqKind: k };
  if (/노트북|컴퓨터|PC|모니터|태블릿|프린터|복합기|휴대폰|NAS|하드/i.test(name)) return { kind: "fixture", fxCategory: "it" };
  if (/마스크|방독|장갑|보안경|안전화|보호/.test(name)) return { kind: "fixture", fxCategory: "ppe" };
  if (/책상|의자|캐비닛|선반|소파|냉장고|정수기/.test(name)) return { kind: "fixture", fxCategory: "furniture" };
  if (/카트|대차|운반|차량/.test(name)) return { kind: "fixture", fxCategory: "vehicle" };
  return { kind: "fixture", fxCategory: "tool" };
}

/** 계약이 끝나기 며칠 남았나(끝 날이 없으면 null) */
export const daysLeft = (end: string | undefined | null, today: string) => (end ? Math.round((Date.parse(end) - Date.parse(today)) / 86_400_000) : null);
