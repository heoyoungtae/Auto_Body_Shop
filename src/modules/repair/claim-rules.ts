// 보험 청구 규칙(STD-03 6절, STD-12). 화면과 서버가 같이 쓴다(DB 없음). 금액은 모두 부가세 포함 원.
import { addBusinessDays, DEFAULT_CALENDAR, type ShopCalendar } from "@/modules/platform/business-days";
import { addDays } from "@/modules/platform/time";

export const CLAIM_STATUS_LABEL = { none: "접수 정보 없음", info: "접수 정보 확인", requested: "손해사정 요청함", scoped: "승인 범위 확인", claimed: "청구함(입금 대기)", paid: "입금 확인" } as const;
export type ClaimStatusKey = keyof typeof CLAIM_STATUS_LABEL;

export const COVERAGE_LABEL = { own: "자차(우리 고객 보험)", other: "대물(상대 차 보험)" } as const;
export const isCoverage = (s: string): s is keyof typeof COVERAGE_LABEL => s in COVERAGE_LABEL;

/** 청구할 때 내는 서류(STD-03 6절 5단계) */
export const CLAIM_DOCS = { bill: "청구서", statement: "정비명세서", photos: "작업 전·중·후 사진(공정별)", parts: "교체 부품 증빙(부품 사진·거래명세서)" } as const;

/** 청구 뒤 이 날수가 지나도 입금이 없으면 독촉(STD-03 6절 6단계) */
export const DUN_DAYS = 30;

export type ClaimAmounts = {
  /** 견적·명세서의 보험 줄 합계 */
  insuranceWon: number;
  /** 일반(고객) 줄 합계 */
  generalWon: number;
  /** 보험사 손해사정 금액(없으면 보험 줄 합계로 봄) */
  adjustedWon: number | null;
  deductibleWon: number;
  customerExtraWon: number;
};

/** 정산 공제(AOS 정산 화면): 감가상각은 고객이, 부품 할인·잔존물은 공업사가 메운다. 기타 공제는 정한 쪽이 */
export const OTHER_PAYER = { shop: "공업사가 떠안음", customer: "고객이 냄" } as const;
export type ClaimMoney = {
  adjustedWon: number | null;
  deductibleWon: number;
  customerExtraWon: number;
  depreciationWon?: number;
  partsDiscountWon?: number;
  salvageWon?: number;
  otherDeductWon?: number;
  otherDeductPayer?: string;
};

/**
 * 청구처가 여럿일 때(쌍방 과실) 누가 얼마를 내나.
 * 보험사 i 몫 = 사정 금액 − 자기부담금 − 감가상각 − 부품 할인 − 잔존물 − 기타 공제.
 * 고객 몫 = 일반 줄 + 자기부담금 + 감가상각 + 합의한 미승인분 (+ 고객이 내기로 한 기타 공제).
 * 사정 금액을 아직 모르는 보험사는 남은 보험 줄 금액을 똑같이 나눠 어림한다.
 */
export function splitClaims(a: { insuranceWon: number; generalWon: number; claims: ClaimMoney[] }) {
  const list = a.claims.length ? a.claims : [{ adjustedWon: null, deductibleWon: 0, customerExtraWon: 0 }];
  const known = list.reduce((s, c) => s + (c.adjustedWon ?? 0), 0);
  const unknown = list.filter((c) => c.adjustedWon == null).length;
  const rest = Math.max(0, a.insuranceWon - known);
  let given = 0;
  let seen = 0;
  const per = list.map((c) => {
    let adjusted = c.adjustedWon;
    if (adjusted == null) {
      seen += 1;
      adjusted = seen === unknown ? rest - given : Math.round(rest / unknown);
      given += adjusted;
    }
    const dep = c.depreciationWon ?? 0;
    const shopCut = (c.partsDiscountWon ?? 0) + (c.salvageWon ?? 0);
    const other = c.otherDeductWon ?? 0;
    const insurerDue = Math.max(0, adjusted - c.deductibleWon - dep - shopCut - other);
    const customer = Math.min(c.deductibleWon, adjusted) + dep + c.customerExtraWon + (c.otherDeductPayer === "customer" ? other : 0);
    const shopDeduct = shopCut + (c.otherDeductPayer === "customer" ? 0 : other);
    return { adjusted, insurerDue, customer, shopDeduct, extra: c.customerExtraWon };
  });
  const adjusted = per.reduce((s, p) => s + p.adjusted, 0);
  const unapproved = Math.max(0, a.insuranceWon - adjusted);
  const extra = per.reduce((s, p) => s + p.extra, 0);
  return {
    per: per.map((p) => ({ adjusted: p.adjusted, insurerDue: p.insurerDue })),
    adjusted,
    insurerDue: per.reduce((s, p) => s + p.insurerDue, 0),
    customerDue: a.generalWon + per.reduce((s, p) => s + p.customer, 0),
    unapproved,
    shopLoss: Math.max(0, unapproved - extra),
    shopDeduct: per.reduce((s, p) => s + p.shopDeduct, 0),
  };
}

