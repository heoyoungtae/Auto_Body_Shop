// 메뉴 찾기(사이드 메뉴 맨 위 검색칸) 규칙 — 사용자 확정 2026-11-11
import { describe, expect, it } from "vitest";
import { ALL_ENTRIES, MENU_ALIAS, SUB_ENTRIES, chosung, findIn, normalize, qwertyToHangul, searchMenu } from "@/app/_menu-search";

const first = (q: string) => searchMenu(q)[0]?.label;
const labels = (q: string) => searchMenu(q).map((h) => h.label);

describe("낱자 다루기", () => {
  it("초성을 뽑는다", () => {
    expect(chosung("견적·고객 승인")).toBe("ㄱㅈ·ㄱㄱ ㅅㅇ");
  });
  it("영문 자판으로 친 것을 한글로 바꾼다", () => {
    expect(qwertyToHangul("ruswjr")).toBe("견적");
    expect(qwertyToHangul("dlqrh")).toBe("입고");
    expect(qwertyToHangul("rmqdu")).toBe("급여");
    expect(qwertyToHangul("dnjsfl")).toBe("원리"); // 겹모음
    expect(qwertyToHangul("dlfrdj")).toBe("읽어"); // 겹받침이 나뉘어 넘어감
    expect(qwertyToHangul("견적")).toBeNull();
  });
  it("치는 중인 마지막 글자도 맞춘다", () => {
    expect(findIn(normalize("견적·고객 승인"), "견저")).toBe(0);
    expect(findIn(normalize("견적·고객 승인"), "견저고")).toBe(-1); // 가운데 글자는 완성된 것만
  });
});

describe("메뉴 찾기", () => {
  it("이름 일부로 찾는다", () => {
    expect(first("견적")).toBe("견적·고객 승인");
    expect(first("일지")).toBe("업무일지");
    expect(first("고객승인")).toBe("견적·고객 승인"); // 띄어쓰기 무시
  });
  it("초성으로 찾는다", () => {
    expect(labels("ㄱㅈ").slice(0, 2)).toEqual(["결재", "견적·고객 승인"]); // 점수가 같으면 메뉴 순서대로
    expect(first("ㅇㅁㅇㅈ")).toBe("업무일지");
    expect(first("견ㅈ")).toBe("견적·고객 승인");
  });
  it("한/영을 깜빡하고 쳐도 찾는다", () => {
    expect(first("ruswjr")).toBe("견적·고객 승인");
    expect(first("dlfwl")).toBe("업무일지");
  });
  it("별칭으로 찾고, 어떤 말로 맞았는지 알려 준다", () => {
    const h = searchMenu("도색")[0];
    expect(h.label).toBe("작업·공정");
    expect(h.via).toBe("도색");
    expect(first("월급")).toBe("급여대장");
    expect(first("입고")).toBe("접수·입고");
  });
  it("표준서 번호와 묶음 이름으로 찾는다", () => {
    expect(labels("STD-08")).toEqual(expect.arrayContaining(["설비 대장", "일상 점검", "윤활", "예방정비"]));
    expect(labels("std08.2")).toContain("일상 점검");
    expect(labels("수리 업무")).toEqual(expect.arrayContaining(["상담·예약", "접수·입고", "보험 청구"]));
  });
  it("이름으로 맞은 것이 별칭으로 맞은 것보다 앞에 온다", () => {
    const l = labels("입고");
    expect(l.indexOf("접수·입고")).toBeLessThan(l.indexOf("재고") === -1 ? 99 : l.indexOf("재고"));
    expect(l.slice(0, 2)).toEqual(expect.arrayContaining(["접수·입고", "발주·입고"]));
  });
  it("낱말을 띄어 여러 개 치면 모두 맞는 것만", () => {
    expect(labels("발송 이력")).toEqual(["발송 이력"]);
    expect(labels("문자 이력")[0]).toBe("발송 이력"); // '문자'는 별칭, 기프티콘 이력은 묶음 이름(문자관리)으로 맞아 뒤에
  });
  it("이름에서 맞은 글자 자리를 알려 준다", () => {
    const h = searchMenu("고객")[0];
    expect(h.label).toBe("고객·차량");
    expect(h.label.slice(h.mark!.start, h.mark!.end)).toBe("고객");
    const g = searchMenu("고객승인").find((x) => x.label === "견적·고객 승인")!;
    expect(g.label.slice(g.mark!.start, g.mark!.end)).toBe("고객 승인");
  });
  it("없는 말은 아무것도 안 나온다", () => {
    expect(searchMenu("쀍쀍")).toEqual([]);
    expect(searchMenu("   ")).toEqual([]);
  });
  it("모든 메뉴에 별칭이 있고, 별칭 목록에 없는 메뉴 이름은 없다", () => {
    const names = new Set(ALL_ENTRIES.map((e) => e.label));
    expect(names.size).toBe(ALL_ENTRIES.length); // 이름이 겹치면 별칭이 엉킨다
    for (const n of names) expect(MENU_ALIAS[n]?.length, `${n} 의 별칭이 없습니다`).toBeGreaterThan(0);
    for (const n of Object.keys(MENU_ALIAS)) expect(names.has(n), `${n} 는 메뉴에 없습니다`).toBe(true);
  });
});

describe("메뉴 안 화면 찾기(사용자 지적 2026-11-11 '품목·품목등록이 안 걸러진다')", () => {
  it("품목·품목등록으로 재고 품목 등록 화면과 재고 메뉴가 나온다", () => {
    for (const q of ["품목", "품목등록", "품목 등록", "ㅍㅁㄷㄹ", "vnaahr"]) {
      const l = labels(q);
      expect(l, q).toContain("재고 품목 등록");
      expect(l, q).toContain("재고");
    }
    const h = searchMenu("품목등록")[0];
    expect(h.label).toBe("재고 품목 등록");
    expect(h.href).toBe("/stock/new");
    expect(h.parent).toBe("재고");
    expect(h.perm).toEqual(expect.arrayContaining(["stock.use", "stock.manage"])); // 권한은 재고 메뉴를 따른다
  });
  it("메뉴 이름과 똑같이 맞으면 메뉴가 안 화면보다 앞", () => {
    expect(labels("재고")[0]).toBe("재고");
  });
  it("표준서 번호·묶음 이름으로는 안 화면까지 늘어놓지 않는다", () => {
    expect(searchMenu("STD-08").every((h) => !h.parent)).toBe(true);
  });
  it("메뉴 밖 화면(로그인)과 번호 들어간 화면은 없다", () => {
    expect(SUB_ENTRIES.some((e) => e.href === "/login" || e.href!.includes("["))).toBe(false);
  });
});
