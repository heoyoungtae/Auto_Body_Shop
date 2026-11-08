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

/** 누가 얼마를 내는가: 보험사 = 손해사정 금액 − 자기부담금, 고객 = 일반 줄 + 자기부담금 + 합의한 미승인분. 나머지는 정비소 손실(감액) */
export function splitClaim(a: ClaimAmounts) {
  const adjusted = a.adjustedWon ?? a.insuranceWon;
  const insurerDue = Math.max(0, adjusted - a.deductibleWon);
  const customerDue = a.generalWon + Math.min(a.deductibleWon, adjusted) + a.customerExtraWon;
  const unapproved = Math.max(0, a.insuranceWon - adjusted);
  const shopLoss = Math.max(0, unapproved - a.customerExtraWon);
  return { adjusted, insurerDue, customerDue, unapproved, shopLoss };
}

/** 기한: 손해사정 요청 = 입고 후 1영업일, 청구 = 출고 후 3영업일, 독촉 = 청구 후 30일 */
export function claimDeadlines(p: { inDate: string; deliveredDate?: string | null; claimedDate?: string | null }, cal: ShopCalendar = DEFAULT_CALENDAR) {
  return {
    requestBy: addBusinessDays(p.inDate, 1, cal),
    claimBy: p.deliveredDate ? addBusinessDays(p.deliveredDate, 3, cal) : null,
    dunFrom: p.claimedDate ? addDays(p.claimedDate, DUN_DAYS) : null,
  };
}
