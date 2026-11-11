// 사이드 메뉴 선택 표시: ?f= 조건이 붙은 메뉴도 제대로 골라진다(사용자 지적 2026-11-11 '보증 수리'를 눌렀는데 '만족도·불만'이 선택됨)
import { describe, expect, it } from "vitest";
import { MENU, TOP } from "@/app/_menu";
import { pickActive } from "@/app/_menu-active";

const HREFS = [...TOP, ...MENU.flatMap((g) => g.items)].map((i) => i.href).filter((h): h is string => !!h);
const pick = (url: string) => {
  const [p, q = ""] = url.split("?");
  return pickActive(HREFS, p, q);
};

describe("지금 화면의 메뉴", () => {
  it("보증 수리와 만족도·불만을 가른다", () => {
    expect(pick("/complaints?f=warranty")).toBe("/complaints?f=warranty");
    expect(pick("/complaints?f=warranty&ym=2026-11")).toBe("/complaints?f=warranty");
    expect(pick("/complaints")).toBe("/complaints");
    expect(pick("/complaints?f=open&ym=2026-11")).toBe("/complaints");
    expect(pick("/complaints/12")).toBe("/complaints");
  });
  it("검사·출고, 측정 장비 교정도 조건으로 가른다", () => {
    expect(pick("/repairs?f=qc")).toBe("/repairs?f=qc");
    expect(pick("/equipment?f=gauge")).toBe("/equipment?f=gauge");
    expect(pick("/equipment")).not.toBe("/equipment?f=gauge");
    expect(pick("/equipment/pm")).toBe("/equipment/pm");
  });
  it("조건이 붙은 메뉴 주소는 모두 자기 자신으로 골라진다", () => {
    for (const h of HREFS) expect(pick(h)).toBe(h);
  });
});
