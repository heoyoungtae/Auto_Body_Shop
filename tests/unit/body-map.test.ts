import { describe, expect, it } from "vitest";
import { BODY_PARTS, BODY_TYPES, bodyGuess, bodyOf, carOf, partsOf, viewDefsOf, type BodyType, cellAt, cellLabel, cellsLabel, fromLegacy, isPart, parseCells, partName, shapeOf, SUB_PARTS, VIEW_DEFS, viewsOf } from "@/modules/repair/body-map";
import { cleanMarks, damageSeverity } from "@/modules/repair/rules";
import { partGroup } from "@/modules/repair/labor";

describe("차량 전개도", () => {
  it("모든 부위가 그림 어딘가에 있고, 그림의 부위는 모두 부위 목록에 있다", () => {
    for (const p of BODY_PARTS) expect(viewsOf(p.id).length, p.id).toBeGreaterThan(0);
    for (const v of VIEW_DEFS) for (const s of v.shapes) expect(isPart(s.part), `${v.view} ${s.part}`).toBe(true);
  });

  it("한 면에 같은 부위가 두 번 나오지 않고, 칸 사각형은 면 안에 있다(모든 차형)", () => {
    for (const v of (Object.keys(BODY_TYPES) as BodyType[]).flatMap((b) => viewDefsOf(b))) {
      const ids = v.shapes.map((s) => s.part);
      expect(new Set(ids).size, v.view).toBe(ids.length);
      for (const s of v.shapes) {
        const [x, y, w, h] = s.box;
        // 미러(실루엣 밖)는 조금 나와도 된다
        const out = s.clip === false ? 8 : 0;
        expect(x >= -out && y >= 0 && w > 0 && h > 0 && x + w <= v.w && y + h <= v.h, `${v.view} ${s.part}`).toBe(true);
        expect(isPart(s.part), `${v.view} ${s.part}`).toBe(true);
      }
    }
  });

  it("좌우 부위는 제 쪽 옆모습이 대표 면이다", () => {
    expect(viewsOf("l_f_door")[0]).toBe("left");
    expect(viewsOf("r_quarter")[0]).toBe("right");
    expect(viewsOf("r_bumper")[0]).toBe("top");
    expect(viewsOf("r_headlamp")).toEqual(["front"]);
  });

  it("3×3 칸: 누른 자리 → 칸, 칸 이름은 면마다", () => {
    const box = shapeOf("left", "l_f_door")!.box;
    expect(cellAt(box, box[0] + 1, box[1] + box[3] - 1)).toBe(6);
    expect(cellAt(box, box[0] + box[2] - 1, box[1] + 1)).toBe(2);
    expect(cellLabel("left", 8)).toBe("아래 뒤");
    expect(cellLabel("top", 0)).toBe("오른쪽 앞");
    expect(cellLabel("front", 4)).toBe("정가운데");
    expect(cellLabel("rear", 3)).toBe("가운데 차 왼쪽");
    expect(cellsLabel("left", [])).toBe("전체");
    expect(cellsLabel("left", [6, 7])).toBe("아래 앞·아래 가운데");
    expect(parseCells("8, 7,x,9,7")).toEqual([7, 8]);
  });

  it("예전 도면 좌표를 새 부위·면·칸으로 옮긴다", () => {
    expect(fromLegacy(100, 20)).toEqual({ part: "f_bumper", view: "top", cell: 4 });
    expect(fromLegacy(30, 112)).toEqual({ part: "l_f_door", view: "left", cell: 3 });
    expect(fromLegacy(1, 1)).toBeNull();
    expect(cleanMarks([{ x: 160, y: 300, kind: "D" }, { part: "grille", view: "front", cell: 2, kind: "C" }, { part: "grille", view: "left", cell: 2, kind: "C" }])).toEqual([
      { part: "r_quarter", view: "right", cell: 4, kind: "D" },
      { part: "grille", view: "front", cell: 2, kind: "C" },
      { part: "grille", view: "front", cell: 4, kind: "C" },
    ]);
  });

  it("세부 부위·공임 묶음·정도", () => {
    for (const p of BODY_PARTS) expect(SUB_PARTS[p.id]?.length, p.id).toBeGreaterThan(0);
    expect(partName("l_f_door", "도어 몰딩")).toBe("왼쪽 앞도어(도어 몰딩)");
    expect(partName("l_f_door", "")).toBe("왼쪽 앞도어");
    expect(partGroup("l_sill")).toBe("sill");
    expect(partGroup("r_taillamp")).toBe("lamp");
    expect(partGroup("grille")).toBe("grille");
    expect(damageSeverity({ sizeCm: 5, paintLayer: "clear" })).toBe(1);
    expect(damageSeverity({ sizeCm: 12, paintLayer: "clear" })).toBe(2);
    expect(damageSeverity({ sizeCm: 5, paintLayer: "metal" })).toBe(3);
  });
});

describe("차형", () => {
  it("차종 이름으로 짐작하고, 고른 것이 먼저, 모르면 세단", () => {
    expect(bodyGuess("싼타페")).toBe("suv");
    expect(bodyGuess("더 뉴 포터 II")).toBe("truck");
    expect(bodyGuess("카니발")).toBe("van");
    expect(bodyGuess("i30")).toBe("hatch");
    expect(bodyGuess("아이오닉 5")).toBe("suv");
    expect(bodyGuess("아반떼")).toBeNull();
    expect(bodyOf({ model: "아반떼" })).toBe("sedan");
    expect(bodyOf({ model: "싼타페", bodyType: "van" })).toBe("van");
    expect(bodyOf({ model: "싼타페", bodyType: "zzz" })).toBe("suv");
    expect(carOf({ model: "투싼", options: ["bsd", "roof_rack", "sunroof"] })).toEqual({ body: "suv", attach: ["roof_rack", "sunroof"] });
  });

  it("화물차는 적재함 부위가 있고 트렁크·뒷도어가 없다. 차형을 안 주면 어느 차형이든 받는다(저장 값 검사)", () => {
    const truck = partsOf("truck").map((p) => p.id);
    expect(truck).toEqual(expect.arrayContaining(["l_bed", "r_bed", "bed_gate", "bed_floor", "l_f_door"]));
    expect(truck).not.toContain("trunk");
    expect(truck).not.toContain("l_r_door");
    expect(partsOf("sedan").map((p) => p.id)).not.toContain("l_bed");
    // 세단·SUV 등은 적재함 말고 모든 부위
    for (const b of ["sedan", "hatch", "suv", "van"] as BodyType[]) expect(partsOf(b).length, b).toBe(BODY_PARTS.length - 4);
    expect(viewsOf("l_bed", "truck")[0]).toBe("left");
    expect(viewsOf("trunk", "suv")).toContain("left");
    expect(viewsOf("trunk", "sedan")).not.toContain("left");
    expect(viewsOf("trunk")).toContain("left");
    expect(shapeOf("left", "l_bed")).not.toBeNull();
    expect(shapeOf("left", "l_bed", "sedan")).toBeNull();
    expect(partGroup("l_bed")).toBe("quarter");
    expect(partGroup("bed_gate")).toBe("trunk");
  });
});