/** 청구처 하나일 때: 보험사 = 손해사정 금액 − 자기부담금, 고객 = 일반 줄 + 자기부담금 + 합의한 미승인분. 나머지는 공업사 손실(감액) */
export function splitClaim(a: ClaimAmounts) {
  const s = splitClaims({ insuranceWon: a.insuranceWon, generalWon: a.generalWon, claims: [{ adjustedWon: a.adjustedWon, deductibleWon: a.deductibleWon, customerExtraWon: a.customerExtraWon }] });
  return { adjusted: s.adjusted, insurerDue: s.insurerDue, customerDue: s.customerDue, unapproved: s.unapproved, shopLoss: s.shopLoss };
}

/** 보험사가 줄마다 인정한 금액(부가세 별도)으로 사정 금액(부가세 포함) 어림: 보험 줄 합계 − 깎인 금액 × 1.1 */
export function adjustedFromLines(insuranceWon: number, lines: { id: string; amount: number }[], adj: Record<string, { won: number }>) {
  const cut = lines.reduce((s, l) => (adj[l.id] ? s + Math.max(0, l.amount - adj[l.id].won) : s), 0);
  return Math.max(0, insuranceWon - cut - Math.round(cut / 10));
}

/** 손해사정 결과에 대한 우리 입장 */
export const DISPUTE_LABEL = { none: "아직 정하지 않음", agreed: "동의", disputed: "이의 제기 중" } as const;
/** 청구 뒤 안 끝난 건(미결)의 결과 */
export const SETTLE_LABEL = { agreed: "합의", disagreed: "미합의" } as const;
/** 연락 이력 종류 */
export const NOTE_KIND_LABEL = { dun: "독촉", memo: "확인 요청", reply: "보험사 답", agreed: "합의", disagreed: "미합의", dispute: "이의 제기", aos: "AOS" } as const;

/** AOS 진행 칸(설정 'AOS 씀'을 켰을 때만 보임). 칸을 비워 둬도 앱의 다른 일은 막지 않는다 */
export const AOS_STEPS = { estimateAt: "선견적 AOS 전송", guaranteeAt: "지불보증 확인", claimAt: "청구 AOS 전송", closedAt: "AOS 종결" } as const;
export type AosStep = keyof typeof AOS_STEPS;
export const isAosStep = (s: string): s is AosStep => s in AOS_STEPS;

/** 기한: 손해사정 요청 = 입고 후 1영업일, 청구 = 출고 후 3영업일, 독촉 = 청구 후 30일 */
export function claimDeadlines(p: { inDate: string; deliveredDate?: string | null; claimedDate?: string | null }, cal: ShopCalendar = DEFAULT_CALENDAR) {
  return {
    requestBy: addBusinessDays(p.inDate, 1, cal),
    claimBy: p.deliveredDate ? addBusinessDays(p.deliveredDate, 3, cal) : null,
    dunFrom: p.claimedDate ? addDays(p.claimedDate, DUN_DAYS) : null,
  };
}
