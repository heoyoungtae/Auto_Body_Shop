// 서버 설명서(deploy/minipc/README.md)를 도움말 센터에서 본다(대표 요청 2026-11-20)
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { GuideMd } from "@/app/help/server-guide/_md";
import { slug, splitGuide } from "@/modules/help/server-guide";

const md = readFileSync("deploy/minipc/README.md", "utf8");

describe("서버 설명서", () => {
  it("단계별로 나누고, 설명서 안의 #고리가 모두 실제 단계로 간다", () => {
    const g = splitGuide(md);
    expect(g.title).toMatch(/미니 PC/);
    expect(g.parts.length).toBeGreaterThanOrEqual(10);
    expect(slug("10단계. 원격 관리 켜기(서버가 자택에 있을 때)")).toBe("10단계-원격-관리-켜기서버가-자택에-있을-때");
    const ids = new Set(g.parts.map((p) => p.id));
    for (const m of md.matchAll(/\]\(#([^)]+)\)/g)) expect(ids.has(m[1]), `고리 #${m[1]}`).toBe(true);
  });
  it("모든 단계가 깨지지 않고 그려지며 명령 묶음이 그대로 나온다", () => {
    const g = splitGuide(md);
    const html = [g.intro, ...g.parts.map((p) => p.body)].map((b) => renderToStaticMarkup(createElement(GuideMd, { md: b }))).join("");
    expect(html).toContain("deploy/minipc/remote.sh");
    expect(html).toContain("<table");
    expect(html).not.toMatch(/```|\*\*/);
  });
});
