// 공임 기준표(F-03-01, STD-03 4·7절) — 작업별 표준 시간과 단가. 견적은 이 표로 공임을 계산한다.
// 기본값은 개업 전 '제안값'이다. 공장장이 표준 시간을 정하고 대표가 승인해 바꾼다(설정 › 공임 기준표, 이력 남음).
// 화면에서도 쓰므로 DB 를 부르지 않는다(읽기·저장은 labor-store.ts).

export type PartGroup = "bumper" | "hood" | "roof" | "trunk" | "door" | "fender" | "quarter" | "mirror" | "glass" | "wheel";

export const GROUP_LABEL: Record<PartGroup, string> = {
  bumper: "범퍼",
  hood: "후드",
  roof: "지붕",
  trunk: "트렁크·테일게이트",
  door: "도어",
  fender: "앞펜더",
  quarter: "뒤펜더(쿼터)",
  mirror: "사이드미러",
  glass: "유리",
  wheel: "휠",
};

/** 차체 도면 부위 → 공임 묶음 */
export function partGroup(part: string): PartGroup {
  if (part.endsWith("bumper")) return "bumper";
  if (part === "hood") return "hood";
  if (part === "roof") return "roof";
  if (part === "trunk") return "trunk";
  if (part.includes("door")) return "door";
  if (part.endsWith("f_fender")) return "fender";
  if (part.endsWith("quarter")) return "quarter";
  if (part.endsWith("mirror")) return "mirror";
  if (part === "windshield" || part === "rear_glass") return "glass";
  return "wheel";
}

/**
 * 기준표 항목. kind: hours=표준 시간(분), price=고정 단가(원), pct=계수(%).
 * [확인 필요] 숫자는 업계 공개 자료를 참고한 제안값이다. 개업 전 공장장이 실측해 확정한다.
 */
export type LaborKind = "hours" | "price" | "pct";
/** 견적 줄 구분(estimate-rules LINE_CATEGORIES 중 부품 빼고). 계수(pct) 항목은 줄로 고르지 않는다 */
export type LaborCat = "detach" | "sheet" | "dent" | "paint" | "polish" | "outsource" | "etc";
export const LABOR_CATS: LaborCat[] = ["detach", "sheet", "dent", "paint", "polish", "outsource", "etc"];
export type LaborDef = { code: string; section: string; name: string; kind: LaborKind; value: number; hint?: string; cat?: LaborCat; custom?: boolean };

const hours = (code: string, section: string, name: string, min: number, hint?: string): LaborDef => ({ code, section, name, kind: "hours", value: min, hint });
const price = (code: string, section: string, name: string, won: number, hint?: string): LaborDef => ({ code, section, name, kind: "price", value: won, hint });
const pct = (code: string, section: string, name: string, p: number, hint?: string): LaborDef => ({ code, section, name, kind: "pct", value: p, hint });

