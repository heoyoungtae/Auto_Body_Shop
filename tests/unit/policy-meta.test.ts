import { describe, expect, it } from "vitest";
import { POLICY_KEYS } from "@/modules/platform/policy";
import { keysOfGroup, LEGAL_BASIS, parseKoWon, pickValue, POLICY_GROUPS, policyGroup } from "@/modules/platform/policy-meta";
import { periodStart } from "@/modules/platform/policy-check";

describe("정책값 분류", () => {
  it("모든 정책값이 분류 하나에 들어가고, 분류마다 값이 있다", () => {
    const total = (Object.keys(POLICY_GROUPS) as (keyof typeof POLICY_GROUPS)[]).reduce((a, g) => a + keysOfGroup(g).length, 0);
    expect(total).toBe(POLICY_KEYS.length);
    for (const g of Object.keys(POLICY_GROUPS) as (keyof typeof POLICY_GROUPS)[]) expect(keysOfGroup(g).length, g).toBeGreaterThan(0);
    expect(policyGroup("money.entertain_base")).toBe("tax");
    expect(policyGroup("welfare.event_wedding")).toBe("payroll");
    expect(policyGroup("consult.reply_business_days")).toBe("work");
    for (const k of Object.keys(LEGAL_BASIS)) expect(POLICY_KEYS as string[]).toContain(k);
  });
  it("조문의 한글 금액을 읽는다", () => {
    expect(parseKoWon("20만원")).toBe(200_000);
    expect(parseKoWon("3천600만 원")).toBe(36_000_000);
    expect(parseKoWon("1,500만원")).toBe(15_000_000);
    expect(parseKoWon("1천500만원")).toBe(15_000_000);
    expect(parseKoWon("만원")).toBeNull();
    expect(pickValue("money.event_client_max", "…경조금의 경우 30만원)을 초과하는…")).toBe(300_000);
    expect(pickValue("money.entertain_base", "1천200만원(중소기업의 경우에는 4천800만원)에")).toBe(48_000_000);
    expect(pickValue("tax.meal_exempt", "월 25만원 이하의 식사대")).toBe(250_000);
    expect(pickValue("ins.health_rate", "아무 글")).toBeNull();
  });
  it("점검 주기는 반기", () => {
    expect(periodStart("2027-01-20")).toBe("2027-01-01");
    expect(periodStart("2027-07-02")).toBe("2027-07-01");
    expect(periodStart("2027-12-31")).toBe("2027-07-01");
  });
});
