// 회계 규칙(STD-12). 화면과 서버가 같이 쓴다(DB 없음). 금액은 모두 원.

/** 고객에게 받는 방법 */
export const PAY_IN_METHODS = {
  card: "카드",
  cash: "현금",
  transfer: "계좌 이체",
} as const;
export type PayInMethod = keyof typeof PAY_IN_METHODS;
export const isPayInMethod = (s: string): s is PayInMethod =>
  s in PAY_IN_METHODS;

/** 고객에게 주는 증빙 */
export const RECEIPT_KINDS = {
  card_slip: "카드 전표",
  cash_receipt: "현금영수증",
  tax_invoice: "전자 세금계산서(사업자 고객)",
  none: "발행 안 함",
} as const;
export type ReceiptKind = keyof typeof RECEIPT_KINDS;
export const isReceiptKind = (s: string): s is ReceiptKind =>
  s in RECEIPT_KINDS;

/**
 * 현금영수증 의무 발행 금액. 자동차 수리업은 현금영수증 의무발행업종이라 10만 원 이상 현금(계좌 이체 포함)을 받으면
 * 고객이 원하지 않아도 발행한다(소득세법 제162조의3 ④, 원하지 않으면 국세청 지정 번호 010-000-1234로 5일 안에 발행).
 */
export const CASH_RECEIPT_MUST = 100_000;

/** 받는 방법에 맞는 증빙인지, 의무 발행을 빠뜨리지 않았는지 */
export function receiptProblem(
  method: PayInMethod,
  kind: ReceiptKind,
  amount: number,
  receiptNo: string,
): string | null {
  if (method === "card" && kind !== "card_slip" && kind !== "tax_invoice")
    return "카드로 받으면 증빙은 카드 전표입니다(사업자 고객이면 세금계산서)";
  if (method !== "card" && kind === "card_slip")
    return "카드 전표는 카드로 받을 때만 고릅니다";
  if (method !== "card" && amount >= CASH_RECEIPT_MUST && kind === "none")
    return `현금·계좌 이체로 ${CASH_RECEIPT_MUST.toLocaleString("ko-KR")}원 이상 받으면 현금영수증을 꼭 발행합니다(자동차 수리업 의무 발행). 고객이 원하지 않으면 국세청 지정 번호(010-000-1234)로 발행하세요`;
  if ((kind === "cash_receipt" || kind === "tax_invoice") && !receiptNo.trim())
    return `${RECEIPT_KINDS[kind]} 승인 번호를 적어 주세요`;
  return null;
}

/** 지출 계정(분류) */
export const EXP_CATEGORIES = {
  parts: "부품",
  paint: "도료",
  consumable: "작업 소모품(사포·마스킹 등)",
  outsource: "외주 가공",
  equipment: "설비·공구",
  repair: "설비 수리·유지",
  rent: "임차료",
  utility: "전기·가스·수도·통신",
  tax: "세금·공과금",
  insurance: "보험료",
  fee: "수수료(카드·은행·용역)",
  welfare: "복리후생(식대·작업복)",
  vehicle: "차량 유지(유류·통행료)",
  ad: "광고·판촉",
  office: "사무용품(복사지·문구·잉크)",
  entertain: "접대비(거래처 식사·선물)",
  training: "교육훈련(교육비·자격 시험)",
  travel: "출장·교통비(숙박·대중교통)",
  freight: "택배·운반비",
  other: "기타",
} as const;
export type ExpCategory = keyof typeof EXP_CATEGORIES;
/** 부가세 매입세액을 공제받지 못하는 지출 계정(부가가치세법 제39조 제1항 제6호: 기업업무추진비). 부가세도 비용으로 잡는다 */
export const NO_VAT_CREDIT_CATEGORIES = ["entertain"] as const;
export const noVatCredit = (category: string) => (NO_VAT_CREDIT_CATEGORIES as readonly string[]).includes(category);
export const isExpCategory = (s: string): s is ExpCategory =>
  s in EXP_CATEGORIES;

/**
 * 계정별 몫을 금액에 맞춰 나눈다(원 단위, 끝수는 가장 큰 몫에). 계정이 하나뿐이면 빈 배열(= category 하나로 전액)
 * parts 의 won 은 비율로만 쓴다(공급가든 합계든 같음)
 */
export function splitByShare(parts: { category: string; won: number }[], amount: number): { category: string; won: number }[] {
  const merged = new Map<string, number>();
  for (const p of parts) if (p.won > 0) merged.set(p.category, (merged.get(p.category) ?? 0) + p.won);
  if (merged.size < 2) return [];
  const total = [...merged.values()].reduce((a, b) => a + b, 0);
  const out = [...merged.entries()].sort((a, b) => b[1] - a[1]).map(([category, w]) => ({ category, won: Math.floor((amount * w) / total) }));
  out[0].won += amount - out.reduce((a, b) => a + b.won, 0);
  return out;
}

/** 발주 종류 → 지출 계정 */
export const PO_KIND_CATEGORY: Record<string, ExpCategory> = {
  repair: "parts",
  stock: "consumable",
};

