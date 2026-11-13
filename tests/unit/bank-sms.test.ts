// 은행·카드 알림 문자 읽기: 은행·카드사마다 다른 꼴
import { describe, expect, it } from "vitest";
import { parseBankSms } from "@/modules/bank/sms-parse";

const R = "2026-11-13";
const cases: [string, Partial<{ kind: string; company: string; digits: string; on: string; at: string; amountWon: number; balanceWon: number; party: string }>][] = [
  ["[Web발신]\n신한 11/13 14:23\n110-***-123456\n입금 500,000\n잔액 1,234,567\n홍길동", { kind: "in", company: "shinhan", digits: "3456", on: "2026-11-13", at: "14:23", amountWon: 500000, balanceWon: 1234567, party: "홍길동" }],
  ["[KB]11/13 14:23\n123456**789\n삼성화재해\n입금\n1,320,000\n잔액5,234,567", { kind: "in", company: "kb", amountWon: 1320000, balanceWon: 5234567, party: "삼성화재해", at: "14:23" }],
  ["[기업] 11/12 09:05 출금 300,000원 한빛도료 잔액1,234,567 123-******-01-011", { kind: "out", company: "ibk", on: "2026-11-12", amountWon: 300000, balanceWon: 1234567, party: "한빛도료", digits: "1011" }],
  ["농협 출금55,000원 11/13 10:11 351-****-1234-53 SKT통신요금 잔액1,179,567원", { kind: "out", company: "nh", amountWon: 55000, balanceWon: 1179567, party: "SKT통신요금", digits: "3453" }],
  ["[우리] 11/13 14:23 1002***123456 입금 500,000원 김철수 잔액 1,234,567원", { kind: "in", company: "woori", amountWon: 500000, party: "김철수", balanceWon: 1234567 }],
  ["하나,11/13,14:23 123-******-12345 입금500,000원 홍길동 잔액1,734,567원", { kind: "in", company: "hana", amountWon: 500000, balanceWon: 1734567, party: "홍길동", on: "2026-11-13", at: "14:23" }],
  ["[Web발신]\n신한카드(1234)승인 홍*동 45,000원(일시불)11/13 14:23 GS칼텍스주유소 누적1,234,567원", { kind: "card", company: "shinhan_card", digits: "1234", amountWon: 45000, party: "GS칼텍스주유소" }],
  ["삼성1234승인 홍*동\n45,000원 일시불\n11/13 14:23 오토파츠몰\n누적1,234,567원", { kind: "card", company: "samsung_card", digits: "1234", amountWon: 45000, party: "오토파츠몰" }],
  ["KB국민카드1234승인\n홍*동\n128,000원 일시불\n11/13 14:23\n(주)대한도료\n누적1,234,567원", { kind: "card", company: "kb_card", digits: "1234", amountWon: 128000, party: "주)대한도료" }],
  ["현대카드 ZERO 승인\n홍*동\n45,000원 일시불\n11/13 14:23\n쿠팡\n누적1,234,567원", { kind: "card", company: "hyundai_card", amountWon: 45000 }],
  ["신한카드(1234)취소 홍*동 45,000원 11/13 14:25 GS칼텍스주유소", { kind: "card_cancel", company: "shinhan_card", amountWon: 45000, party: "GS칼텍스주유소" }],
  ["[Web발신] 12/30 09:00 입금 100,000원 건너편", { kind: "in", on: "2025-12-30", amountWon: 100000 }],
];

describe("문자 읽기", () => {
  for (const [sms, want] of cases)
    it(sms.replace(/\n/g, " ").slice(0, 40), () => {
      const r = parseBankSms(sms, sms.includes("12/30") ? "2026-01-02" : R);
      expect(r.ok, JSON.stringify(r)).toBe(true);
      if (!r.ok) return;
      for (const [k, v] of Object.entries(want)) {
        if (k === "party") expect(r.tx.party ?? "").toContain(v as string);
        else expect((r.tx as Record<string, unknown>)[k], `${k}: ${JSON.stringify(r.tx)}`).toBe(v);
      }
    });
  it("인증 문자는 거름", () => {
    expect(parseBankSms("[신한] 인증번호 123456 을 입력하세요", R).ok).toBe(false);
  });
  it("금액 없는 문자는 거름", () => {
    expect(parseBankSms("신한은행 입금 안내 서비스가 시작되었습니다", R).ok).toBe(false);
  });
});
