// 결재 문서 상태 머신 — 앱 설계서 8.1. 순수 함수: DB와 무관하게 상태와 이벤트만 계산한다.
// 상태: 임시저장 → 결재중 → (반려 | 확정) → 확인완료, 확정 뒤에는 취소됨으로만.

import type { DocumentFlag, DocumentStatus, ResolvedStep, StepKind } from "./types";

export type DocState = {
  status: DocumentStatus;
  steps: ResolvedStep[];
  flags: DocumentFlag[];
  /** 반려 후 재상신할 때마다 1씩 늘어난다 */
  revision: number;
};

export type Command =
  | { type: "submit"; actorId: string | null }
  | { type: "withdraw"; actorId: string }
  | { type: "resubmit"; actorId: string }
  | { type: "discard"; actorId: string }
  | { type: "approve" | "reject" | "sign" | "refuse" | "confirm"; actorId: string; onBehalfOf?: string }
  | { type: "cancel" };

export type MachineEvent =
  | { type: "submitted" }
  | { type: "step_activated"; seq: number; kind: StepKind; candidates: string[] }
  | { type: "confirmed" }
  | { type: "rejected"; seq: number }
  | { type: "checked" }
  | { type: "withdrawn" }
  | { type: "discarded" }
  | { type: "cancelled" };

export class TransitionError extends Error {}

const MAIN: StepKind[] = ["draft", "review", "approve", "external_sign"];
const isMain = (s: ResolvedStep) => MAIN.includes(s.kind);
const finished = (s: ResolvedStep) => s.status === "done" || s.status === "skipped";

export function initialState(steps: ResolvedStep[], flags: DocumentFlag[] = []): DocState {
  return { status: "draft", steps: steps.map((s) => ({ ...s, status: "waiting", doneBy: [] })), flags, revision: 1 };
}

export function transition(prev: DocState, cmd: Command): { state: DocState; events: MachineEvent[] } {
  const state: DocState = structuredClone(prev);
  const events: MachineEvent[] = [];

  switch (cmd.type) {
    case "submit": {
      expect(state, ["draft"]);
      submit(state, cmd.actorId, events);
      break;
    }
    case "resubmit": {
      expect(state, ["rejected"]);
      mustBeDrafter(state, cmd.actorId);
      state.revision += 1;
      for (const s of state.steps) Object.assign(s, { status: "waiting", doneBy: [] });
      submit(state, cmd.actorId, events);
      break;
    }
    case "withdraw": {
      expect(state, ["in_progress"]);
      mustBeDrafter(state, cmd.actorId);
      if (state.steps.some((s) => s.kind !== "draft" && s.doneBy.length > 0)) {
        throw new TransitionError("이미 결재가 시작된 문서는 회수할 수 없음");
      }
      for (const s of state.steps) Object.assign(s, { status: "waiting", doneBy: [] });
      state.status = "draft";
      events.push({ type: "withdrawn" });
      break;
    }
    case "discard": {
      expect(state, ["draft", "rejected"]);
      mustBeDrafter(state, cmd.actorId);
      state.status = "discarded";
      events.push({ type: "discarded" });
      break;
    }
    case "approve":
    case "sign":
    case "reject":
    case "refuse":
    case "confirm": {
      const step = activeStep(state);
      if (!step) throw new TransitionError("처리할 단계가 없음");
      const allowed: Record<typeof cmd.type, StepKind[]> = {
        approve: ["review", "approve"],
        reject: ["review", "approve"],
        sign: ["external_sign"],
        refuse: ["external_sign"],
        confirm: ["confirm"],
      };
      if (!allowed[cmd.type].includes(step.kind)) {
        throw new TransitionError(`${step.label} 단계에서 할 수 없는 처리: ${cmd.type}`);
      }
      const who = cmd.onBehalfOf ?? cmd.actorId;
      if (!step.candidates.includes(who)) throw new TransitionError("이 단계의 담당자가 아님");
      if (step.doneBy.includes(who)) throw new TransitionError("이미 처리함");
      if (cmd.onBehalfOf && !state.flags.includes("proxy_approved")) state.flags.push("proxy_approved");

      if (cmd.type === "reject" || cmd.type === "refuse") {
        step.status = "rejected";
        state.status = "rejected";
        events.push({ type: "rejected", seq: step.seq });
        break;
      }
      step.doneBy.push(who);
      if (step.mode === "any" || step.candidates.every((c) => step.doneBy.includes(c))) {
        step.status = "done";
        advance(state, events);
      }
      break;
    }
    case "cancel": {
      expect(state, ["confirmed", "checked"]);
      state.status = "cancelled";
      events.push({ type: "cancelled" });
      break;
    }
  }
  return { state, events };
}

/** 지금 처리할 단계. 확정 전에는 주 단계, 확정 뒤에는 확인 단계. */
export function activeStep(state: DocState): ResolvedStep | undefined {
  return state.steps.find((s) => s.status === "active");
}

function submit(state: DocState, actorId: string | null, events: MachineEvent[]) {
  const draft = state.steps[0];
  if (draft.candidates.length > 0 && (actorId === null || !draft.candidates.includes(actorId))) {
    throw new TransitionError("기안자만 상신할 수 있음");
  }
  if (draft.candidates.length === 0 && actorId !== null) throw new TransitionError("시스템 작성 문서");
  draft.status = "done";
  if (actorId) draft.doneBy = [actorId];
  state.status = "in_progress";
  events.push({ type: "submitted" });
  advance(state, events);
}

function advance(state: DocState, events: MachineEvent[]) {
  const nextMain = state.steps.find((s) => isMain(s) && !finished(s));
  if (nextMain) {
    activate(nextMain, events);
    return;
  }
  if (state.status === "in_progress") {
    state.status = "confirmed";
    events.push({ type: "confirmed" });
  }
  const nextConfirm = state.steps.find((s) => s.kind === "confirm" && !finished(s));
  if (nextConfirm) {
    activate(nextConfirm, events);
    return;
  }
  if (state.status === "confirmed" && state.steps.some((s) => s.kind === "confirm")) {
    state.status = "checked";
    events.push({ type: "checked" });
  }
}

function activate(step: ResolvedStep, events: MachineEvent[]) {
  step.status = "active";
  events.push({ type: "step_activated", seq: step.seq, kind: step.kind, candidates: step.candidates });
}

function expect(state: DocState, statuses: DocumentStatus[]) {
  if (!statuses.includes(state.status)) {
    throw new TransitionError(`현재 상태(${state.status})에서 할 수 없음`);
  }
}

function mustBeDrafter(state: DocState, actorId: string) {
  if (!state.steps[0].candidates.includes(actorId)) throw new TransitionError("기안자만 할 수 있음");
}