/** 지출 증빙 */
export const EVIDENCE_KINDS = {
  tax_invoice: "세금계산서(계산서)",
  card: "카드 전표",
  cash_receipt: "현금영수증(지출 증빙용)",
  bill: "고지서·계약서(임차료·공과금 등)",
  event_card: "청첩장·부고장(경조사비)",
  receipt: "간이영수증",
  pending: "아직 못 받음(나중에 붙임)",
} as const;
export type EvidenceKind = keyof typeof EVIDENCE_KINDS;
export const isEvidenceKind = (s: string): s is EvidenceKind =>
  s in EVIDENCE_KINDS;

/** 경조사(축의금·부의금 등). staff 는 사내 경조금 기준표(정책값 welfare.event_*)가 있는 것 */
export const EVENT_KINDS = {
  wedding: { label: "결혼(본인)", staff: true },
  wedding_child: { label: "결혼(자녀)", staff: true },
  birth: { label: "출산·돌", staff: true },
  funeral: { label: "상(부모·배우자·자녀)", staff: true },
  funeral_far: { label: "상(조부모·형제자매)", staff: true },
  opening: { label: "개업·이전", staff: false },
  other: { label: "기타(용도에 적음)", staff: false },
} as const;
export type EventKind = keyof typeof EVENT_KINDS;
export const isEventKind = (s: string): s is EventKind => s in EVENT_KINDS;
export const EVENT_TARGETS = { client: "거래처(업체·보험사 등)", staff: "직원" } as const;
export type EventTarget = keyof typeof EVENT_TARGETS;
/** 경조사비 계정: 거래처 → 접대비, 직원 → 복리후생 */
export const EVENT_CATEGORY: Record<EventTarget, ExpCategory> = { client: "entertain", staff: "welfare" };
/** 직원 경조금 기준표 정책값 키 */
export const staffEventKey = (k: EventKind) => `welfare.event_${k}` as const;

/**
 * 경조사비 점검: 거래처 경조사비는 1회 한도(정책값, 법정 20만원)까지만 청첩장·부고장으로 비용 인정.
 * 넘으면 전액 불인정(법인세법 시행령 제41조 제1항, 소득세법 시행령 제83조 제3항). 문제 문구 또는 null
 */
export function eventProblem(e: { target: string; kind: string; on: string; name: string }, amount: number, clientMax: number): string | null {
  if (!(e.target in EVENT_TARGETS)) return "경조사 상대(거래처·직원)를 골라 주세요";
  if (!isEventKind(e.kind)) return "경조사 종류를 골라 주세요";
  if (!e.name.trim()) return "경조사 상대 이름을 적어 주세요";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(e.on)) return "경조사 날짜를 적어 주세요";
  if (e.target === "client" && amount > clientMax)
    return `거래처 경조사비는 한 번에 ${clientMax.toLocaleString("ko-KR")}원까지만 청첩장·부고장으로 비용 인정됩니다. 넘으면 전액 인정되지 않습니다`;
  return null;
}

/** 이 금액을 넘는 지출에 간이영수증만 있으면 적격 증빙이 아니어서 2% 가산세 대상(법인세법 제76조·소득세법 제81조의6) */
export const SIMPLE_RECEIPT_MAX = 30_000;

export const EXP_PAY_METHODS = {
  transfer: "계좌 이체",
  card: "법인(사업자) 카드",
  cash: "현금",
  auto: "자동 이체",
} as const;
export type ExpPayMethod = keyof typeof EXP_PAY_METHODS;
export const isExpPayMethod = (s: string): s is ExpPayMethod =>
  s in EXP_PAY_METHODS;

export const SOURCE_KINDS = {
  po: "발주서",
  outsource: "외주 의뢰서",
  settle: "외상매입금·미지급금 지급",
  none: "근거 전표 없음(결의서로 승인)",
} as const;
export type SourceKind = keyof typeof SOURCE_KINDS;

/** 지출 결의 진행 상태(결재 문서 상태 + 지급·취소) */
export const EXP_STATUS = {
  draft: "작성 중",
  in_progress: "결재 중",
  rejected: "반려",
  approved: "승인(지급 전)",
  paid: "지급함",
  cancelled: "취소",
} as const;
export type ExpStatus = keyof typeof EXP_STATUS;

export function expStatus(
  docStatus: string,
  paidAt: Date | null,
  cancelledAt: Date | null,
): ExpStatus {
  if (cancelledAt) return "cancelled";
  if (paidAt) return "paid";
  if (docStatus === "confirmed" || docStatus === "checked") return "approved";
  if (docStatus === "cancelled" || docStatus === "discarded")
    return "cancelled";
  if (docStatus === "rejected") return "rejected";
  if (docStatus === "in_progress") return "in_progress";
  return "draft";
}

/** 부가세: 공급가의 10%(원 단위 버림). 세금계산서 금액과 다르면 계산서 금액을 적는다 */
export const vatOf = (supply: number) => Math.floor(supply / 10);