const BASE: LaborDef[] = [
  price("RATE", "기본", "시간당 공임", 38_000, "표준 시간 × 이 단가가 공임입니다. 보험 수리는 보험사 계약 단가를 따릅니다"),
  // 도장: 패널당 단가 × 도장 등급 계수(STD-03 4절)
  price("PNT-bumper", "도장(패널당, 솔리드 기준)", "범퍼", 220_000),
  price("PNT-hood", "도장(패널당, 솔리드 기준)", "후드", 280_000),
  price("PNT-roof", "도장(패널당, 솔리드 기준)", "지붕", 300_000),
  price("PNT-trunk", "도장(패널당, 솔리드 기준)", "트렁크·테일게이트", 250_000),
  price("PNT-door", "도장(패널당, 솔리드 기준)", "도어", 230_000),
  price("PNT-fender", "도장(패널당, 솔리드 기준)", "앞펜더", 180_000),
  price("PNT-quarter", "도장(패널당, 솔리드 기준)", "뒤펜더(쿼터)", 230_000),
  price("PNT-mirror", "도장(패널당, 솔리드 기준)", "사이드미러 커버", 80_000),
  price("BLEND", "도장(패널당, 솔리드 기준)", "블렌딩(인접 패널, 1판)", 110_000, "색 차이를 없애려 옆 패널을 흐리게 칠하는 것. 도장 판마다 1판을 기본으로 붙입니다"),
  // 도장 재료비: 도료·클리어·프라이머·퍼티·사포·마스킹 등 소모품. 보험 견적은 공임과 따로 적는다. 등급 계수를 곱한다
  price("MAT-bumper", "도장 재료비(패널당, 솔리드 기준)", "범퍼", 90_000, "도료·부자재 등 소모품. 도장 등급 계수를 곱합니다"),
  price("MAT-hood", "도장 재료비(패널당, 솔리드 기준)", "후드", 110_000),
  price("MAT-roof", "도장 재료비(패널당, 솔리드 기준)", "지붕", 120_000),
  price("MAT-trunk", "도장 재료비(패널당, 솔리드 기준)", "트렁크·테일게이트", 100_000),
  price("MAT-door", "도장 재료비(패널당, 솔리드 기준)", "도어", 90_000),
  price("MAT-fender", "도장 재료비(패널당, 솔리드 기준)", "앞펜더", 70_000),
  price("MAT-quarter", "도장 재료비(패널당, 솔리드 기준)", "뒤펜더(쿼터)", 90_000),
  price("MAT-mirror", "도장 재료비(패널당, 솔리드 기준)", "사이드미러 커버", 30_000),
  price("MAT-blend", "도장 재료비(패널당, 솔리드 기준)", "블렌딩(1판)", 40_000),
  // 도면에 없는 부위(견적에서 골라 넣음)
  price("PNT-sill", "도장(기타 부위)", "사이드실(로커패널, 한쪽)", 180_000),
  price("PNT-pillar", "도장(기타 부위)", "필러(A·B·C, 1개)", 120_000),
  price("PNT-spoiler", "도장(기타 부위)", "스포일러", 120_000),
  price("PNT-molding", "도장(기타 부위)", "몰딩·가니시(1개)", 60_000),
  price("PNT-wheel", "도장(기타 부위)", "휠 도장(1개)", 120_000, "휠 복원(판금) 뒤 도장"),
  pct("COEF-solid", "도장 등급 계수", "솔리드", 100),
  pct("COEF-metallic", "도장 등급 계수", "메탈릭", 110),
  pct("COEF-pearl", "도장 등급 계수", "펄", 120),
  pct("COEF-tricoat", "도장 등급 계수", "3코트", 140),
  // 덴트(PDR): 크기별
  hours("PDR-10", "덴트(PDR, 크기별)", "10cm 이하", 60),
  hours("PDR-20", "덴트(PDR, 크기별)", "20cm 이하", 120),
  hours("PDR-40", "덴트(PDR, 크기별)", "40cm 이하", 210),
  hours("PDR-XL", "덴트(PDR, 크기별)", "40cm 초과", 300),
  // 덴트 가산: 같은 크기라도 어려운 곳은 시간 × 계수
  pct("PDR-LINE", "덴트 가산 계수", "프레스 라인·모서리", 130, "진단에서 '꺾임(라인)'에 체크하면 덴트 시간에 저절로 곱합니다"),
  pct("PDR-ALU", "덴트 가산 계수", "알루미늄 패널", 140, "견적 줄 고르기에서 체크하면 곱합니다"),
  pct("PDR-ACCESS", "덴트 가산 계수", "안쪽 접근 어려움(탈거 필요)", 120, "견적 줄 고르기에서 체크하면 곱합니다"),
  price("PDR-HAIL", "덴트(PDR, 크기별)", "우박 덴트(1개당)", 15_000, "여러 개는 수량 대신 금액에 개수를 곱해 적습니다"),
  // 광택: 패널당
  hours("POL", "광택", "패널당", 60),
  price("POL-FULL", "광택", "전체 광택", 250_000),
  price("COAT", "광택", "유리막 코팅(전체)", 400_000),
  // 작은 수리
  price("SPOT", "작은 수리", "부분(스팟) 도장(1곳)", 90_000, "패널 일부만 칠하는 작은 도장. 경계는 블렌딩"),
  price("TOUCH", "작은 수리", "붓펜 터치업(1곳)", 20_000, "돌빵·작은 찍힘"),
  // 판금(부분 판금, 패널당)
  hours("SHT-bumper", "판금(부분, 패널당)", "범퍼(플라스틱 복원)", 90),
  hours("SHT-hood", "판금(부분, 패널당)", "후드", 150),
  hours("SHT-roof", "판금(부분, 패널당)", "지붕", 180),
  hours("SHT-trunk", "판금(부분, 패널당)", "트렁크·테일게이트", 150),
  hours("SHT-door", "판금(부분, 패널당)", "도어", 150),
  hours("SHT-fender", "판금(부분, 패널당)", "앞펜더", 120),
  hours("SHT-quarter", "판금(부분, 패널당)", "뒤펜더(쿼터)", 180),
  hours("SHT-mirror", "판금(부분, 패널당)", "사이드미러", 30),
  hours("SHT-wheel", "판금(부분, 패널당)", "휠 복원", 60),
  hours("SHT-sill", "판금(부분, 패널당)", "사이드실(로커패널)", 150),
  hours("SHT-pillar", "판금(부분, 패널당)", "필러", 180),
  // 탈부착(교환할 때)
  hours("RR-bumper", "탈부착(교환)", "범퍼", 60),
  hours("RR-hood", "탈부착(교환)", "후드", 50),
  hours("RR-trunk", "탈부착(교환)", "트렁크·테일게이트", 60),
  hours("RR-door", "탈부착(교환)", "도어", 90),
  hours("RR-fender", "탈부착(교환)", "앞펜더", 70),
  hours("RR-quarter", "탈부착(교환)", "뒤펜더(쿼터, 절단·용접)", 480),
  hours("RR-roof", "탈부착(교환)", "지붕(절단·용접)", 600),
  hours("RR-mirror", "탈부착(교환)", "사이드미러", 30),
  hours("RR-glass", "탈부착(교환)", "유리", 90),
  hours("RR-wheel", "탈부착(교환)", "휠", 20),
  // 도장·판금하려고 떼었다 다시 붙이는 것(교환 아님)
  hours("RI-bumper", "탈부착(도장할 때)", "범퍼", 40),
  hours("RI-headlamp", "탈부착(도장할 때)", "헤드램프(1개)", 30),
  hours("RI-taillamp", "탈부착(도장할 때)", "리어램프(1개)", 20),
  hours("RI-molding", "탈부착(도장할 때)", "몰딩·가니시(1개)", 20),
  hours("RI-handle", "탈부착(도장할 때)", "도어 손잡이(1개)", 20),
  hours("RI-emblem", "탈부착(도장할 때)", "엠블럼·레터링", 15),
  hours("RI-mirror", "탈부착(도장할 때)", "사이드미러", 20),
  hours("RI-trim", "탈부착(도장할 때)", "도어 내장 트림(1짝)", 30, "도어 안쪽 덴트·판금 접근용"),
  // 기타
  price("CAL", "기타", "센서·카메라 보정(1곳)", 120_000, "보정 장비가 없으면 외주 단가"),
  price("OUT-DIAG", "기타", "외주 진단(프레임 계측)", 150_000),
  price("OUT-ALIGN", "기타", "휠 얼라인먼트(외주)", 60_000, "하체·휠 충격이 있었을 때"),
  price("TOW", "기타", "탁송(편도)", 50_000, "거리에 따라 금액을 고쳐 적습니다"),
  price("WASH", "기타", "출고 세차(실내·외)", 30_000),
];

