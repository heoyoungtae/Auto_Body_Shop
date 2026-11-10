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
  consumable: "소모품",
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
  other: "기타",
} as const;
export type ExpCategory = keyof typeof EXP_CATEGORIES;
export const isExpCategory = (s: string): s is ExpCategory =>
  s in EXP_CATEGORIES;

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
  receipt: "간이영수증",
  pending: "아직 못 받음(나중에 붙임)",
} as const;
export type EvidenceKind = keyof typeof EVIDENCE_KINDS;
export const isEvidenceKind = (s: string): s is EvidenceKind =>
  s in EVIDENCE_KINDS;

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
