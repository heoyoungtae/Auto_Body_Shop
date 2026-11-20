// 견적서(단가표) 읽기 규칙(2026-11-20): 머리줄 알아보기, 합계·여백 줄 건너뛰기, 사업자번호·견적일·유효기간, 같은 품목 판정, 단위 추천, 엑셀 양식
import { describe, expect, it } from "vitest";
import { readSheet, type Grid } from "@/modules/bank/sheet-read";
import { guessKind, matchLines, normName, pasteToGrid, readQuoteGrid, similarity, suggestUnit } from "@/modules/purchase/quote-rules";
import { quoteTemplate } from "@/modules/purchase/quote-template";
import { fmtPackQty, packLabel, recommendTrack, suggestBuyQty } from "@/modules/purchase/rules";
import { PK_LINES } from "../fixtures/paint-korea-quote";

/** 업체 견적서 모양 그대로(머리 정보 + 표 + 이하 여백 + 총합계) */
const quoteGrid = (): Grid => [
  [null, "견 적 서"],
  ["견적일자 : 2026년 11월 17일", null, "등록번호", "131-86-58023"],
  ["미래 허준수이사님 귀하", null, "상호", "㈜페인트코리아", "성명", "김용배"],
  ["유효기간 : 발행일로부터30일"],
  ["합계금액 : 일금삼백사십삼만팔천오백원정( V.A.T 별도)", null, null, null, "₩", "3,438,500"],
  ["번 호", "품 목 명", "단위", "수 량", "단 가", "공급가액"],
  ...PK_LINES.map(([n, u, q, p]): Grid[number] => [null, n, u, q, p.toLocaleString("ko-KR"), (q * p).toLocaleString("ko-KR")]),
  [null, "********** 이 하 여 백 **********"],
  [null, "총 합 계", null, null, null, "3,438,500"],
];

describe("견적서 읽기", () => {
  it("머리줄을 알아보고 40줄·합계·사업자번호·상호·견적일·유효기간을 읽는다", () => {
    const r = readQuoteGrid(quoteGrid());
    expect(r.templateOrder).toBe(false);
    expect(r.lines).toHaveLength(40);
    expect(r.lines.reduce((a, l) => a + l.qty * l.unitWon, 0)).toBe(3_438_500);
    expect(r.readTotalWon).toBe(3_438_500);
    expect(r.bizNos).toEqual(["131-86-58023"]);
    expect(r.supplierName).toBe("㈜페인트코리아");
    expect(r.quotedOn).toBe("2026-11-17");
    expect(r.validDays).toBe(30);
    expect(r.lines[34]).toMatchObject({ supName: "1000cc 비닐용기(하드타입)", supUnit: "EA", qty: 100, unitWon: 150, amountWon: 15_000 });
  });

  it("우리 사업자번호는 업체 번호에서 뺀다", () => {
    const g = quoteGrid();
    g.unshift(["수신 사업자 123-45-67890"]);
    expect(readQuoteGrid(g, "123-45-67890").bizNos).toEqual(["131-86-58023"]);
  });

  it("머리줄 없이 붙여 넣으면 양식 순서(품명·규격·단위·수량·단가)로 읽는다", () => {
    const r = readQuoteGrid(pasteToGrid("마스킹테이프\t24mm\tBOX\t2\t50,500\n우레탄신나\t\t말\t1\t98000\n"));
    expect(r.templateOrder).toBe(true);
    expect(r.lines).toEqual([
      expect.objectContaining({ supName: "마스킹테이프", spec: "24mm", supUnit: "BOX", qty: 2, unitWon: 50_500 }),
      expect.objectContaining({ supName: "우레탄신나", spec: null, supUnit: "말", qty: 1, unitWon: 98_000 }),
    ]);
  });

  it("앱 엑셀 양식을 만들고 다시 읽으면 예시 두 줄이 그대로 나온다", () => {
    const buf = quoteTemplate();
    const g = readSheet(new Uint8Array(buf), "견적서_양식.xlsx");
    expect(g[0].slice(0, 6)).toEqual(["품명", "규격", "단위", "수량", "단가", "금액"]);
    const r = readQuoteGrid(g);
    expect(r.lines.map((l) => [l.supName, l.supUnit, l.unitWon, l.kind, l.packAmount, l.packUnit, l.buyQty, l.baseUnit, l.track])).toEqual([
      ["마스킹테이프 24MM", "BOX", 50_500, "consumable", null, null, 40, "롤", "count"],
      ["우레탄신나(DR-421)", "말", 98_000, "paint", 18, "L", null, null, "qty"],
    ]);
  });
});

