// 도움말 창이 열린 채 다른 화면으로 가면 그 화면의 도움말로 바뀐다(대표 요청 2026-11-20)
import { describe, expect, it } from "vitest";
import { ROUTE_HELP } from "@/modules/help/pages";
import { helpForPath } from "@/modules/help/route-help";

describe("주소로 화면 도움말 찾기", () => {
  it("고정 경로·[id] 경로·없는 경로", () => {
    expect(helpForPath("/settings/server")).toBe("settings.server");
    expect(helpForPath("/tasks/new")).toBe(ROUTE_HELP["/tasks/new"]);
    expect(helpForPath("/tasks/0b9c1d2e-aaaa")).toBe(ROUTE_HELP["/tasks/[id]"]);
    expect(helpForPath("/settings/punch/")).toBe("settings.punch");
    expect(helpForPath("/없는/화면")).toBeNull();
  });
  it("도움말이 있는 모든 고정 경로가 자기 도움말로 간다", () => {
    for (const [route, key] of Object.entries(ROUTE_HELP)) if (!route.includes("[")) expect(helpForPath(route), route).toBe(key);
  });
});
