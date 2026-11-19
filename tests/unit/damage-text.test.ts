import { describe, expect, it } from "vitest";
import { kindFit } from "@/modules/repair/body-map";
import { parseDamageText, partsIn, renumberText, textFromZones, type Zone, zoneNumbers, zonesFromText, zonesText } from "@/modules/repair/damage-text";

const parts = (s: string) => partsIn(s).parts;

describe("손상 부위 글 → 부위", () => {
  it("흔한 말", () => {
    expect(parts("앞 범퍼")).toEqual(["f_bumper"]);
    expect(parts("본넷")).toEqual(["hood"]);
    expect(parts("운전석 문")).toEqual(["l_f_door"]);
    expect(parts("조수석 뒤휀다")).toEqual(["r_quarter"]);
    expect(parts("좌측 앞도어 뒷도어")).toEqual(["l_f_door", "l_r_door"]);
    expect(parts("백도어")).toEqual(["trunk"]);
    expect(parts("적재함 뒷문")).toEqual(["bed_gate"]);
    expect(parts("오른쪽 적재함 옆판")).toEqual(["r_bed"]);
  });
  it("모르는 것은 까닭을 남긴다", () => {
    expect(partsIn("도어").issues[0]).toMatch(/앞·뒤/);
    expect(partsIn("앞펜더").issues[0]).toMatch(/왼쪽·오른쪽/);
    expect(parseDamageText("범퍼 아래쪽 이상한 소리")[0].issues.length).toBeGreaterThan(0);
    expect(parseDamageText("엔진 소리")[0]).toMatchObject({ items: [], issues: ["부위 이름을 찾지 못했습니다"] });
  });
  it("우리가 만든 문장은 모든 부위가 되돌아 읽힌다", () => {
    const zs: Zone[] = [
      { part: "l_f_door", view: "left", cell: 6, kind: "D" },
      { part: "l_f_door", view: "left", cell: 8, kind: "D" },
      { part: "r_quarter", view: "right", cell: 4, kind: "S" },
      { part: "l_quarter", view: "left", cell: 0, kind: "S" },
      { part: "windshield", view: "top", cell: 4, kind: "C" },
      { part: "r_f_wheel", view: "right", cell: 4, kind: "W" },
      { part: "trunk", view: "top", cell: 4, kind: "R" },
      { part: "f_bumper", view: "front", cell: 2, kind: "S" },
    ];
    const t = zonesText(zs);
    expect(zonesFromText(t, [], "sedan", "D")).toEqual(zs);
    // 지금 찍힌 것과 같으면 그대로
    expect(zonesFromText(t, zs, "sedan", "D")).toEqual(zs);
  });
});

describe("글 ↔ 그림", () => {
  const door: Zone = { part: "l_f_door", view: "left", cell: 7, kind: "D" };
  it("글에 부위를 적으면 대표 면 가운데에 찍고, 지우면 그림에서도 지운다", () => {
    expect(zonesFromText("후드 긁힘", [], "sedan", "D")).toEqual([{ part: "hood", view: "top", cell: 4, kind: "S" }]);
    expect(zonesFromText("후드", [], "sedan", "C")).toEqual([{ part: "hood", view: "top", cell: 4, kind: "C" }]);
    expect(zonesFromText("왼쪽 앞도어 찌그러짐", [door], "sedan", "S")).toEqual([door]);
    expect(zonesFromText("", [door], "sedan", "D")).toEqual([]);
    expect(zonesFromText("문 안쪽 소리", [door], "sedan", "D")).toEqual([]);
  });
  it("차형에 없는 부위는 찍지 않는다", () => {
    expect(zonesFromText("적재함 바닥 부식", [], "sedan", "D")).toEqual([]);
    expect(zonesFromText("적재함 바닥 부식", [], "truck", "D")).toHaveLength(1);
  });
  it("그림을 바꾸면 바뀐 부위의 글만 고친다", () => {
    const hood: Zone = { part: "hood", view: "top", cell: 4, kind: "S" };
    const text = "본넷 기스, 엔진 소리 남";
    // 새로 찍으면 끝에 붙고 직접 적은 글은 그대로
    expect(textFromZones(text, [hood], [hood, door], "sedan")).toBe("본넷 기스\n엔진 소리 남\n왼쪽 앞도어(아래 가운데) 찌그러짐");
    // 찍은 것을 지우면 그 조각만 빠진다
    expect(textFromZones(text, [hood], [], "sedan")).toBe("엔진 소리 남");
    // 빈 글
    expect(textFromZones("", [], [door], "sedan")).toBe("왼쪽 앞도어(아래 가운데) 찌그러짐");
  });
});

describe("손상 기호와 부위", () => {
  it("휠 긁힘은 바퀴에만, 바퀴의 긁힘은 휠 긁힘", () => {
    expect(kindFit("hood", "W")).toBeNull();
    expect(kindFit("l_f_wheel", "W")).toBe("W");
    expect(kindFit("l_f_wheel", "S")).toBe("W");
  });
  it("유리·램프에는 찌그러짐·부식이 없다", () => {
    expect(kindFit("windshield", "D")).toBeNull();
    expect(kindFit("l_headlamp", "R")).toBeNull();
    expect(kindFit("l_headlamp", "C")).toBe("C");
    expect(kindFit("hood", "O")).toBe("O");
  });
  it("글의 휠 긁힘을 차체에 적으면 기호를 쓰지 않는다", () => {
    expect(zonesFromText("후드 휠 긁힘", [], "sedan", "D")).toEqual([{ part: "hood", view: "top", cell: 4, kind: "D" }]);
  });
});

describe("번호 ①②", () => {
  it("부위를 알아본 줄에만 글 순서대로 번호를 붙이고, 지우면 다시 매긴다", () => {
    expect(renumberText("본넷 기스, 엔진 소리 남\n③ 운전석 앞도어 찌그러짐")).toBe("① 본넷 기스\n엔진 소리 남\n② 운전석 앞도어 찌그러짐");
    expect(renumberText("엔진 소리 남\n② 운전석 앞도어 찌그러짐")).toBe("엔진 소리 남\n① 운전석 앞도어 찌그러짐");
  });
  it("그림 표시에 짝이 되는 줄 번호", () => {
    const zs: Zone[] = [
      { part: "l_f_door", view: "left", cell: 4, kind: "D" },
      { part: "hood", view: "top", cell: 4, kind: "S" },
      { part: "hood", view: "top", cell: 5, kind: "S" },
      { part: "roof", view: "top", cell: 4, kind: "S" },
    ];
    expect(zoneNumbers("① 본넷 기스\n엔진 소리\n② 운전석 앞도어", zs)).toEqual([2, 1, 1, 0]);
  });
  it("번호가 붙은 글도 그림으로 되돌아 읽힌다", () => {
    expect(zonesFromText("① 후드 긁힘\n② 지붕 찌그러짐", [], "sedan", "D").map((z) => z.part)).toEqual(["hood", "roof"]);
  });
});
