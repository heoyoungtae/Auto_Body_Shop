// 은행·카드사·홈택스 엑셀/CSV 읽기: xlsx·옛 xls(BIFF8, 큰 것·작은 것)·HTML 표·EUC-KR CSV
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { mapSheet } from "@/modules/bank/sheet-map";
import { readSheet } from "@/modules/bank/sheet-read";

const f = (n: string) => new Uint8Array(readFileSync(`tests/fixtures/bank/${n}`));
const load = (n: string, kind: Parameters<typeof mapSheet>[1] = "auto", shopBizNo?: string) => mapSheet(readSheet(f(n), n), kind, { shopBizNo });

describe("엑셀·CSV 읽기", () => {
  it("국민은행 xlsx(제목 줄 위, 입금·출금 칸 따로)", () => {
    const r = load("kb-bank.xlsx");
    expect(r.kind).toBe("bank");
    expect(r.rows).toHaveLength(3);
    expect(r.rows[0]).toMatchObject({ kind: "out", on: "2026-11-10", at: "09:12", amountWon: 330000, balanceWon: 1670000, party: "한빛도료" });
    expect(r.rows[1]).toMatchObject({ kind: "in", amountWon: 1320000, party: "삼성화재해" });
    expect(r.headDigits).toContain("4567");
  });
  it("옛 xls 큰 파일(문자열 표가 여러 조각) 300줄, 엑셀 날짜 칸", () => {
    const r = load("ibk-big.xls");
    expect(r.kind).toBe("bank");
    expect(r.rows).toHaveLength(300);
    expect(r.rows[0]).toMatchObject({ kind: "out", on: "2026-10-01", at: "09:00", amountWon: 10000 });
    expect(r.rows[299].party).toBe("거래처상호가 꽤 긴 이름 299 주식회사");
    expect(r.rows[1]).toMatchObject({ kind: "in", amountWon: 20001 });
  });
  it("옛 xls 작은 파일(카드, 취소 줄)", () => {
    const r = load("card-small.xls");
    expect(r.kind).toBe("card");
    expect(r.rows.map((x) => x.kind)).toEqual(["card", "card_cancel"]);
    expect(r.rows[0]).toMatchObject({ approvalNo: "30012345", amountWon: 45000, party: "오토파츠몰" });
  });
  it("EUC-KR CSV(카드사)", () => {
    const r = load("shinhan-card.csv");
    expect(r.kind).toBe("card");
    expect(r.rows[0]).toMatchObject({ on: "2026-11-12", at: "14:23", amountWon: 45000, party: "GS칼텍스주유소", approvalNo: "12345678", digits: "1234" });
  });
  it("HTML 표를 xls 이름으로 준 파일(구분 칸으로 입출금)", () => {
    const r = load("hana-bank.xls");
    expect(r.rows).toEqual([
      expect.objectContaining({ kind: "in", amountWon: 500000, party: "김철수", balanceWon: 1500000 }),
      expect.objectContaining({ kind: "out", amountWon: 1100000, party: "임대료 & 관리비" }),
    ]);
  });
  it("홈택스 세금계산서: 우리 사업자번호로 매출·매입을 가름", () => {
    const r = load("hometax-tax.xlsx", "auto", "220-81-62517");
    expect(r.kind).toBe("tax");
    expect(r.rows[0]).toMatchObject({ kind: "tax_buy", party: "한빛도료", partyBizNo: "1234567890", supplyWon: 300000, vatWon: 30000, amountWon: 330000, approvalNo: "20261110-41000000-12345678" });
    expect(r.rows[1]).toMatchObject({ kind: "tax_sale", party: "김고객상사", amountWon: 550000 });
  });
  it("사업자번호가 없으면 세금계산서 줄을 건너뛰고 이유를 알려 줌", () => {
    const r = load("hometax-tax.xlsx");
    expect(r.rows).toHaveLength(0);
    expect(r.skipped[0].why).toContain("사업자번호");
  });
});
