import { describe, expect, it } from "vitest";
import { parseLawSearch } from "@/modules/money/law-watch";
import {
  corpTax,
  entityCompare,
  formFromBizNo,
  recommendRelief,
  regionOf,
  shiftDue,
  smeReliefRate,
  startupReliefRate,
  taxDeadlines,
} from "@/modules/money/tax-rules";

describe("사업 형태·지역·감면", () => {
  it("사업자등록번호 가운데 두 자리로 개인·법인", () => {
    expect(formFromBizNo("123-81-12345")).toBe("corporate");
    expect(formFromBizNo("123-86-12345")).toBe("corporate");
    expect(formFromBizNo("123-45-67890")).toBe("individual");
    expect(formFromBizNo("12-3")).toBeNull();
  });

  it("주소로 과밀억제권역 짐작(인천은 법정동에 따라 갈림)", () => {
    expect(regionOf("서울특별시 강서구 공항대로 1")).toMatchObject({ region: "overcrowded", sure: true });
    expect(regionOf("인천광역시 부평구 부평대로 1")).toMatchObject({ region: "overcrowded", sure: true });
    expect(regionOf("인천광역시 서구 원당대로 1 (당하동)")).toMatchObject({ region: "capital", sure: true });
    expect(regionOf("인천광역시 서구 봉수대로 1")).toMatchObject({ region: "overcrowded", sure: false });
    expect(regionOf("인천광역시 연수구 송도동 1")).toMatchObject({ region: "capital", sure: true });
    expect(regionOf("인천광역시 남동구 남동대로 1")).toMatchObject({ sure: false });
    expect(regionOf("인천광역시 강화군 강화읍 1")).toMatchObject({ region: "depop" });
    expect(regionOf("경기도 수원시 팔달구 1")).toMatchObject({ region: "overcrowded" });
    expect(regionOf("경기도 화성시 봉담읍 1")).toMatchObject({ region: "capital" });
    expect(regionOf("충청남도 천안시 1")).toMatchObject({ region: "outside" });
  });

  it("2026~2027 창업감면율과 특별세액감면 중 큰 쪽", () => {
    expect(startupReliefRate("overcrowded", false)).toBe(0);
    expect(startupReliefRate("overcrowded", true)).toBe(50);
    expect(startupReliefRate("capital", false)).toBe(25);
    expect(startupReliefRate("depop", true)).toBe(100);
    expect(smeReliefRate("overcrowded")).toBe(20);
    expect(smeReliefRate("outside")).toBe(30);
    expect(recommendRelief("overcrowded", false, "2027-03-02", "2027-03-10")).toMatchObject({ kind: "sme", rate: 20 });
    expect(recommendRelief("capital", false, "2027-03-02", "2027-03-10")).toMatchObject({ kind: "startup", rate: 25, startupLeft: 5 });
    expect(recommendRelief("capital", false, "2027-03-02", "2032-03-10")).toMatchObject({ kind: "sme" });
  });
});

