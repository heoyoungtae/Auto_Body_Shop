import { describe, expect, it } from "vitest";
import { damageProgress } from "@/modules/repair/work-rules";

const t = new Date("2026-11-14T01:00:00Z");
const lines = [
  { id: "l1", damageId: "d1", approved: true },
  { id: "l2", damageId: "d1", approved: true },
  { id: "l3", damageId: "d2", approved: true },
  { id: "l4", damageId: "d3", approved: false },
];
const step = (seq: number, process: string, lineIds: string[], startedAt: Date | null = null, endedAt: Date | null = null) => ({ seq, process, lineIds, startedAt, endedAt });

describe("부위별 작업 진행", () => {
  it("승인 안 한 부위는 안 고침, 공정이 없거나 시작 전이면 작업 전", () => {
    const p = damageProgress(["d1", "d2", "d3", "d4"], lines, [step(1, "sheet", ["l1"]), step(2, "paint", ["l2", "l3"])]);
    expect(p.get("d3")!.state).toBe("skip");
    expect(p.get("d4")!.state).toBe("skip");
    expect(p.get("d1")).toEqual({ state: "wait", process: "sheet" });
    expect(p.get("d2")).toEqual({ state: "wait", process: "paint" });
  });
  it("하나라도 시작하면 작업 중(지금 공정), 모두 끝나야 끝", () => {
    let p = damageProgress(["d1", "d2"], lines, [step(1, "sheet", ["l1"], t, t), step(2, "paint", ["l2", "l3"], t)]);
    expect(p.get("d1")).toEqual({ state: "doing", process: "paint" });
    expect(p.get("d2")).toEqual({ state: "doing", process: "paint" });
    p = damageProgress(["d1", "d2"], lines, [step(1, "sheet", ["l1"], t, t), step(2, "paint", ["l2", "l3"])]);
    expect(p.get("d1")).toEqual({ state: "doing", process: "paint" });
    expect(p.get("d2")!.state).toBe("wait");
    p = damageProgress(["d1", "d2"], lines, [step(1, "sheet", ["l1"], t, t), step(2, "paint", ["l2", "l3"], t, t)]);
    expect(p.get("d1")!.state).toBe("done");
    expect(p.get("d2")!.state).toBe("done");
  });
});
