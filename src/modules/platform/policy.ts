// 정책값 — 사내 표준서 부록 D. 숫자 규칙은 코드에 박지 않고 이 키로만 읽는다(앱 설계서 8.4).
// 기본값은 표준서의 제안값이다. 대표가 설정 화면에서 바꾸면 policy_setting 에 이력이 쌓이고, 최신 시행분이 이긴다.
import { UserError } from "@/modules/platform/errors";
import { desc, eq, gt, lte } from "drizzle-orm";
import type { Db } from "@/db/client";
import { appUser, policySetting } from "@/db/schema";
import { writeAudit } from "./audit";
import { seoulDate } from "./time";

type Def = { value: number; unit: string; label: string; clause: string; min?: number; max?: number };

export const DEFAULT_POLICY = {
  "consult.reply_business_days": { value: 1, unit: "영업일", label: "상담 회신 기한", clause: "1.1" },
  "consult.follow_up_days": { value: 3, unit: "일 뒤", label: "미예약 상담 재연락", clause: "1.1" },
  "intake.daily_capacity": { value: 0, unit: "대(0=미정)", label: "일별 입고 한도", clause: "1.2" },
  "intake.min_photos": { value: 8, unit: "장", label: "입고 사진 최소(8방향)", clause: "2.1" },
  "diagnosis.repaint_um": { value: 200, unit: "μm 초과", label: "재도장 이력 판정 도막 두께", clause: "2.5" },
  "estimate.valid_days": { value: 30, unit: "일", label: "견적 유효기간", clause: "3.2" },
  "estimate.followup_days": { value: 1, unit: "일 뒤", label: "견적 승인 재연락", clause: "3.2" },
  "estimate.overrun_pct": { value: 0, unit: "%", label: "견적 초과 허용", clause: "5.3", max: 100 },
  "inspect.gap_mm": { value: 1, unit: "mm 이내", label: "최종 검사: 패널 간극 좌우 차", clause: "5.5" },
  "inspect.film_min_um": { value: 100, unit: "μm 이상", label: "최종 검사: 도막 두께 하한", clause: "5.5" },
  "inspect.film_max_um": { value: 300, unit: "μm 이하", label: "최종 검사: 도막 두께 상한", clause: "5.5" },
  "inspect.after_photos": { value: 4, unit: "장 이상", label: "최종 검사: 작업 후 사진", clause: "5.5" },
  "delivery.no_wash_days": { value: 7, unit: "일", label: "출고 후 세차·왁스 금지 안내", clause: "5.8" },
  "warranty.paint_months": { value: 12, unit: "개월", label: "보증 기간: 도장·판금", clause: "6.1" },
  "warranty.dent_months": { value: 6, unit: "개월", label: "보증 기간: 덴트", clause: "6.1" },
  "warranty.polish_months": { value: 1, unit: "개월", label: "보증 기간: 광택", clause: "6.1" },
  "warranty.decision_business_days": { value: 3, unit: "영업일", label: "보증 판정 기한", clause: "6.2" },
  "survey.delay_days": { value: 7, unit: "일 뒤", label: "만족도 설문 발송", clause: "6.3" },
  "survey.complaint_threshold": { value: 3, unit: "점 이하", label: "설문 불만 자동 접수", clause: "6.3", max: 5 },
  "complaint.ack_business_days": { value: 1, unit: "영업일", label: "불만 접수 통지", clause: "6.4" },
  "complaint.reply_days": { value: 7, unit: "일", label: "불만 회신", clause: "6.4" },
  "nc.decision_hours": { value: 24, unit: "시간", label: "부적합 처리 결정", clause: "Q.9" },
  "nc.correction_days": { value: 14, unit: "일", label: "시정 완료", clause: "Q.9" },
  "nc.effect_check_days": { value: 30, unit: "일", label: "효과 확인", clause: "Q.9" },
  "risk.owner_alert_score": { value: 6, unit: "점 이상", label: "리스크 대표 알림", clause: "Q.4" },
  "legal.alert_days_first": { value: 30, unit: "일 전", label: "인허가 갱신 알림(1차)", clause: "Q.6" },
  "legal.alert_days_second": { value: 7, unit: "일 전", label: "인허가 갱신 알림(2차)", clause: "Q.6" },
  "legal.review_months": { value: 3, unit: "개월마다", label: "법령 개정 확인", clause: "Q.6" },
  "supplier.improve_below": { value: 70, unit: "점 미만", label: "협력업체 개선 요청", clause: "7.1", max: 100 },
  "supplier.stop_below": { value: 60, unit: "점 미만", label: "협력업체 거래 중단", clause: "7.1", max: 100 },
  "insurance.dunning_days": { value: 30, unit: "일 뒤", label: "보험 미수 독촉", clause: "12.3" },
  "calibration.interval_months": { value: 12, unit: "개월", label: "측정 장비 교정 주기", clause: "8.3" },
  "lube.alert_days_before": { value: 3, unit: "일 전", label: "윤활 기한 알림", clause: "8.4" },
  "pm.alert_days_before": { value: 7, unit: "일 전", label: "예방정비 알림", clause: "8.6" },
  "five_s.nc_threshold": { value: 80, unit: "점 미만", label: "3정5S 부적합 기준", clause: "8.11", max: 100 },
  "five_s.cleanup_minutes": { value: 15, unit: "분", label: "작업 종료 전 청소 시간", clause: "8.10" },
  "five_s.red_tag_days": { value: 30, unit: "일", label: "불요품(빨간 딱지) 보류", clause: "8.10" },
  "proposal.reply_days": { value: 14, unit: "일", label: "개선 제안 회신", clause: "8.12" },
  "asset.register_min": { value: 500_000, unit: "원 이상", label: "자산 비품 기준 금액", clause: "7.5" },
  "payroll.attendance_close_day": { value: 3, unit: "일(매월)", label: "근태 확정일", clause: "11.4", min: 1, max: 28 },
  "payroll.pay_day": { value: 10, unit: "일(매월)", label: "급여 지급일", clause: "11.5", min: 1, max: 28 },
  "wage.minimum_hourly": { value: 10_320, unit: "원(시간당)", label: "최저임금(시급)", clause: "11.5", min: 1 },
  "work.weekly_hours_warn": { value: 48, unit: "시간", label: "주간 근로시간 경고", clause: "11.4" },
  "hr.headcount_5plus": { value: 1, unit: "(1=5명 이상, 0=5명 미만)", label: "상시 근로자 5명 이상", clause: "11.4", min: 0, max: 1 },
  "leave.small_annual_days": { value: 15, unit: "일(5명 미만일 때)", label: "사내 연차 일수", clause: "11.4", min: 0, max: 25 },
  "competency.min_solo_level": { value: 2, unit: "단계", label: "단독 배정 최소 역량", clause: "11.2", min: 1, max: 4 },
  "auth.lock_attempts": { value: 5, unit: "회", label: "로그인 실패 잠금", clause: "설계 9.1", min: 3, max: 20 },
  "auth.lock_minutes": { value: 15, unit: "분", label: "잠금 시간", clause: "설계 9.1", min: 1 },
} satisfies Record<string, Def>;

