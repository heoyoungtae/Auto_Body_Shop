// 조항 번호 링크·줄 비교·표준서 첫 데이터(2026-11-19)
import { describe, expect, it } from "vitest";
import { FORM_SCREEN, lineDiff, linkifyStd, stdHref, stdKeyHref } from "@/modules/quality/std-ref";
import SEED from "@/modules/quality/std-seed.json";
import { SEED_DOCS } from "@/modules/quality/doc-seed";

const links = (t: string) => linkifyStd(t).filter((s) => s.href).map((s) => [s.text, s.href]);

describe("조항 번호 → 표준서 주소", () => {
  it("앱에 적힌 여러 꼴을 알아듣는다", () => {
    expect(stdHref("STD-02 5절 손상 진단")).toBe("/std/02#p-5");
    expect(stdHref("STD-01 4장 업무 절차")).toBe("/std/01#p-4");
    expect(stdHref("STD-11.2")).toBe("/std/11#o-11.2");
    expect(stdHref("STD-Q.5")).toBe("/std/Q#o-Q.5");
    expect(stdHref("STD-08.1")).toBe("/std/08#o-8.1");
    expect(stdHref("STD-12 12.4")).toBe("/std/12#o-12.4");
    expect(stdHref("총람 Q.6")).toBe("/std/Q#o-Q.6");
    expect(stdHref("사내 표준서 Q.5")).toBe("/std/Q#o-Q.5");
    expect(stdHref("부록 B")).toBe("/std/B");
    expect(stdHref("STD-08")).toBe("/std/08");
    expect(stdHref("F-03-01 · STD-03 4·7절")).toBe("/std/form/F-03-01");
    expect(stdHref("설계서 9.1 보안")).toBeNull();
  });
  it("한 줄에 여럿이면 모두 링크, 본문 괄호 번호도 링크", () => {
    expect(links("F-02-01 · STD-02")).toEqual([
      ["F-02-01", "/std/form/F-02-01"],
      ["STD-02", "/std/02"],
    ]);
    expect(links("외주로 처리(7.4)")).toEqual([["7.4", "/std/07#o-7.4"]]);
    expect(linkifyStd("외주로 처리(7.4)").map((s) => s.text).join("")).toBe("외주로 처리(7.4)");
  });
  it("절 키 → 주소", () => {
    expect(stdKeyHref("o:2.2")).toBe("/std/02#o-2.2");
    expect(stdKeyHref("p:STD-Q:7")).toBe("/std/Q#p-7");
    expect(stdKeyHref("f:F-05-01")).toBe("/std/form/F-05-01");
    expect(stdKeyHref("a:D")).toBe("/std/D");
  });
});

describe("표준서 첫 데이터", () => {
  const rows = SEED as { key: string; part: string; ch: string; no: string }[];
  it("총람 15장·절차서 15건·양식 49종·부록 4개, 키는 겹치지 않는다", () => {
    expect(new Set(rows.map((r) => r.key)).size).toBe(rows.length);
    expect(rows.filter((r) => r.part === "procedure" && /^p:STD-[^:]+$/.test(r.key))).toHaveLength(15);
    expect(rows.filter((r) => r.part === "appendix")).toHaveLength(4);
    expect(rows.filter((r) => r.part === "form" && r.key !== "f:intro").length).toBeGreaterThanOrEqual(45);
  });
  it("문서 목록의 양식은 모두 표준서 본문과 앱 화면이 있다", () => {
    for (const d of SEED_DOCS.filter((x) => x.kind === "form")) {
      expect(rows.some((r) => r.key === `f:${d.no}`), d.no).toBe(true);
      expect(FORM_SCREEN[d.no], d.no).toBeTruthy();
    }
  });
});

describe("줄 비교", () => {
  it("바뀐 줄만 빼고 넣는다", () => {
    expect(lineDiff("a\nb\nc", "a\nB\nc")).toEqual([
      { op: "same", text: "a" },
      { op: "del", text: "b" },
      { op: "add", text: "B" },
      { op: "same", text: "c" },
    ]);
  });
});
