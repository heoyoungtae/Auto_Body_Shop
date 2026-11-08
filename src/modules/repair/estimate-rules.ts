// 견적 규칙(STD-03 4절, 법정 서식 별지 제89호의3). 화면과 서버가 같이 쓴다(DB 없음).
import { GROUP_LABEL, laborWon, paintWon, partGroup, pdrCode, type LaborTable, type PaintGrade } from "./labor";
import { partLabel, type Issue } from "./rules";

/** 법정 서식 부품 코드(서식 하단 7번) */
export const PART_CODES = { A: "A 신품(제작사·부품업체, 보증부품 포함)", B: "B 재제조품", C: "C 중고품(재생품 포함)", D: "D 인증대체부품", F: "F 수입부품" } as const;
export type PartCode = keyof typeof PART_CODES;
export const isPartCode = (s: string): s is PartCode => s in PART_CODES;

/** 상담의 부품 선호 → 처음 부품 코드. 고객이 고르지 않은 대체품은 쓰지 않는다(STD-03 4절) */
export function partCodeFromPref(pref: string | null | undefined): PartCode {
  if (!pref) return "A";
  if (pref.startsWith("품질인증")) return "D";
  if (pref.startsWith("친환경")) return "C";
  return "A";
}

/** 견적 항목 구분(STD-03 4절: 탈부착·판금·덴트·도장·광택·부품·외주·기타) */
export const LINE_CATEGORIES = { detach: "탈부착", sheet: "판금", dent: "덴트", paint: "도장", polish: "광택", part: "부품", outsource: "외주", etc: "기타(보정·청소)" } as const;
export type LineCategory = keyof typeof LINE_CATEGORIES;
export const isLineCategory = (s: string): s is LineCategory => s in LINE_CATEGORIES;

export const ESTIMATE_KIND = { insurance: "보험", general: "일반" } as const;
export type EstimateKind = keyof typeof ESTIMATE_KIND;

export const ESTIMATE_STATUS_LABEL = { draft: "작성 중", review: "검토 요청", approved: "검토 끝·발급 가능", sent: "고객에게 보냄", accepted: "고객 승인", partial: "일부 승인", declined: "승인 안 함", void: "폐기" } as const;

export type LineDraft = {
  payer: EstimateKind;
  category: LineCategory;
  damageId: string | null;
  laborCode: string | null;
  name: string;
  partCode: PartCode | null;
  qty: number;
  unitWon: number;
  laborMinutes: number;
  laborWon: number;
  note?: string | null;
};

type Damage = { id: string; part: string; sizeCm: number | null; method: string; calibrate: boolean };

/** 진단 줄 → 견적 항목(다시 적지 않게). 금액은 공임 기준표로 계산하고, 부품 단가만 비워 둔다 */
export function buildLines(damages: Damage[], t: LaborTable, grade: PaintGrade, kind: EstimateKind, partsPref?: string | null): LineDraft[] {
  const out: LineDraft[] = [];
  const base = { payer: kind, partCode: null, qty: 1, unitWon: 0, laborMinutes: 0, laborWon: 0 };
  const labor = (d: Damage, category: LineCategory, code: string, name: string): LineDraft | null => (t[code] == null ? null : { ...base, damageId: d.id, category, laborCode: code, name, laborMinutes: t[code], laborWon: laborWon(t[code], t) });
  const paint = (d: Damage): LineDraft[] => {
    const g = partGroup(d.part);
    const won = paintWon(g, grade, t);
    if (won == null) return [];
    const blend = Math.round((t.BLEND * t[`COEF-${grade}`]) / 100 / 10) * 10;
    return [
      { ...base, damageId: d.id, category: "paint", laborCode: `PNT-${g}`, name: `${partLabel(d.part)} 도장`, laborWon: won },
      { ...base, damageId: d.id, category: "paint", laborCode: "BLEND", name: `${partLabel(d.part)} 인접 패널 블렌딩`, laborWon: blend },
    ];
  };
  for (const d of damages) {
    const g = partGroup(d.part);
    const name = partLabel(d.part);
    const push = (x: LineDraft | null | LineDraft[]) => (Array.isArray(x) ? out.push(...x) : x && out.push(x));
    if (d.method === "pdr") push(labor(d, "dent", pdrCode(d.sizeCm), `${name} 덴트(PDR)`));
    else if (d.method === "polish") push(labor(d, "polish", "POL", `${name} 광택`));
    else if (d.method === "partial") {
      push(labor(d, "sheet", `SHT-${g}`, `${name} 판금`));
      if (g !== "wheel" && g !== "glass") push(paint(d));
    } else if (d.method === "replace") {
      push(labor(d, "detach", `RR-${g}`, `${name} 탈부착(교환)`));
      out.push({ ...base, damageId: d.id, category: "part", laborCode: null, name: `${GROUP_LABEL[g]} 부품(${name})`, partCode: partCodeFromPref(partsPref) });
      if (g !== "wheel" && g !== "glass") push(paint(d));
    } else if (d.method === "outsource") out.push({ ...base, damageId: d.id, category: "outsource", laborCode: "OUT-DIAG", name: `${name} 외주 진단(프레임 계측)`, laborWon: t["OUT-DIAG"] });
    if (d.calibrate) out.push({ ...base, damageId: d.id, category: "etc", laborCode: "CAL", name: `${name} 센서·카메라 보정`, laborWon: t.CAL });
  }
  return out;
}

