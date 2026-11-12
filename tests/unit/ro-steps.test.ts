import { describe, expect, it } from "vitest";
import { roSteps } from "@/modules/repair/steps";

const now = (s: ReturnType<typeof roSteps>) => s.find((x) => x.state === "now")?.key;

describe("수리 건 진행 단계", () => {
  it("상태에 맞는 단계가 '지금'이고 앞은 끝남", () => {
    const s = roSteps("working", false, false);
    expect(now(s)).toBe("work");
    expect(s.filter((x) => x.state === "done").map((x) => x.key)).toEqual(["consult", "intake", "diag", "estimate"]);
  });
  it("보험 건만 청구 단계가 있고, 출고 뒤 입금 전이면 청구가 지금", () => {
    expect(roSteps("ready", false, false).some((x) => x.key === "claim")).toBe(false);
    expect(now(roSteps("delivered", true, false))).toBe("claim");
    expect(roSteps("delivered", true, true).every((x) => x.state === "done")).toBe(true);
    expect(roSteps("delivered", false, false).every((x) => x.state === "done")).toBe(true);
  });
});
