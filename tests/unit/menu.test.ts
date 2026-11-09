// 메뉴 숨김: 권한 없는 메뉴는 보이지 않는다(사용자 지시 2026-11-09)
import { describe, expect, it } from "vitest";
import { MENU, type MenuItem } from "@/app/_menu";
import { can } from "@/modules/auth/permissions";
import type { Role } from "@/modules/auth/roles";

const shown = (roles: Role[]) =>
  MENU.flatMap((g) => g.items)
    .filter((i: MenuItem) => i.href && (!i.roles || i.roles.some((r) => roles.includes(r))) && (!i.perm || i.perm.some((k) => can({ roles }, k))))
    .map((i) => i.label);

describe("메뉴 권한", () => {
  it("기술자에게는 설정·보험 청구·상담이 안 보이고, 작업·설비 점검은 보인다", () => {
    const t = shown(["technician"]);
    expect(t).toEqual(expect.arrayContaining(["작업·공정", "설비 대장", "3정5S 점검", "부적합·시정 조치", "취업규칙"]));
    for (const x of ["정책값", "보험 청구", "상담·예약", "직원 명부·역량표", "측정 장비 교정"]) expect(t).not.toContain(x);
  });
  it("대표는 화면이 있는 메뉴를 모두 본다", () => {
    expect(shown(["owner"]).length).toBe(MENU.flatMap((g) => g.items).filter((i) => i.href).length);
  });
});
