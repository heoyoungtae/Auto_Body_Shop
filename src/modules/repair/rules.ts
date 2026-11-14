// 입고 점검(F-02-01) 규칙 — 서버와 화면(저장 전 점검)이 같이 쓴다. 사내 표준서 STD-02 4절.
// 화면에서도 불러오므로 DB 스키마를 가져오지 않는다(스키마가 여기 값을 쓴다).
import { fromLegacy, isPart, isView, partLabel, shapeOf, viewsOf, type View } from "./body-map";

/** 사진 자리: 8방향 + 계기판 + 도어 라벨(색상 코드) + 손상 근접·기타 */
export const PHOTO_SLOTS = ["front", "front_left", "left", "rear_left", "rear", "rear_right", "right", "front_right", "dash", "label", "close", "other"] as const;
export type PhotoSlot = (typeof PHOTO_SLOTS)[number];

/** 입고 도면 표시: 부위·면·칸(0~8, body-map.ts), kind O=수리 대상, D=찌그러짐, S=긁힘, C=깨짐·크랙, R=부식, W=휠 */
export type BodyMark = { part: string; view: View; cell: number; kind: "O" | "D" | "S" | "C" | "R" | "W"; note?: string };

export const RO_STATUS_LABEL = {
  intake: "입고 점검 중",
  checked: "점검 끝·진단 대기",
  estimating: "견적 중",
  working: "작업 중",
  inspecting: "검사 중",
  ready: "출고 대기",
  delivered: "출고됨",
  cancelled: "취소",
} as const;

/** 사진 자리 이름과 촬영 요령 */
export const PHOTO_SLOT_LABEL: Record<PhotoSlot, string> = {
  front: "정면",
  front_left: "앞 왼쪽 모서리",
  left: "왼쪽 옆",
  rear_left: "뒤 왼쪽 모서리",
  rear: "뒷면",
  rear_right: "뒤 오른쪽 모서리",
  right: "오른쪽 옆",
  front_right: "앞 오른쪽 모서리",
  dash: "계기판(경고등·주행거리)",
  label: "도어 라벨(색상 코드)",
  close: "손상 부위 근접",
  other: "기타(실내·물품 등)",
};

/** 8방향: 차를 한 바퀴 돌며 찍는 순서 */
export const DIRECTION_SLOTS: PhotoSlot[] = ["front", "front_left", "left", "rear_left", "rear", "rear_right", "right", "front_right"];
/** 여러 장 올릴 수 있는 자리(나머지는 새로 올리면 바뀜) */
export const MULTI_SLOTS: PhotoSlot[] = ["close", "other"];
export const isPhotoSlot = (s: string): s is PhotoSlot => (PHOTO_SLOTS as readonly string[]).includes(s);

/** 도면 기호(STD-02 4절 4단계) */
export const MARK_KINDS = {
  O: { label: "수리 대상", color: "#2563eb" },
  D: { label: "찌그러짐", color: "#dc2626" },
  S: { label: "긁힘", color: "#ea580c" },
  C: { label: "깨짐·크랙", color: "#7c3aed" },
  R: { label: "부식", color: "#92400e" },
  W: { label: "휠 긁힘", color: "#0f766e" },
} as const;
export type MarkKind = keyof typeof MARK_KINDS;
export const isMarkKind = (k: string): k is MarkKind => k in MARK_KINDS;

export { BODY_PARTS, partLabel, partName, isPart } from "./body-map";

