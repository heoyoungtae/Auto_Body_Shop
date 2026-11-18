// 업체 고객 외상(외상매출금) 규칙 — 화면과 서버가 같이 쓴다(DB 없음). 대표 결정 2026-11-17.
// 업체 고객(렌터카·중고차 상품화·법인 등)은 결제 없이 출고하고(외상), 정비명세서를 발급·출고한 날 매출과 외상매출금이 생긴다.
// 달이 끝나면 업체별 청구서 한 장으로 모아 청구하고, 받을 날은 업체 결제 조건으로 계산한다. 협력업체 외상매입금(payable.ts)과 같은 방식.
import { isPayTerm, termDate, type PayTerm } from "./rules";

export const CUSTOMER_KINDS = { person: "개인", business: "업체" } as const;
export type CustomerKind = keyof typeof CUSTOMER_KINDS;
export const isCustomerKind = (s: string): s is CustomerKind => s in CUSTOMER_KINDS;

/** 업체 고객 결제 조건(선입금은 업체 고객에게 쓰지 않는다) */
export const AR_PAY_TERMS = { now: "출고 때(그 자리 결제)", month_end: "당월 말", next_end: "익월 말", next_day: "익월 ○일" } as const;
export const isArPayTerm = (s: string): s is Exclude<PayTerm, "prepay"> => s in AR_PAY_TERMS && isPayTerm(s);

/** 세금계산서 발행 방식 */
export const INVOICE_MODES = { monthly: "월 합계(청구서 한 장, 다음 달 10일까지)", each: "건별(출고할 때마다)" } as const;
export type InvoiceMode = keyof typeof INVOICE_MODES;
export const isInvoiceMode = (s: string): s is InvoiceMode => s in INVOICE_MODES;

/** 업체 쪽 주문 앱(우리가 그 앱에 접속해 주문을 확인하고 진행 상태를 등록한다) */
export const PORTALS = { techbay: "테크베이(PRND 상품화)", other: "그 밖의 업체 앱·웹" } as const;
export type Portal = keyof typeof PORTALS;
export const isPortal = (s: string): s is Portal => s in PORTALS;
export const TECHBAY_URL = "https://techbay-reconditioning.prnd.co.kr";

/** 그쪽 앱에 등록할 진행 상태. 수리 건 상태가 여기까지 오면 '등록할 일'이 생긴다 */
export const PORTAL_STEPS = {
  intake: "입고",
  working: "작업 시작",
  ready: "수리 완료(출고 대기)",
  delivered: "출고",
} as const;
export type PortalStep = keyof typeof PORTAL_STEPS;
export const isPortalStep = (s: string): s is PortalStep => s in PORTAL_STEPS;

const RO_ORDER = ["intake", "checked", "estimating", "working", "inspecting", "ready", "delivered"];
/** 수리 건 상태로 이미 지난 진행 단계(그쪽 앱에 등록해야 할 것) */
export function reachedSteps(roStatus: string | null): PortalStep[] {
  if (!roStatus || roStatus === "cancelled") return [];
  const i = RO_ORDER.indexOf(roStatus);
  if (i < 0) return ["intake"];
  const out: PortalStep[] = ["intake"];
  if (i >= RO_ORDER.indexOf("working")) out.push("working");
  if (i >= RO_ORDER.indexOf("ready")) out.push("ready");
  if (i >= RO_ORDER.indexOf("delivered")) out.push("delivered");
  return out;
}

/** 은행이 쉬는 날이면 다음 영업일로 미룬다(받을 돈은 업체가 다음 영업일에 보낸다) */
export function forwardToBusinessDay(iso: string, isOpen: (d: string) => boolean): string {
  let t = Date.parse(`${iso}T00:00:00Z`);
  for (let i = 0; i < 15 && !isOpen(new Date(t).toISOString().slice(0, 10)); i++) t += 864e5;
  return new Date(t).toISOString().slice(0, 10);
}

/** 외상 출고 한 건의 받을 날(휴일 조정 전): 출고한 날 기준 결제 조건 */
export const creditDueDate = (deliveredOn: string, term: string | null, day: number | null) => termDate(deliveredOn, isArPayTerm(term ?? "") ? (term as PayTerm) : "next_end", day);

/** 청구서의 받을 날(휴일 조정 전): 청구하는 달(ym)의 출고분을 결제 조건으로. '출고 때'는 청구한 날 */
export function billDueDate(ym: string, issuedOn: string, term: string | null, day: number | null) {
  const t = (isArPayTerm(term ?? "") ? term : "next_end") as PayTerm;
  if (t === "now") return issuedOn;
  const due = termDate(`${ym}-01`, t, day);
  return due < issuedOn ? issuedOn : due;
}

/** 월 합계 세금계산서 발급 기한: 공급한 달의 다음 달 10일(부가가치세법 제34조 ③) */
export function monthlyInvoiceDeadline(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  const n = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  return `${n}-10`;
}

/** 출고 때 보일 외상 경고(한도 넘음·연체). 경고가 있으면 확인 체크를 받고 대표에게 알린다 */
export function creditWarnings(s: { limit: number | null; balance: number; overdue: number; overdueDays: number }, addWon: number): string[] {
  const out: string[] = [];
  const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;
  if (s.overdue > 0) out.push(`받을 날이 지난 외상 ${won(s.overdue)}이 있습니다(가장 오래된 것 ${s.overdueDays}일 지남)`);
  if (s.limit != null && s.balance + addWon > s.limit) out.push(`외상 한도 ${won(s.limit)}를 넘습니다(지금 잔액 ${won(s.balance)} + 이번 ${won(addWon)} = ${won(s.balance + addWon)})`);
  return out;
}
