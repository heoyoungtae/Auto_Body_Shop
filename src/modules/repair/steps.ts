// 수리 건 진행 단계(UI 개선 4, 2026-11-12). 수리 건 화면 맨 위 막대에 쓴다.
// 상담 → 입고 점검 → 진단 → 견적·승인 → 작업 → 검사 → 출고 → (보험 건만) 청구
import type { RO_STATUS_LABEL } from "./rules";

export type RoStatus = keyof typeof RO_STATUS_LABEL;
export type StepState = "done" | "now" | "todo";
export type RoStep = { key: string; label: string; state: StepState };

const ORDER: { key: string; label: string; at: RoStatus[] }[] = [
  { key: "consult", label: "상담", at: [] },
  { key: "intake", label: "입고 점검", at: ["intake"] },
  { key: "diag", label: "진단", at: ["checked"] },
  { key: "estimate", label: "견적·승인", at: ["estimating"] },
  { key: "work", label: "작업", at: ["working"] },
  { key: "inspect", label: "검사", at: ["inspecting"] },
  { key: "delivery", label: "출고", at: ["ready"] },
];

/** insured: 보험 건(자비가 아님). claimPaid: 보험사 입금 확인됨 */
export function roSteps(status: RoStatus, insured: boolean, claimPaid: boolean): RoStep[] {
  const steps = [...ORDER, ...(insured ? [{ key: "claim", label: "보험 청구", at: [] as RoStatus[] }] : [])];
  if (status === "cancelled") return steps.map((s) => ({ key: s.key, label: s.label, state: "todo" }));
  let now = steps.findIndex((s) => s.at.includes(status));
  if (status === "delivered") now = insured && !claimPaid ? steps.length - 1 : steps.length;
  return steps.map((s, i) => ({ key: s.key, label: s.label, state: i < now ? "done" : i === now ? "now" : "todo" }));
}
