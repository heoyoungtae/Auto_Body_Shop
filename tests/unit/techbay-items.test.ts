import { describe, expect, it } from "vitest";
import { applyWords, checkCount, checkText, methodIn, parseLine, parseOrderItems, resolveCheck, wordFrom, zonesOfCheck } from "@/modules/partner/techbay-items";

const p = (s: string) => parseLine(1, "외판", s);

describe("테크베이 작업 항목 풀이", () => {
  it("한 줄의 여러 부위를 나누고 좌우를 쉼표 뒤로 잇는다", () => {
    const r = p("좌측 앞도어, 뒷도어 판금 도색");
    expect(r.items.map((i) => i.part)).toEqual(["l_f_door", "l_r_door"]);
    expect(r.method).toBe("partial");
    expect(r.status).toBe("ok");
    expect(p("좌측 앞휀다 및 우측 뒷도어 교환").items.map((i) => i.part)).toEqual(["l_f_fender", "r_r_door"]);
  });
  it("방법과 손상 종류", () => {
    expect(methodIn("앞범퍼 교환 후 도색")).toBe("replace");
    expect(methodIn("본넷 판금")).toBe("partial");
    expect(methodIn("운전석 문 덴트")).toBe("pdr");
    expect(methodIn("전체 광택")).toBe("polish");
    expect(p("앞범퍼 도색").items).toEqual([{ part: "f_bumper", kind: "S" }]);
    expect(p("본넷 판금 도색").items).toEqual([{ part: "hood", kind: "D" }]);
    expect(p("조수석 헤드램프 교환").items).toEqual([{ part: "r_headlamp", kind: "C" }]);
    expect(p("뒷범퍼 부식 도장").items).toEqual([{ part: "r_bumper", kind: "R" }]);
  });
  it("좌우·앞뒤를 모르면 확인 필요, 부위가 없으면 못 알아봄", () => {
    const a = p("휀다 판금");
    expect(a.status).toBe("check");
    expect(a.ask.side).toBe(true);
    const b = p("범퍼 도색");
    expect(b.status).toBe("check");
    expect(b.ask.fr).toBe(true);
    const c = p("실내 크리닝");
    expect(c.status).toBe("none");
    expect(c.items).toEqual([]);
  });
  it("덴트·광택은 우리가 하지 않는 작업이라 확인 필요", () => {
    const r = p("운전석 문 덴트");
    expect(r.items.map((i) => i.part)).toEqual(["l_f_door"]);
    expect(r.status).toBe("check");
    expect(r.issues[0]).toMatch(/하지 않는 작업/);
  });
  it("확인: 모든 줄을 정리해야 끝난다", () => {
    const items = [
      { type: "외판", content: "앞범퍼 도색" },
      { type: "외판", content: "운전석 문 덴트" },
      { type: "외판", content: "휀다 판금" },
      { type: "기타", content: "실내 크리닝" },
    ];
    expect(parseOrderItems(items).map((l) => l.status)).toEqual(["ok", "check", "check", "none"]);
    let r = resolveCheck(items, {});
    expect(r.open.map((o) => o.no)).toEqual([2, 3, 4]);
    r = resolveCheck(items, { 2: { asPartial: true }, 3: { read: "왼쪽 앞휀다 판금" }, 4: { skip: true } });
    expect(r.open).toEqual([]);
    expect(r.lines[1]).toMatchObject({ method: "partial", items: [{ part: "l_f_door", kind: "D" }] });
    expect(checkCount(r.lines)).toEqual({ total: 4, damage: 3, other: 1 });
    expect(checkText(r.lines).split("\n")).toEqual(["① 앞범퍼 긁힘 (판금·도장)", "② 왼쪽 앞도어 찌그러짐 (판금·도장)", "③ 왼쪽 앞펜더 찌그러짐 (판금·도장)"]);
    expect(zonesOfCheck(r.lines, "sedan").map((z) => z.part)).toEqual(["f_bumper", "l_f_door", "l_f_fender"]);
  });
  it("낱말 사전으로 다음부터 알아듣는다", () => {
    const w = wordFrom("운전석쪽 휀다 판금", [{ part: "l_f_fender", kind: "D" }]);
    expect(w).toEqual({ word: "운전석쪽 휀다", means: "왼쪽 앞펜더" });
    expect(wordFrom("가니쉬 교체", [{ part: "l_f_door", kind: "D" }])).toEqual({ word: "가니쉬", means: "왼쪽 앞도어" });
    expect(applyWords("가니쉬 교체", [{ word: "가니쉬", means: "왼쪽 앞도어" }]).used).toEqual(["가니쉬"]);
    const r = parseLine(1, "외판", "가니쉬 교체", { words: [{ word: "가니쉬", means: "왼쪽 앞도어" }] });
    expect(r).toMatchObject({ status: "ok", method: "replace", learned: ["가니쉬"] });
  });
});