describe("같은 품목 판정(중복 걸러내기)", () => {
  const items = [
    { id: "a", name: "마스킹테이프", spec: "24MM", active: true },
    { id: "b", name: "SUN 6원형 짝 P80", spec: null, active: true },
    { id: "c", name: "우레탄 신나", spec: null, active: true },
    { id: "d", name: "옛 컴파운드", spec: null, active: false },
  ];
  it("띄어쓰기·대소문자·괄호·따옴표를 무시하고 비교한다", () => {
    expect(normName('SUN 6"원형 (짝)P80')).toBe(normName("sun 6원형 짝 p80"));
    expect(similarity("우레탄신나(DR-421)", "우레탄 신나")).toBeGreaterThan(0.72);
  });
  it("같은 품목·비슷한 품목·새 품목·견적서 안 중복·업체 품명 기억", () => {
    const m = matchLines(
      [
        { supName: "마스킹테이프 24MM", spec: null, unitWon: 50_500 },
        { supName: 'SUN 6"원형 (짝)P80', spec: null, unitWon: 37_000 },
        { supName: "우레탄신나(DR-421)", spec: null, unitWon: 98_000 },
        { supName: "방진복(망사)", spec: null, unitWon: 22_000 },
        { supName: "마스킹 테이프 24mm", spec: null, unitWon: 51_000 },
        { supName: "TH0035신나", spec: null, unitWon: 42_000 },
        { supName: "옛 컴파운드", spec: null, unitWon: 9_000 },
      ],
      items,
      [{ itemId: "c", supName: "TH0035신나" }],
    );
    expect(m.map((x) => [x.match, x.itemId])).toEqual([
      ["same", "a"],
      ["same", "b"],
      ["similar", null],
      ["new", null],
      ["dup", null],
      ["same", "c"],
      ["new", null],
    ]);
    expect(m[2].candidates[0].id).toBe("c");
    expect(m[4].note).toContain("1번째 줄과 같은 품목");
    expect(m[4].note).toContain("단가 다름");
  });
});

describe("새 품목 추천값", () => {
  it("업체 단위를 우리 단위·용량으로 바꾼다", () => {
    expect(suggestUnit("BOX")).toMatchObject({ unit: "박스" });
    expect(suggestUnit("EA")).toMatchObject({ unit: "개" });
    expect(suggestUnit("SET")).toMatchObject({ unit: "세트" });
    expect(suggestUnit("벌")).toMatchObject({ unit: "벌" });
    expect(suggestUnit("2.5L")).toMatchObject({ unit: "캔", packAmount: 2.5, packUnit: "L" });
    expect(suggestUnit("0.5K")).toMatchObject({ unit: "캔", packAmount: 0.5, packUnit: "kg" });
    expect(suggestUnit("말")).toMatchObject({ unit: "통", packAmount: 18, packUnit: "L" });
    expect(suggestUnit("G").note).toContain("갤런");
    expect(suggestUnit("뭉치").note).toContain("알아보지 못해");
  });
  it("품명으로 구분을 추천한다", () => {
    expect(PK_LINES.slice(0, 20).every(([n]) => guessKind(n) === "paint")).toBe(true);
    expect(PK_LINES.slice(20).map(([n]) => guessKind(n)).every((k) => k === "consumable")).toBe(true);
  });
});

describe("사업자번호 찾기", () => {
  it("금액 칸이 이어진 숫자는 번호로 보지 않고, '등록번호' 줄의 10자리·띄어 쓴 번호는 읽는다", () => {
    expect(readQuoteGrid([["품명", "수량", "단가", "금액"], ["신나", 1, 42000, 42000]]).bizNos).toEqual([]);
    expect(readQuoteGrid([["등록번호", "1318658023"], ["품명", "단가"], ["신나", 42000]]).bizNos).toEqual(["131-86-58023"]);
    expect(readQuoteGrid([["131 - 86 -58023"], ["품명", "단가"], ["신나", 42000]]).bizNos).toEqual(["131-86-58023"]);
  });
});

describe("관리 방식 추천·묶음 입수", () => {
  const p = { low: 10_000, high: 50_000 };
  it("도료·상비 부품·비싼 품목은 수량, 중간·묶음은 실사, 싼 소모품은 관리 안 함", () => {
    expect(recommendTrack({ kind: "paint", unitWon: 5_000 }, p).mode).toBe("qty");
    expect(recommendTrack({ kind: "part", unitWon: 500 }, p).mode).toBe("qty");
    expect(recommendTrack({ kind: "consumable", unitWon: 55_000 }, p).mode).toBe("qty");
    expect(recommendTrack({ kind: "consumable", unitWon: 37_000 }, p).mode).toBe("count");
    expect(recommendTrack({ kind: "consumable", unitWon: 8_000, buyQty: 40 }, p).mode).toBe("count");
    expect(recommendTrack({ kind: "consumable", unitWon: 8_000, safetyQty: 2 }, p).mode).toBe("count");
    const r = recommendTrack({ kind: "consumable", unitWon: 150 }, p);
    expect(r).toMatchObject({ mode: "none" });
    expect(r.reason).toContain("10,000원 미만");
  });
  it("낱개 수량을 박스와 낱개로 보여 주고, 발주 제안은 박스로 올림", () => {
    const tape = { unit: "롤", buyUnit: "박스", buyQty: 40 };
    expect(packLabel(tape)).toBe("1박스 = 40롤");
    expect(fmtPackQty(140, tape)).toBe("3박스 20롤(140롤)");
    expect(fmtPackQty(5, { unit: "캔" })).toBe("5캔");
    expect(suggestBuyQty({ qty: 10, safetyQty: 20, buyQty: 40 })).toBe(1);
    expect(suggestBuyQty({ qty: 10, safetyQty: 50, buyQty: 40 })).toBe(3);
  });
});