/** 입고 도면 표시를 걸러 저장 모양으로 맞춘다. 예전 도면 좌표(x·y)로 온 것은 새 전개도의 부위·면·칸으로 옮긴다 */
export function cleanMarks(raw: unknown): BodyMark[] {
  if (!Array.isArray(raw)) return [];
  const out: BodyMark[] = [];
  for (const m of raw.slice(0, 80)) {
    if (!m || typeof m !== "object" || typeof m.kind !== "string" || !isMarkKind(m.kind)) continue;
    const note = m.note ? { note: String(m.note).slice(0, 100) } : {};
    if (typeof m.part === "string" && isPart(m.part) && typeof m.view === "string" && isView(m.view) && shapeOf(m.view, m.part)) {
      const cell = Number.isInteger(m.cell) && m.cell >= 0 && m.cell <= 8 ? m.cell : 4;
      out.push({ part: m.part, view: m.view, cell, kind: m.kind, ...note });
    } else if (typeof m.x === "number" && typeof m.y === "number") {
      const at = fromLegacy(m.x, m.y);
      if (at) out.push({ ...at, kind: m.kind, ...note });
    } else if (typeof m.part === "string" && isPart(m.part)) {
      out.push({ part: m.part, view: viewsOf(m.part)[0], cell: 4, kind: m.kind, ...note });
    }
  }
  return out;
}

export const FUEL_OPTIONS = [
  { value: "0", label: "E(바닥·경고등)" },
  { value: "13", label: "1/8" },
  { value: "25", label: "1/4" },
  { value: "38", label: "3/8" },
  { value: "50", label: "1/2" },
  { value: "63", label: "5/8" },
  { value: "75", label: "3/4" },
  { value: "88", label: "7/8" },
  { value: "100", label: "F(가득)" },
];
export const fuelLabel = (p: number | null | undefined) => (p == null ? null : (FUEL_OPTIONS.find((o) => Number(o.value) === p)?.label ?? `${p}%`));

/** 차체 특이 사항(수리 방법·작업 주의에 영향) */
export const BODY_NOTES = ["알루미늄 패널", "고장력강·초고장력강", "전기차·하이브리드(고전압)", "랩핑·PPF 시공", "재도장 흔적", "유리막·코팅 시공"];
/** 장착 단말기(STD-02 4절 5단계) */
export const DEVICES = ["블랙박스", "하이패스 단말기", "매립 내비게이션", "후방 카메라(애프터마켓)", "기타 장착물"];

/** 서명 전 점검에 쓰는 값 */
export type IntakeSnapshot = {
  mileage: number | null;
  fuelPct: number | null;
  photoSlots: string[];
  valuables: string;
  valuablesNone: boolean;
  keyCount: number | null;
  coversOn: boolean;
  agreeChecked: boolean;
  agreeMove: boolean;
  consentOk: boolean;
  signerName: string;
  signature: boolean;
  delivered: boolean;
  driverName: string;
  lastMileage: number | null;
};

export type Issue = { field: string; msg: string };

/** 서명(점검 마침) 전에 빠진 것. 비어 있으면 서명할 수 있다 */
export function intakeIssues(s: IntakeSnapshot, minPhotos: number): Issue[] {
  const out: Issue[] = [];
  if (s.mileage == null) out.push({ field: "mileage", msg: "주행거리를 계기판에서 읽어 적어야 합니다" });
  else if (s.lastMileage != null && s.mileage < s.lastMileage) out.push({ field: "mileage", msg: `주행거리가 지난 기록(${s.lastMileage.toLocaleString("ko-KR")}km)보다 적습니다` });
  if (s.fuelPct == null) out.push({ field: "fuelPct", msg: "연료량을 골라야 합니다" });
  const dirs = DIRECTION_SLOTS.filter((d) => s.photoSlots.includes(d)).length;
  const need = Math.min(minPhotos, DIRECTION_SLOTS.length);
  if (dirs < need) out.push({ field: "photos", msg: `외관 사진이 ${dirs}/${need}장입니다. 8방향을 모두 찍어 올려야 합니다` });
  if (!s.photoSlots.includes("dash")) out.push({ field: "photos", msg: "계기판 사진(경고등·주행거리)이 없습니다" });
  if (!s.valuablesNone && !s.valuables.trim()) out.push({ field: "valuables", msg: "남긴 물품을 적거나 '남긴 물품 없음'에 체크해야 합니다" });
  if (s.keyCount == null || s.keyCount < 1) out.push({ field: "keyCount", msg: "받은 열쇠 개수를 적어야 합니다(1개 이상)" });
  if (!s.coversOn) out.push({ field: "coversOn", msg: "시트·핸들·바닥 커버를 씌우고 체크해야 합니다" });
  if (s.delivered && !s.driverName.trim()) out.push({ field: "driverName", msg: "탁송 입고는 탁송 기사 이름을 적어야 합니다" });
  if (!s.agreeChecked) out.push({ field: "agree", msg: "점검 내용 확인 동의에 체크해야 합니다" });
  if (!s.agreeMove) out.push({ field: "agree", msg: "작업상 차량 이동 동의에 체크해야 합니다" });
  if (!s.consentOk) out.push({ field: "consentNow", msg: "개인정보 필수 동의(F-13-01)가 없습니다. 고객에게 받고 체크해야 합니다" });
  if (!s.signerName.trim()) out.push({ field: "signerName", msg: "서명한 사람 이름을 적어야 합니다" });
  if (!s.signature) out.push({ field: "signature", msg: "서명을 받아야 합니다(서명란에 손가락·펜으로)" });
  return out;
}

