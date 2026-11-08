// 전자결재 공통 타입 — 앱 설계서 8.1
import type { Role } from "../auth/roles";
import type { DelegationTask } from "../platform/delegation";

/** 단계 5종: 기안·검토·승인·확인·외부서명 */
export type StepKind = "draft" | "review" | "approve" | "confirm" | "external_sign";

export type StepTemplate = {
  kind: StepKind;
  label: string;
  /** 담당 역할. "drafter" 는 기안자 본인 */
  assignees?: (Role | "drafter")[];
  /** 전결표(부록 B)로 역할을 정한다. amountField 는 data 안의 금액(또는 비율) 칸 */
  delegation?: { task: DelegationTask; amountField?: string };
  /** all: 담당자 모두, any: 한 명(기본) */
  mode?: "all" | "any";
};

export type DocumentStatus = "draft" | "in_progress" | "rejected" | "confirmed" | "checked" | "cancelled" | "discarded";
export type DocumentFlag = "proxy_approved" | "owner_self_approval" | "escalated";
export type StepStatus = "waiting" | "active" | "done" | "rejected" | "skipped";

export type ResolvedStep = {
  seq: number;
  kind: StepKind;
  label: string;
  candidates: string[];
  mode: "all" | "any";
  status: StepStatus;
  doneBy: string[];
};