/** 견적 줄로 고를 때의 구분(코드 앞머리로) */
export function catOf(code: string, kind: LaborKind): LaborCat | undefined {
  if (kind === "pct" || code === "RATE") return undefined;
  if (/^(PNT-|MAT-|BLEND|SPOT|TOUCH)/.test(code)) return "paint";
  if (code.startsWith("PDR-")) return "dent";
  if (/^(POL|COAT)/.test(code)) return "polish";
  if (code.startsWith("SHT-")) return "sheet";
  if (/^(RR-|RI-)/.test(code)) return "detach";
  if (code.startsWith("OUT-")) return "outsource";
  return "etc";
}

export const LABOR_DEFAULTS: LaborDef[] = BASE.map((d) => ({ ...d, cat: catOf(d.code, d.kind) }));
/** 숨길 수 없는 항목: 모든 견적 계산의 바탕 */
export const LABOR_LOCKED = new Set(["RATE", "COEF-solid", "COEF-metallic", "COEF-pearl", "COEF-tricoat"]);
/** 도장 등급 계수를 곱하는 항목 */
export const usesGradeCoef = (code: string) => /^(PNT-|MAT-|BLEND)/.test(code);


export const LABOR_CODES = LABOR_DEFAULTS.map((d) => d.code);
export const laborDef = (code: string) => LABOR_DEFAULTS.find((d) => d.code === code);
export type LaborTable = Record<string, number>;

export const defaultLaborTable = (): LaborTable => Object.fromEntries(LABOR_DEFAULTS.map((d) => [d.code, d.value]));

export const PAINT_GRADES = { solid: "솔리드", metallic: "메탈릭", pearl: "펄", tricoat: "3코트" } as const;
export type PaintGrade = keyof typeof PAINT_GRADES;
export const isPaintGrade = (s: string): s is PaintGrade => s in PAINT_GRADES;

/** 공임 금액(원): 분 × 시간당 공임, 10원 단위 반올림 */
export const laborWon = (minutes: number, table: LaborTable) => Math.round((minutes / 60) * table.RATE / 10) * 10;
/** 금액 × 도장 등급 계수(10원 단위) */
export const gradeWon = (won: number, grade: PaintGrade, table: LaborTable) => Math.round((won * table[`COEF-${grade}`]) / 100 / 10) * 10;
export const paintWon = (group: PartGroup, grade: PaintGrade, table: LaborTable) => {
  const base = table[`PNT-${group}`];
  return base == null ? null : gradeWon(base, grade, table);
};
export const pdrCode = (sizeCm: number | null) => (sizeCm == null || sizeCm <= 10 ? "PDR-10" : sizeCm <= 20 ? "PDR-20" : sizeCm <= 40 ? "PDR-40" : "PDR-XL");
export const fmtMinutes = (m: number) => (m % 60 ? `${Math.floor(m / 60) ? `${Math.floor(m / 60)}시간 ` : ""}${m % 60}분` : `${m / 60}시간`);

/** 기준표 항목 → 견적 줄 작업내용(예: '범퍼' + '탈부착(도장할 때)' → '범퍼 탈부착') */
export function lineNameOf(d: Pick<LaborDef, "name" | "section" | "custom">): string {
  const base = d.section.replace(/\(.*\)/, "").trim();
  if (d.custom || ["기타", "작은 수리"].includes(base) || d.name.includes(base)) return d.name;
  if (base === "도장 재료비") return `${d.name} 도장 재료비`;
  if (base === "덴트") return `덴트(PDR) ${d.name}`;
  return `${d.name} ${base}`;
}
