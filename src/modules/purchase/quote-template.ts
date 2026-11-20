// 견적서(단가표) 엑셀 양식: 첫 시트 '견적서'(위: 업체 정보, 아래: 머리줄 + 품목 줄), 둘째 시트 '설명'(칸마다 적는 법)
import { writeXlsx, type XCell } from "@/modules/platform/xlsx-write";
import { TEMPLATE_COLUMNS } from "./quote-rules";
import { STOCK_UNITS, TRACK_MODES } from "./rules";

export const TEMPLATE_EXAMPLES: XCell[][] = [
  ["마스킹테이프 24MM", "", "BOX", 1, 50500, 50500, "소모품", "", "", 40, "롤", "실사로 관리", ""],
  ["우레탄신나(DR-421)", "", "말", 1, 98000, 98000, "도료", 18, "L", "", "", "수량 관리", ""],
];

/** 견적서 머리 부분의 업체 정보(양식 위쪽 칸) */
export type QuoteInfo = {
  name?: string;
  bizNo?: string;
  ceo?: string;
  contactName?: string;
  phone?: string;
  address?: string;
  /** 2026-11-17 */
  quotedOn?: string;
  validDays?: number | null;
  vat?: "별도" | "포함";
};

/** 양식 위쪽 업체 정보 칸: [이름표, 설명]. 이름표는 quote-rules 가 읽는 말과 같아야 한다 */
export const INFO_ROWS: { key: keyof QuoteInfo; label: string; note: string }[] = [
  { key: "name", label: "상호", note: "견적서를 보낸 업체 이름. 사업자번호가 없으면 이 이름으로 협력업체를 찾습니다" },
  { key: "bizNo", label: "사업자번호", note: "000-00-00000. 이 번호로 협력업체 대장에서 업체를 자동으로 찾고, 없으면 후보 업체로 등록합니다" },
  { key: "ceo", label: "대표자", note: "새 업체로 등록될 때 메모에 남습니다" },
  { key: "contactName", label: "담당자", note: "업체 담당자 이름" },
  { key: "phone", label: "전화", note: "담당자 연락처" },
  { key: "address", label: "주소", note: "사업장 주소(새 업체 메모에 남음)" },
  { key: "quotedOn", label: "견적일", note: "2026-11-17 처럼. 비우면 올릴 때 고르거나 오늘" },
  { key: "validDays", label: "유효기간", note: "견적일부터 며칠(예: 30일)" },
  { key: "vat", label: "부가세", note: "별도 · 포함 중 하나. 단가가 부가세 별도인지 포함인지" },
];

/** rows·info 를 주면 예시 대신 그 값을 넣는다(견적서를 양식으로 옮겨 줄 때) */
export function quoteTemplate(rows: XCell[][] = TEMPLATE_EXAMPLES, info: QuoteInfo = {}): Buffer {
  const top: XCell[][] = [
    ["업체 정보", "(아래 표 위의 칸은 업체 견적서 머리 부분을 옮겨 적습니다)"],
    ...INFO_ROWS.map((r): XCell[] => {
      const v = info[r.key];
      return [r.label, r.key === "validDays" ? (v ? `${v}일` : null) : ((v as string | undefined) ?? null)];
    }),
    [],
  ];
  const headerRow = top.length;
  const vatRow = top.findIndex((r) => r[0] === "부가세") + 1;
  return writeXlsx([
    {
      name: "견적서",
      header: true,
      headerRow,
      bold: top.map((_, i): [number, number] => [i, 0]).filter(([i]) => top[i].length > 0),
      rows: [...top, TEMPLATE_COLUMNS.map((c) => c.label), ...rows],
      widths: TEMPLATE_COLUMNS.map((c, i) => (i === 1 ? Math.max(c.width, 30) : c.width)),
      lists: [
        { col: 1, values: ["별도", "포함"], fromRow: vatRow, toRow: vatRow },
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
        ...INFO_ROWS.map((r): XCell[] => [r.label, r.note]),
        ...TEMPLATE_COLUMNS.map((c): XCell[] => [c.label, c.note]),
        [],
        ["올리기", "앱 › 재고 › 견적서로 품목 등록 에서 이 파일을 올립니다. 위쪽 업체 정보를 적어 두면 업체·견적일·유효기간·부가세를 따로 고르지 않아도 됩니다."],
        ["새 업체", "사업자번호가 협력업체 대장에 없으면 '후보' 업체로 자동 등록합니다. 등록 평가·서류 확인·입금 계좌는 협력업체 화면에서 따로 합니다."],
        ["예시 줄", "첫 시트의 예시 2줄은 지우고 적으세요(남겨 두면 같이 읽힙니다)."],
        ["중복", "이미 있는 품목은 새로 만들지 않고 단가만 갱신합니다. 이름이 비슷하면 확인 화면에서 묻습니다."],
      ],
    },
  ]);
}
