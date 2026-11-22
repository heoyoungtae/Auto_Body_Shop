// 작업장 자동 채우기(대표 지시 2026-11-19: 매번 고르지 않게)
import { describe, expect, it } from "vitest";
import { candidatesFor, chooseWorkplace, fillWorkplaces, suggestZoneWorkplace, type WpPick } from "@/modules/platform/branch";

const W = (id: string, kind: WpPick["kind"], bays = 1, sortOrder = 0, name = id): WpPick => ({ id, kind, bays, sortOrder, name });

describe("작업장 고르기", () => {
  it("공정 종류에 맞는 작업장, 없으면 다음 종류, 외주는 없음", () => {
    const wps = [W("panel", "panel", 3), W("booth", "paint")];
    expect(chooseWorkplace("paint", wps, new Map())).toBe("booth");
    expect(chooseWorkplace("polish", wps, new Map())).toBe("panel"); // 도장 마무리(연마)는 판금 자리 먼저
    expect(chooseWorkplace("outsource", wps, new Map())).toBeNull();
    expect(chooseWorkplace("paint", [], new Map())).toBeNull();
  });

  it("같은 종류가 여럿이면 앞 공정과 같은 곳, 아니면 자리당 덜 붐비는 곳", () => {
    const wps = [W("b1", "paint", 1, 10), W("b2", "paint", 1, 20)];
    expect(chooseWorkplace("paint", wps, new Map([["b1", 1]]))).toBe("b2");
    expect(chooseWorkplace("dry", wps, new Map([["b2", 1]]), "b2")).toBe("b2"); // 도장한 부스에서 건조
    expect(chooseWorkplace("paint", wps, new Map())).toBe("b1"); // 같으면 순서
    expect(candidatesFor("paint", wps).map((w) => w.id)).toEqual(["b1", "b2"]);
  });

  it("공정 여러 개는 앞 공정 작업장을 이어받는다", () => {
    const wps = [W("p", "panel", 2), W("b1", "paint", 1, 1), W("b2", "paint", 1, 2), W("w", "wash")];
    const out = fillWorkplaces([{ process: "sheet" }, { process: "paint" }, { process: "dry" }, { process: "polish" }, { process: "outsource" }], { wps, inUse: new Map([["b1", 1]]) });
    expect(out.map((s) => s.workplaceId)).toEqual(["p", "b2", "b2", "p", null]);
  });

  it("3정5S 구역에 맞는 작업장 추천", () => {
    const wps = [W("x", "paint", 1, 0, "도장 부스"), W("y", "panel", 2, 0, "판금동"), W("z", "storage", 0, 0, "부품 창고")];
    expect(suggestZoneWorkplace("C", "도장 부스", wps)).toBe("x");
    expect(suggestZoneWorkplace("A", "판금", wps)).toBe("y");
    expect(suggestZoneWorkplace("E", "자재 창고", wps)).toBe("z");
    expect(suggestZoneWorkplace("G", "사무실·대기실", wps)).toBeNull();
  });
});