describe("신고·납부 일정", () => {
  it("토·일·공휴일이면 다음 날", () => {
    expect(shiftDue("2027-01-10", () => false)).toBe("2027-01-11"); // 일요일 → 월요일
    expect(shiftDue("2027-03-01", (d) => d === "2027-03-01")).toBe("2027-03-02");
  });

  it("개인: 부가세 1·4·7·10월, 종합소득세 5월(성실 6월), 중간예납 11월, 원천세 매달·반기", () => {
    const ind = taxDeadlines(2027, { form: "individual", fiscalStartMonth: 1, withholding: true, halfYear: false, diligent: false });
    expect(ind.filter((d) => d.key.startsWith("wh-2027-"))).toHaveLength(12);
    expect(ind.find((d) => d.key === "inc-2027")!.due).toBe("2027-05-31");
    expect(ind.find((d) => d.key === "inc-mid-2027")!.due).toBe("2027-11-30");
    const half = taxDeadlines(2027, { form: "individual", fiscalStartMonth: 1, withholding: true, halfYear: true, diligent: true });
    expect(half.filter((d) => d.key.startsWith("wh-2027-")).map((d) => d.due)).toEqual(["2027-01-10", "2027-07-10"]);
    expect(half.find((d) => d.key === "inc-2027")!.due).toBe("2027-06-30");
  });

  it("법인: 사업연도에 맞춘 법인세·중간예납", () => {
    const c1 = taxDeadlines(2027, { form: "corporate", fiscalStartMonth: 1, withholding: false, halfYear: false, diligent: false });
    expect(c1.find((d) => d.key === "corp-2027")!.due).toBe("2027-03-31");
    expect(c1.find((d) => d.key === "corp-mid-2027")!.due).toBe("2027-08-31");
    expect(c1.filter((d) => d.key.startsWith("vat-"))).toHaveLength(4);
    expect(c1.some((d) => d.key.startsWith("wh-"))).toBe(false);
    const c4 = taxDeadlines(2027, { form: "corporate", fiscalStartMonth: 4, withholding: false, halfYear: false, diligent: false });
    expect(c4.find((d) => d.key === "corp-2027")!.due).toBe("2027-06-30");
    expect(c4.find((d) => d.key === "corp-mid-2027")!.due).toBe("2027-11-30");
  });
});

describe("개인 vs 법인 어림", () => {
  const pol = { pensionRate: 9500, pensionCap: 6_370_000, healthRate: 7190, ltcRatio: 13140 };
  it("법인세율 구간", () => {
    expect(corpTax(100_000_000)).toBe(10_000_000);
    expect(corpTax(300_000_000)).toBe(20_000_000 + 20_000_000);
  });
  it("이익이 크면 법인 쪽 세금이 적고, 작으면 개인과 큰 차이 없음", () => {
    const big = entityCompare({ profit: 300_000_000, ceoSalary: 80_000_000, reliefRate: 0, ...pol });
    expect(big.corporate.total).toBeLessThan(big.individual.total);
    expect(big.corporate.retained).toBeGreaterThan(0);
    const none = entityCompare({ profit: 0, ceoSalary: 0, reliefRate: 0, ...pol });
    expect(none.individual.total).toBe(0);
    expect(none.corporate.total).toBe(0);
    // 감면 100%면 소득세·법인세가 0(보험료는 남음)
    const free = entityCompare({ profit: 100_000_000, ceoSalary: 0, reliefRate: 100, ...pol });
    expect(free.individual.incomeTax).toBe(0);
    expect(free.corporate.corpTax).toBe(0);
    // 대표 연봉은 이익을 넘지 않는다
    expect(entityCompare({ profit: 10_000_000, ceoSalary: 50_000_000, reliefRate: 0, ...pol }).salary).toBe(10_000_000);
  });
});

describe("법령 검색 응답", () => {
  it("이름이 꼭 맞는 것 중 가장 최근 공포일", () => {
    const body = {
      LawSearch: {
        law: [
          { 법령명한글: "소득세법 시행령", 공포일자: "20250228", 시행일자: "20250228" },
          { 법령명한글: "소득세법", 공포일자: "20241231", 시행일자: "20250101" },
          { 법령명한글: "소득세법", 공포일자: "20251223", 시행일자: "20260101" },
        ],
      },
    };
    expect(parseLawSearch(body, "소득세법")).toEqual({ promulgated: "2025-12-23", effective: "2026-01-01" });
    expect(parseLawSearch({ LawSearch: { law: { 법령명한글: "법인세법", 공포일자: "20251223", 시행일자: "20260101" } } }, "법인세법")?.effective).toBe("2026-01-01");
    expect(parseLawSearch({ error: 1 }, "소득세법")).toBeNull();
    expect(parseLawSearch(body, "법인세법")).toBeNull();
  });
});
