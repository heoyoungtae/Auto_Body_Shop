import { describe, expect, it } from "vitest";
import { activeStep, initialState, transition, TransitionError, type Command, type DocState } from "@/modules/approval/machine";
import type { ResolvedStep } from "@/modules/approval/types";

const step = (seq: number, kind: ResolvedStep["kind"], candidates: string[]): ResolvedStep => ({ seq, kind, label: kind, candidates, mode: "any", status: "waiting", doneBy: [] });
const line = () => initialState([step(0, "draft", ["adv"]), step(1, "review", ["qa"]), step(2, "approve", ["owner"])]);

function run(state: DocState, ...cmds: Command[]) {
  const events: string[] = [];
  for (const cmd of cmds) {
    const r = transition(state, cmd);
    state = r.state;
    events.push(...r.events.map((e) => e.type));
  }
  return { state, events };
}

describe("결재 상태 머신", () => {
  it("상신 → 검토 → 승인으로 확정된다", () => {
    const { state, events } = run(line(), { type: "submit", actorId: "adv" }, { type: "approve", actorId: "qa" }, { type: "approve", actorId: "owner" });
    expect(state.status).toBe("confirmed");
    expect(events).toContain("confirmed");
  });

  it("담당자가 아니면 처리할 수 없다", () => {
    const { state } = run(line(), { type: "submit", actorId: "adv" });
    expect(() => transition(state, { type: "approve", actorId: "owner" })).toThrow(TransitionError);
  });

  it("반려되면 기안자가 다시 올리고 처음 단계부터 진행한다", () => {
    const { state } = run(line(), { type: "submit", actorId: "adv" }, { type: "reject", actorId: "qa" });
    expect(state.status).toBe("rejected");
    const again = run(state, { type: "resubmit", actorId: "adv" });
    expect(again.state.revision).toBe(2);
    expect(activeStep(again.state)?.kind).toBe("review");
  });

  it("확정된 문서는 취소로만 바뀐다", () => {
    const { state } = run(line(), { type: "submit", actorId: "adv" }, { type: "approve", actorId: "qa" }, { type: "approve", actorId: "owner" });
    expect(() => transition(state, { type: "discard", actorId: "adv" })).toThrow(TransitionError);
    expect(transition(state, { type: "cancel" }).state.status).toBe("cancelled");
  });

  it("확인 단계가 있으면 확정 뒤 확인완료가 된다", () => {
    const s = initialState([step(0, "draft", ["adv"]), step(1, "approve", ["owner"]), step(2, "confirm", ["acc"])]);
    const { state } = run(s, { type: "submit", actorId: "adv" }, { type: "approve", actorId: "owner" }, { type: "confirm", actorId: "acc" });
    expect(state.status).toBe("checked");
  });
});
