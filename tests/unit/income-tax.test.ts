import { describe, expect, it } from "vitest";
import {
  bracketOf,
  simpleIncomeTax,
  type TaxTablePolicy,
} from "@/modules/staff/income-tax";

const pol: TaxTablePolicy = {
  pensionRate: 4500,
  pensionCap: 5_900_000,
  pensionFloor: 370_000,
  childOne: 12_500,
  childTwo: 29_160,
  childMore: 25_000,
};
const tax = (monthly: number, family: number, children = 0, rate = 100) =>
  simpleIncomeTax({ monthly, family, children, rate }, pol).amount;

describe("근로소득 간이세액표 계산", () => {
  it("구간: 150만 원 미만 5천, 300만 원 미만 1만, 그 위 2만 원 단위", () => {
    expect(bracketOf(1_234_567)).toEqual([1_230_000, 1_235_000]);
    expect(bracketOf(2_004_000)).toEqual([2_000_000, 2_010_000]);
    expect(bracketOf(4_015_000)).toEqual([4_000_000, 4_020_000]);
  });

  it("국세청 표 값과 같은 칸(소득세법 시행령 별표 2)", () => {
    expect(tax(2_004_000, 2)).toBe(14_750);
    expect(tax(2_004_000, 3)).toBe(6_600);
    expect(tax(2_004_000, 4)).toBe(3_220);
    expect(tax(2_500_000, 3)).toBe(16_530);
    expect(tax(2_500_000, 4)).toBe(13_150);
    expect(tax(4_000_000, 1)).toBe(195_960);
    expect(tax(4_000_000, 2)).toBe(167_950);
    expect(tax(4_000_000, 3)).toBe(109_590);
  });

  it("106만 원 미만은 0, 가족이 많을수록 적게", () => {
    expect(tax(1_050_000, 1)).toBe(0);
    expect(tax(3_000_000, 1)).toBeGreaterThan(tax(3_000_000, 2));
    expect(tax(3_000_000, 2)).toBeGreaterThan(tax(3_000_000, 4));
  });

  it("자녀 공제, 80·120% 비율, 10원 미만 버림", () => {
    const base = tax(4_000_000, 3);
    expect(tax(4_000_000, 3, 1)).toBe(base - 12_500);
    expect(tax(4_000_000, 3, 2)).toBe(base - 29_160);
    expect(tax(4_000_000, 4, 3)).toBe(tax(4_000_000, 4) - 29_160 - 25_000);
    expect(tax(4_000_000, 1, 0, 80)).toBe(Math.floor((195_960 * 0.8) / 10) * 10);
    expect(tax(4_000_000, 1, 0, 120)).toBe(Math.floor((195_960 * 1.2) / 10) * 10);
    expect(tax(4_000_000, 1) % 10).toBe(0);
  });

  it("1,000만 원 넘는 월급여는 표 하단 식", () => {
    const at10 = tax(10_000_000, 1);
    expect(tax(12_000_000, 1)).toBe(
      Math.floor((at10 + 2_000_000 * 0.98 * 0.35 + 25_000) / 10) * 10,
    );
    expect(tax(20_000_000, 1)).toBeGreaterThan(tax(12_000_000, 1));
  });
});