/** 저장할 때 언제나 막는 것(서명 전에도) */
export function intakeHardIssues(s: Pick<IntakeSnapshot, "mileage" | "lastMileage" | "keyCount">): Issue[] {
  const out: Issue[] = [];
  if (s.mileage != null && s.lastMileage != null && s.mileage < s.lastMileage) out.push({ field: "mileage", msg: `주행거리가 지난 기록(${s.lastMileage.toLocaleString("ko-KR")}km)보다 적습니다. 계기판을 다시 확인해 주세요` });
  if (s.keyCount != null && s.keyCount > 9) out.push({ field: "keyCount", msg: "열쇠 개수를 확인해 주세요(9개 이하)" });
  return out;
}

// ── 손상 진단(STD-02 5절)
export const PAINT_LAYERS = { none: "도장 손상 없음", clear: "클리어층만(손톱에 안 걸림)", base: "베이스까지", primer: "프라이머까지", metal: "철판 노출" } as const;
export type PaintLayer = keyof typeof PAINT_LAYERS;
export const isPaintLayer = (s: string): s is PaintLayer => s in PAINT_LAYERS;

export const METHODS = { pdr: "덴트(PDR)", polish: "광택", partial: "부분 판금+도장(블렌딩)", replace: "교환+도장", outsource: "외주 진단 후 결정" } as const;
/** 차 그림에서 수리 방법을 나타내는 색(밝은·어두운 화면 모두 읽히는 중간 밝기) */
export const METHOD_COLORS: Record<keyof typeof METHODS, string> = { pdr: "#1f9d6a", polish: "#7fae2a", partial: "#e08a1e", replace: "#d4433b", outsource: "#7a52c7" };
/** 손상 정도(경 1·중 2·심 3): 따로 묻지 않고 크기·깊이·도장 손상·꺾임·파손으로 정한다 */
export function damageSeverity(d: { sizeCm: number | null; depthMm?: number | null; paintLayer: string; crease?: boolean; broken?: boolean; structural?: boolean }): 1 | 2 | 3 {
  if (d.broken || d.structural || d.crease || d.paintLayer === "metal" || (d.sizeCm ?? 0) >= 25) return 3;
  if ((d.sizeCm ?? 0) >= 10 || (d.depthMm ?? 0) >= 5 || d.paintLayer === "primer" || d.paintLayer === "base") return 2;
  return 1;
}
export const SEVERITY_LABEL = { 1: "경", 2: "중", 3: "심" } as const;
export type Method = keyof typeof METHODS;
export const isMethod = (s: string): s is Method => s in METHODS;

/** 진단 칸에서 고르는 손상 종류(도면 기호와 같은 글자) */
export const DAMAGE_KINDS = { D: "찌그러짐", S: "긁힘", C: "깨짐·크랙", R: "부식", W: "휠 긁힘", O: "기타" } as const;

export type DamageFacts = { kind: string; paintLayer: PaintLayer; crease: boolean; broken: boolean; structural: boolean; sizeCm: number | null };