/** 공급가 + 부가세가 맞는지(부가세는 0 이거나 공급가의 10%에서 ±10원) */
export function vatProblem(supply: number, vat: number): string | null {
  if (supply <= 0) return "공급가를 적어 주세요";
  if (vat < 0) return "부가세는 0 이상입니다";
  if (vat > 0 && Math.abs(vat - supply / 10) > 10)
    return `부가세가 공급가의 10%(${vatOf(supply).toLocaleString("ko-KR")}원)와 다릅니다. 증빙에 적힌 금액을 확인해 주세요`;
  return null;
}

/** 저장 전에 보여 줄 증빙 경고 */
export function evidenceWarning(
  kind: EvidenceKind,
  amount: number,
): string | null {
  if (kind === "receipt" && amount > SIMPLE_RECEIPT_MAX)
    return `${SIMPLE_RECEIPT_MAX.toLocaleString("ko-KR")}원이 넘는 지출을 간이영수증으로만 받으면 적격 증빙이 아니어서 가산세(2%) 대상입니다. 가능하면 세금계산서·카드 전표·현금영수증을 받으세요`;
  if (kind === "pending")
    return "증빙을 받기 전에는 지급할 수 없습니다. 받으면 이 결의서에 붙여 주세요";
  return null;
}

/** 미수: 출고 뒤 이 날수가 지나면 독촉 */
export const AR_DUN_DAYS = 30;

export const MONTH_CLOSE_STATUS = {
  submitted: "승인 대기",
  approved: "마감(승인)",
  returned: "돌려보냄",
} as const;

/** 'YYYY-MM' 의 첫날·끝날 */
export function ymRange(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${ym}-01`, to: `${ym}-${String(last).padStart(2, "0")}` };
}
export const prevYm = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
};
export const isYm = (s: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(s);
export const daysBetween = (a: string, b: string) =>
  Math.round(
    (Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 864e5,
  );

// ── 외상매입금·미지급금 ──
/** 결제 조건 */
/** 결제 조건. prepay 선입금: 발주 승인 때 먼저 내고(선급금), 입고 검수 때 매입으로 정리한다(대표 결정 2026-11-12) */
export const PAY_TERMS = { prepay: "선입금(입금 후 발송)", now: "입고 때(현장·착불)", month_end: "당월 말", next_end: "익월 말", next_day: "익월 ○일" } as const;
export type PayTerm = keyof typeof PAY_TERMS;
export const isPayTerm = (s: string): s is PayTerm => s in PAY_TERMS;
export const payTermLabel = (t: string, day: number | null) => (t === "next_day" ? `익월 ${day ?? "?"}일` : (PAY_TERMS[t as PayTerm] ?? t));

const lastDayOf = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
};
const nextYm = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
};

/** 결제 조건으로 정한 날(휴일 조정 전). 익월 ○일이 그 달에 없으면(31일 등) 그 달 말일 */
export function termDate(accruedOn: string, term: PayTerm, day: number | null): string {
  const ym = accruedOn.slice(0, 7);
  if (term === "now" || term === "prepay") return accruedOn;
  if (term === "month_end") return lastDayOf(ym);
  const n = nextYm(ym);
  if (term === "next_end") return lastDayOf(n);
  const d = Math.min(Math.max(1, day ?? 10), 31);
  const last = lastDayOf(n);
  return `${n}-${String(d).padStart(2, "0")}` > last ? last : `${n}-${String(d).padStart(2, "0")}`;
}

/** 은행이 쉬는 날이면 바로 앞 영업일로 당긴다. isOpen: 은행 영업일인지 */
export function backToBusinessDay(iso: string, isOpen: (d: string) => boolean): string {
  let t = Date.parse(`${iso}T00:00:00Z`);
  for (let i = 0; i < 15 && !isOpen(new Date(t).toISOString().slice(0, 10)); i++) t -= 864e5;
  return new Date(t).toISOString().slice(0, 10);
}

/** 외상매입금(trade)인지 미지급금(other)인지: 본업 매입(부품·도료·소모품)은 외상매입금, 외주 가공은 정책값을 따른다 */
export const TRADE_CATEGORIES = ["parts", "paint", "consumable"] as const;
export function payableKind(category: string, outsourceTrade: boolean): "trade" | "other" {
  if ((TRADE_CATEGORIES as readonly string[]).includes(category)) return "trade";
  if (category === "outsource") return outsourceTrade ? "trade" : "other";
  return "other";
}
export const PAYABLE_KINDS = { trade: "외상매입금", other: "미지급금", card: "미지급금(카드)", prepay: "선입금(낼 돈)" } as const;

/** 카드로 쓴 날 → 카드 대금 빠지는 날(다음 달 payDay일, 은행 쉬는 날이면 다음 영업일이지만 여기서는 그 날로 본다) */
export function cardDueOn(usedOn: string, payDay: number): string {
  const n = nextYm(usedOn.slice(0, 7));
  const d = Math.min(Math.max(1, payDay), 28);
  return `${n}-${String(d).padStart(2, "0")}`;
}