export type PolicyKey = keyof typeof DEFAULT_POLICY;
export type Policy = Record<PolicyKey, number>;

export const POLICY_KEYS = Object.keys(DEFAULT_POLICY) as PolicyKey[];
export const isPolicyKey = (k: string): k is PolicyKey => k in DEFAULT_POLICY;

export function defaultPolicy(): Policy {
  return Object.fromEntries(POLICY_KEYS.map((k) => [k, DEFAULT_POLICY[k].value])) as Policy;
}

/** onDate 에 시행 중인 값 전체 */
export async function loadPolicy(db: Db, onDate = seoulDate()): Promise<Policy> {
  const rows = await db
    .select({ key: policySetting.key, value: policySetting.value })
    .from(policySetting)
    .where(lte(policySetting.effectiveFrom, onDate))
    .orderBy(policySetting.effectiveFrom, policySetting.createdAt);
  const p = defaultPolicy();
  for (const r of rows) if (isPolicyKey(r.key) && typeof r.value === "number") p[r.key] = r.value;
  return p;
}

export async function policyHistory(db: Db, key: PolicyKey) {
  return db
    .select({
      value: policySetting.value,
      effectiveFrom: policySetting.effectiveFrom,
      revisionRequestNo: policySetting.revisionRequestNo,
      reason: policySetting.reason,
      changedBy: appUser.name,
      createdAt: policySetting.createdAt,
    })
    .from(policySetting)
    .leftJoin(appUser, eq(appUser.id, policySetting.changedBy))
    .where(eq(policySetting.key, key))
    .orderBy(desc(policySetting.createdAt));
}

export class PolicyError extends UserError {}

export type PolicyChangeInput = {
  key: string;
  value: number;
  effectiveFrom: string;
  reason: string;
  revisionRequestNo?: string | null;
};

/** 정책값 변경. 권한(대표) 확인은 호출하는 쪽에서 한다 */
export async function changePolicy(db: Db, actorId: string, input: PolicyChangeInput, today = seoulDate()) {
  if (!isPolicyKey(input.key)) throw new PolicyError("알 수 없는 정책값");
  const def: Def = DEFAULT_POLICY[input.key];
  if (!Number.isInteger(input.value)) throw new PolicyError(`${def.label}: 정수로 입력해 주세요`);
  if (input.value < (def.min ?? 0)) throw new PolicyError(`${def.label}: ${def.min ?? 0} 이상이어야 합니다`);
  if (def.max != null && input.value > def.max) throw new PolicyError(`${def.label}: ${def.max} 이하여야 합니다`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.effectiveFrom) || input.effectiveFrom < today) {
    throw new PolicyError("시행일은 오늘 이후 날짜여야 합니다");
  }
  if (!input.reason.trim()) throw new PolicyError("변경 사유를 적어 주세요");
  const before = (await loadPolicy(db, input.effectiveFrom))[input.key];
  if (before === input.value) throw new PolicyError("현재 값과 같습니다");
  await db.transaction(async (tx) => {
    await tx.insert(policySetting).values({
      key: input.key,
      value: input.value,
      effectiveFrom: input.effectiveFrom,
      reason: input.reason.trim(),
      revisionRequestNo: input.revisionRequestNo?.trim() || null,
      changedBy: actorId,
    });
    await writeAudit(tx, {
      actorId,
      action: "policy.change",
      entityType: "policy",
      entityId: input.key,
      before: { value: before },
      after: { value: input.value, effectiveFrom: input.effectiveFrom, revisionRequestNo: input.revisionRequestNo ?? null },
    });
  });
}

/** 설정 화면용: 현재 값과 시행 예정인 변경 */
export async function policyOverview(db: Db, onDate = seoulDate()) {
  const current = await loadPolicy(db, onDate);
  const pending = await db
    .select({ key: policySetting.key, value: policySetting.value, effectiveFrom: policySetting.effectiveFrom })
    .from(policySetting)
    .where(gt(policySetting.effectiveFrom, onDate))
    .orderBy(policySetting.effectiveFrom);
  return POLICY_KEYS.map((key) => ({
    key,
    ...DEFAULT_POLICY[key],
    defaultValue: DEFAULT_POLICY[key].value,
    value: current[key],
    scheduled: pending.filter((p) => p.key === key && p.effectiveFrom > onDate),
  }));
}