/**
 * 수리 방법 판단 기준표(STD-02 5절)를 그대로 옮긴 것. 위에서부터 먼저 맞는 것을 고른다.
 * 1 구조 의심 → 외주 진단, 2 찢어짐·파손·넓은 변형 → 교환, 3 클리어층만 긁힘 → 광택,
 * 4 도장 균열 없고 꺾임 없는 찌그러짐 → 덴트, 5 그 밖(베이스·프라이머까지, 작은 찌그러짐) → 부분 판금+도장
 */
export function suggestMethod(f: DamageFacts): { method: Method; why: string } {
  if (f.structural) return { method: "outsource", why: "보강재·프레임 손상 의심이나 간격 틀어짐은 외주 진단(STD-07) 후 결정합니다" };
  if (f.broken) return { method: "replace", why: "찢어짐·플라스틱 파손은 교환+도장이 우선입니다" };
  if (f.sizeCm != null && f.sizeCm >= 40 && f.kind === "D") return { method: "replace", why: "넓은 변형(40cm 이상)은 복원보다 교환이 나은지 먼저 봅니다" };
  if (f.kind === "S" && (f.paintLayer === "clear" || f.paintLayer === "none")) return { method: "polish", why: "클리어층만 긁혔으면(손톱에 안 걸림) 광택이 우선입니다" };
  if (f.kind === "D" && f.paintLayer === "none" && !f.crease) return { method: "pdr", why: "도장 균열이 없고 날카로운 꺾임이 없으면 덴트(PDR)가 우선입니다" };
  if (f.kind === "W") return { method: "partial", why: "휠 긁힘은 휠 수리(외주 포함)로 처리합니다. 부분 수리로 두고 메모에 적습니다" };
  return { method: "partial", why: "베이스·프라이머까지 손상되었거나 꺾임이 있는 작은 찌그러짐은 부분 판금+도장(블렌딩)입니다" };
}

/** 센서·카메라·레이더가 있는 부위: 수리 뒤 보정 필요(STD-02 5절). 차량 수리 사양(veh.options)으로 판단 */
export function needsCalibration(part: string, options: string[]): string | null {
  const has = (o: string) => options.includes(o);
  if ((part === "f_bumper" || part === "grille") && (has("radar_front") || has("pdc_front") || has("svm"))) return "전방 레이더·센서·카메라";
  if (part === "r_bumper" && (has("pdc_rear") || has("bsd") || has("svm"))) return "후방 센서·후측방 레이더·카메라";
  if ((part === "l_mirror" || part === "r_mirror") && (has("svm") || has("bsd"))) return "사이드미러 카메라·경고등";
  if ((part === "l_quarter" || part === "r_quarter") && has("bsd")) return "후측방 레이더(BSD)";
  if (part === "windshield") return "전방 카메라(차선 유지 등) — 장착 차량이면";
  return null;
}

/** 도막 두께 문자열("95, 102 110") → 숫자 목록 */
export function parseFilm(s: string): number[] {
  return (s.match(/\d+/g) ?? []).map(Number).filter((n) => n > 0 && n < 5000).slice(0, 12);
}

/** 재도장 이력: 하나라도 기준(μm)을 넘으면 */
export const repainted = (vals: number[], limit: number) => vals.some((v) => v > limit);

export type DiagLine = { part: string; method: string; filmPanel: number[]; filmAdjacent: number[]; suggested: string; methodReason: string | null };

/** 진단 확인(공장장) 전에 빠진 것 */
export function diagnosisIssues(lines: DiagLine[]): Issue[] {
  const out: Issue[] = [];
  if (!lines.length) out.push({ field: "lines", msg: "진단한 손상이 없습니다. 수리할 부위를 하나 이상 넣어야 합니다" });
  for (const l of lines) {
    const name = partLabel(l.part);
    if (l.method !== "polish" && l.method !== "outsource" && (l.filmPanel.length < 3 || l.filmAdjacent.length < 3)) out.push({ field: "lines", msg: `${name}: 도막 두께를 손상 패널·인접 패널 각 3곳 이상 재어야 합니다` });
    if (l.method !== l.suggested && !l.methodReason?.trim()) out.push({ field: "lines", msg: `${name}: 기준표 제안과 다른 방법을 골랐으면 사유를 적어야 합니다` });
  }
  return out;
}
