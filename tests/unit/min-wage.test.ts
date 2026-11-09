// 다음 해 최저임금 자동 반영: 최저임금위원회 결정현황 글 읽기
import { describe, expect, it } from "vitest";
import { parseMinWage } from "@/modules/staff/min-wage";

const PAGE = `<table><thead><tr><th>적용연도</th><th>시간급</th><th>일급<br>(8시간 기준)</th></tr></thead><tbody>
<tr><td>&#39;27.01.01~&#39;27.12.31</td><td>10,700</td><td>85,600</td><td>2,236,300</td><td>3.7<br>(380)</td><td>26.07.14</td><td>26.08.05</td></tr>
<tr><td>'26.01.01~'26.12.31</td><td>10,320</td><td>82,560</td><td>2,156,880</td><td>2.9<br>(290)</td><td>25.07.10</td><td>25.08.05</td></tr>
</tbody></table>`;

describe("최저임금 결정현황 읽기", () => {
  it("다음 해 시간급과 고시일", () => {
    expect(parseMinWage(PAGE, 2027)).toEqual({ hourly: 10700, noticedOn: "2026-08-05" });
    expect(parseMinWage(PAGE, 2026)).toEqual({ hourly: 10320, noticedOn: "2025-08-05" });
  });
  it("없는 해는 null, 의결만 있고 고시 전이면 고시일 없음", () => {
    expect(parseMinWage(PAGE, 2028)).toBeNull();
    const voted = `<tr><td>'28.01.01~'28.12.31</td><td>11,000</td><td>88,000</td><td>2,299,000</td><td>2.8 (300)</td><td>27.07.10</td><td></td></tr>`;
    expect(parseMinWage(voted, 2028)).toEqual({ hourly: 11000, noticedOn: null });
  });
});
