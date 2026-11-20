// TV 현황판 상태 나누기·지연·순서(대표 결정 2026-11-18)
import { describe, expect, it } from "vitest";
import { classifyRo, dayWord, lateDays, sortBoard, stageOfProcess, tbStageOf, TV_STATES, type TvRoInput } from "@/modules/dashboard/tv-rules";

const base: TvRoInput = { status: "working", diagnosed: true, readyNoticed: false, estimate: "accepted", claim: null, hasWorkOrder: true, steps: [], partsPending: [], outsource: [], inspectRound: 0 };
const step = (process: string, started: boolean, ended: boolean, assignee: string | null = "김기술") => ({ process, label: process, started, ended, assignee });

describe("TV 상태 나누기", () => {
  it("입고·견적 단계", () => {
    expect(classifyRo({ ...base, status: "intake" })).toMatchObject({ state: "in", sub: "입고 점검 중" });
    expect(classifyRo({ ...base, status: "checked", diagnosed: false })).toMatchObject({ state: "in", sub: "진단 대기" });
    expect(classifyRo({ ...base, status: "estimating", estimate: "draft" })).toMatchObject({ state: "est", sub: "견적 작성 중" });
    expect(classifyRo({ ...base, status: "estimating", estimate: "sent" })).toMatchObject({ state: "est", sub: "고객 승인 대기" });
    expect(classifyRo({ ...base, status: "estimating", estimate: "sent", claim: "requested" })).toMatchObject({ state: "est", sub: "보험사 손해사정 중" });
  });

  it("작업: 지금 공정이 있으면 작업 중, 없고 부품이 안 왔으면 부품 대기, 아니면 작업 대기", () => {
    const steps = [step("탈부착", true, true), step("도장", true, false), step("광택", false, false)];
    expect(classifyRo({ ...base, steps })).toMatchObject({ state: "work", sub: "도장 · 김기술 · 2/3", done: 1, total: 3, current: 1 });
    const idle = [step("탈부착", true, true), step("도장", false, false)];
    expect(classifyRo({ ...base, steps: idle, partsPending: [{ dueOn: "2026-11-20" }, { dueOn: null }] })).toMatchObject({ state: "hold", sub: "부품 미입고 · 11/20 입고 예정" });
    expect(classifyRo({ ...base, steps: idle })).toMatchObject({ state: "wait", sub: "다음: 도장 · 김기술" });
    expect(classifyRo({ ...base, hasWorkOrder: false })).toMatchObject({ state: "wait", sub: "작업 지시서 만들기 전" });
    // 공정이 돌고 있으면 부품이 남아 있어도 작업 중
    expect(classifyRo({ ...base, steps, partsPending: [{ dueOn: null }] }).state).toBe("work");
  });

  it("외주가 나가 있으면 외주 대기, 검사·재작업·출고 대기", () => {
    expect(classifyRo({ ...base, outsource: ["out"] })).toMatchObject({ state: "hold", sub: "외주 작업 중(차 반출)" });
    expect(classifyRo({ ...base, status: "inspecting", inspectRound: 2 })).toMatchObject({ state: "qc", sub: "최종 검사 2회차" });
    const rework = classifyRo({ ...base, status: "inspecting", steps: [step("탈부착", true, true), step("rework", true, false)] });
    expect(rework).toMatchObject({ state: "work", rework: true });
    expect(classifyRo({ ...base, status: "ready", readyNoticed: true })).toMatchObject({ state: "ready", sub: "고객 연락함" });
  });

  it("색은 모두 다르고, 지연은 상태가 아니다", () => {
    const colors = Object.entries(TV_STATES).filter(([k]) => k !== "plan").map(([, v]) => v.color.toLowerCase());
    expect(new Set(colors).size).toBe(colors.length);
    expect(Object.keys(TV_STATES)).not.toContain("late");
  });
});

describe("날짜·순서", () => {
  it("오늘·내일·모레, 그 뒤는 날짜와 요일", () => {
    expect(dayWord("2026-11-18", "2026-11-18")).toBe("오늘");
    expect(dayWord("2026-11-19", "2026-11-18")).toBe("내일");
    expect(dayWord("2026-11-20", "2026-11-18")).toBe("모레");
    expect(dayWord("2026-11-23", "2026-11-18")).toBe("11/23 (월)");
  });
  it("지연 일수와 순서: 지연 많은 순 → 약속 빠른 순 → 미정", () => {
    expect(lateDays("2026-11-16", "2026-11-18")).toBe(2);
    expect(lateDays("2026-11-18", "2026-11-18")).toBe(0);
    expect(lateDays(null, "2026-11-18")).toBe(0);
    const rows = [
      { id: "a", late: 0, due: null, inAt: "1" },
      { id: "b", late: 0, due: "2026-11-19", inAt: "1" },
      { id: "c", late: 2, due: "2026-11-16", inAt: "1" },
      { id: "d", late: 0, due: "2026-11-18", inAt: "1" },
    ];
    expect(sortBoard(rows).map((r) => r.id)).toEqual(["c", "d", "b", "a"]);
  });
});

describe("테크베이 현황판 공정 단계", () => {
  const st = (process: string, started = false, ended = false) => ({ process, started, ended });
  it("공정 → 단계", () => {
    expect(stageOfProcess("sheet")).toBe("body");
    expect(stageOfProcess("detach")).toBe("body");
    expect(stageOfProcess("dent")).toBe("body");
    expect(stageOfProcess("polish")).toBe("paint");
    expect(stageOfProcess("mask")).toBe("paint");
    expect(stageOfProcess("dry")).toBe("paint");
    expect(stageOfProcess("rework")).toBe("assemble");
  });
  it("차의 지금 단계: 하는 공정, 없으면 다음 공정에서 대기", () => {
    expect(tbStageOf("in", [])).toEqual({ stage: "intake", doing: false });
    expect(tbStageOf("est", [])).toEqual({ stage: "est", doing: false });
    expect(tbStageOf("work", [st("detach", true, true), st("paint", true)])).toEqual({ stage: "paint", doing: true });
    expect(tbStageOf("hold", [st("detach", true, true), st("putty")])).toEqual({ stage: "paint", doing: false });
    expect(tbStageOf("wait", [st("detach", true, true)])).toEqual({ stage: "assemble", doing: false });
    expect(tbStageOf("qc", [st("detach", true, true)])).toEqual({ stage: "assemble", doing: true });
    expect(tbStageOf("ready", [])).toEqual({ stage: "ready", doing: false });
  });
});