/** 합계: 부품 = 수량 × 단가, 공임 = 공임 금액, 부가세 10%(원 단위 반올림) */
export function totals(lines: { qty: number; unitWon: number; laborWon: number; approved?: boolean | null }[], onlyApproved = false) {
  const use = onlyApproved ? lines.filter((l) => l.approved !== false) : lines;
  const parts = use.reduce((s, l) => s + l.qty * l.unitWon, 0);
  const labor = use.reduce((s, l) => s + l.laborWon, 0);
  const vat = Math.round((parts + labor) / 10);
  return { parts, labor, sum: parts + labor, vat, total: parts + labor + vat };
}

/** 검토 요청 전에 빠진 것 */
export function estimateIssues(lines: { category: string; name: string; partCode: string | null; unitWon: number; qty: number; laborWon: number }[], v: { registeredOn: string | null; mileage: number | null }): Issue[] {
  const out: Issue[] = [];
  if (!lines.length) out.push({ field: "lines", msg: "견적 항목이 없습니다" });
  for (const l of lines) {
    if (l.category === "part" && !l.partCode) out.push({ field: "lines", msg: `${l.name}: 부품 코드(A·B·C·D·F)를 골라야 합니다(법정 서식)` });
    if (l.category === "part" && l.unitWon <= 0) out.push({ field: "lines", msg: `${l.name}: 부품 단가를 넣어야 합니다(납품 단가, 견적일 기준)` });
    if (l.category !== "part" && l.laborWon <= 0) out.push({ field: "lines", msg: `${l.name}: 공임 금액이 0원입니다` });
    if (l.qty < 1) out.push({ field: "lines", msg: `${l.name}: 수량은 1 이상입니다` });
  }
  if (!v.registeredOn) out.push({ field: "registeredOn", msg: "등록년월일(자동차등록증의 최초 등록일)이 없습니다. 법정 서식의 필수 칸입니다" });
  if (v.mileage == null) out.push({ field: "mileage", msg: "주행거리가 없습니다(입고 점검에서 넣음)" });
  return out;
}

// ── 고객 승인(STD-03 5절). 화면과 서버가 함께 쓴다
/** 승인 받은 방법. 전화로만 받은 승인은 인정하지 않는다(기록이 남는 방법만) */
export const APPROVAL_METHOD = { link: "문자 링크(고객 휴대폰)", store: "매장에서 고객 서명", insurer: "보험사 회신(손해사정)" } as const;
export type ApprovalMethod = keyof typeof APPROVAL_METHOD;
export const isApprovalMethod = (s: string): s is ApprovalMethod => s in APPROVAL_METHOD;

type GroupLine = { id: string; damageId: string | null; name: string; qty: number; unitWon: number; laborWon: number; approved?: boolean | null };
export type ApprovalGroup = { key: string; lineIds: string[]; names: string[]; sum: number; withVat: number; approved: boolean | null };

/** 승인은 작업 묶음 단위: 같은 손상에서 나온 줄(탈부착·부품·도장·보정)은 함께 하거나 함께 빼야 수리가 된다. 직접 넣은 줄은 한 줄씩 */
export function approvalGroups(lines: GroupLine[]): ApprovalGroup[] {
  const map = new Map<string, GroupLine[]>();
  for (const l of lines) {
    const k = l.damageId ?? `line:${l.id}`;
    map.set(k, [...(map.get(k) ?? []), l]);
  }
  return [...map.entries()].map(([key, ls]) => {
    const sum = ls.reduce((s, l) => s + l.qty * l.unitWon + l.laborWon, 0);
    const a = ls.map((l) => l.approved ?? null);
    return { key, lineIds: ls.map((l) => l.id), names: ls.map((l) => l.name), sum, withVat: sum + Math.round(sum / 10), approved: a.every((x) => x === true) ? true : a.every((x) => x === false) ? false : null };
  });
}

/** 묶음 고른 결과 → 견적 상태 */
export function approvalOutcome(approved: number, all: number): "accepted" | "partial" | "declined" {
  return approved === 0 ? "declined" : approved === all ? "accepted" : "partial";
}
