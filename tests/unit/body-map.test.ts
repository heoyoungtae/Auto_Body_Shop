import { describe, expect, it } from "vitest";
import { BODY_PARTS, cellAt, cellLabel, cellsLabel, fromLegacy, isPart, parseCells, partName, shapeOf, SUB_PARTS, VIEW_DEFS, viewsOf } from "@/modules/repair/body-map";
import { cleanMarks, damageSeverity } from "@/modules/repair/rules";
import { partGroup } from "@/modules/repair/labor";

describe("차량 전개도", () => {
  it("모든 부위가 그림 어딘가에 있고, 그림의 부위는 모두 부위 목록에 있다", () => {
    for (const p of BODY_PARTS) expect(viewsOf(p.id).length, p.id).toBeGreaterThan(0);
    for (const v of VIEW_DEFS) for (const s of v.shapes) expect(isPart(s.part), `${v.view} ${s.part}`).toBe(true);
  });

  it("한 면에 같은 부위가 두 번 나오지 않고, 칸 사각형은 면 안에 있다", () => {
    for (const v of VIEW_DEFS) {
      const ids = v.shapes.map((s) => s.part);
      expect(new Set(ids).size, v.view).toBe(ids.length);
      for (const s of v.shapes) {
        const [x, y, w, h] = s.box;
        expect(x >= 0 && y >= 0 && w > 0 && h > 0 && x + w <= v.w && y + h <= v.h, `${v.view} ${s.part}`).toBe(true);
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
