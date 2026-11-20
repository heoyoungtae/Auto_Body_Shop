// 견적서(단가표) 엑셀 양식: 첫 시트 '견적서'(머리줄 + 예시 2줄), 둘째 시트 '설명'(칸마다 적는 법)
import { writeXlsx, type XCell } from "@/modules/platform/xlsx-write";
import { TEMPLATE_COLUMNS } from "./quote-rules";
import { STOCK_UNITS, TRACK_MODES } from "./rules";

export const TEMPLATE_EXAMPLES: XCell[][] = [
  ["마스킹테이프 24MM", "", "BOX", 1, 50500, 50500, "소모품", "", "", 40, "롤", "실사로 관리", ""],
  ["우레탄신나(DR-421)", "", "말", 1, 98000, 98000, "도료", 18, "L", "", "", "수량 관리", ""],
];

/** rows 를 주면 예시 대신 그 줄을 넣는다(견적서를 양식으로 옮겨 줄 때) */
export function quoteTemplate(rows: XCell[][] = TEMPLATE_EXAMPLES): Buffer {
  return writeXlsx([
    {
      name: "견적서",
      header: true,
      rows: [TEMPLATE_COLUMNS.map((c) => c.label), ...rows],
      widths: TEMPLATE_COLUMNS.map((c) => c.width),
      lists: [
        { col: TEMPLATE_COLUMNS.findIndex((c) => c.key === "kind"), values: ["도료", "소모품", "상비 부품"] },
        { col: TEMPLATE_COLUMNS.findIndex((c) => c.key === "packUnit"), values: ["ml", "L", "g", "kg"] },
        { col: TEMPLATE_COLUMNS.findIndex((c) => c.key === "baseUnit"), values: [...STOCK_UNITS] },
        { col: TEMPLATE_COLUMNS.findIndex((c) => c.key === "track"), values: Object.values(TRACK_MODES) },
      ],
    },
    {
      name: "설명",
      header: true,
      widths: [12, 80],
      rows: [
        ["칸", "적는 법"],
        ...TEMPLATE_COLUMNS.map((c): XCell[] => [c.label, c.note]),
        [],
        ["올리기", "앱 › 재고 › 견적서로 품목 등록 에서 이 파일을 올립니다. 업체·견적일·유효기간·부가세 별도/포함은 올릴 때 고릅니다."],
        ["예시 줄", "첫 시트의 예시 2줄은 지우고 적으세요(남겨 두면 같이 읽힙니다)."],
        ["중복", "이미 있는 품목은 새로 만들지 않고 단가만 갱신합니다. 이름이 비슷하면 확인 화면에서 묻습니다."],
      ],
    },
  ]);
}
