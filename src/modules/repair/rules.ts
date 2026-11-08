// 입고 점검(F-02-01) 규칙 — 서버와 화면(저장 전 점검)이 같이 쓴다. 사내 표준서 STD-02 4절.
// 화면에서도 불러오므로 DB 스키마를 가져오지 않는다(스키마가 여기 값을 쓴다).

/** 사진 자리: 8방향 + 계기판 + 도어 라벨(색상 코드) + 손상 근접·기타 */
export const PHOTO_SLOTS = ["front", "front_left", "left", "rear_left", "rear", "rear_right", "right", "front_right", "dash", "label", "close", "other"] as const;
export type PhotoSlot = (typeof PHOTO_SLOTS)[number];

/** 차체 도면 표시: x·y 는 도면 좌표(가로 200 × 세로 400), kind O=수리 대상, D=찌그러짐, S=긁힘, C=깨짐·크랙, R=부식, W=휠 */
export type BodyMark = { x: number; y: number; part: string; kind: "O" | "D" | "S" | "C" | "R" | "W"; note?: string };

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

/** 차체 도면의 부위(위에서 본 모습, 앞이 위). x·y·w·h 는 도면 좌표(가로 200 × 세로 400) */
export const BODY_PARTS: { id: string; label: string; x: number; y: number; w: number; h: number; round?: boolean }[] = [
  { id: "f_bumper", label: "앞범퍼", x: 40, y: 8, w: 120, h: 22 },
  { id: "hood", label: "후드", x: 48, y: 32, w: 104, h: 70 },
  { id: "windshield", label: "앞유리", x: 52, y: 104, w: 96, h: 30 },
  { id: "roof", label: "지붕", x: 54, y: 136, w: 92, h: 120 },
  { id: "rear_glass", label: "뒷유리", x: 52, y: 258, w: 96, h: 28 },
  { id: "trunk", label: "트렁크·테일게이트", x: 48, y: 288, w: 104, h: 64 },
  { id: "r_bumper", label: "뒷범퍼", x: 40, y: 354, w: 120, h: 22 },
  { id: "l_f_fender", label: "왼쪽 앞펜더", x: 22, y: 34, w: 24, h: 74 },
  { id: "l_f_door", label: "왼쪽 앞도어", x: 22, y: 110, w: 30, h: 82 },
  { id: "l_r_door", label: "왼쪽 뒷도어", x: 22, y: 194, w: 30, h: 76 },
  { id: "l_quarter", label: "왼쪽 뒤펜더(쿼터)", x: 22, y: 272, w: 24, h: 78 },
  { id: "r_f_fender", label: "오른쪽 앞펜더", x: 154, y: 34, w: 24, h: 74 },
  { id: "r_f_door", label: "오른쪽 앞도어", x: 148, y: 110, w: 30, h: 82 },
  { id: "r_r_door", label: "오른쪽 뒷도어", x: 148, y: 194, w: 30, h: 76 },
  { id: "r_quarter", label: "오른쪽 뒤펜더(쿼터)", x: 154, y: 272, w: 24, h: 78 },
  { id: "l_mirror", label: "왼쪽 사이드미러", x: 4, y: 108, w: 16, h: 14, round: true },
  { id: "r_mirror", label: "오른쪽 사이드미러", x: 180, y: 108, w: 16, h: 14, round: true },
  { id: "l_f_wheel", label: "왼쪽 앞바퀴", x: 6, y: 52, w: 14, h: 40, round: true },
  { id: "r_f_wheel", label: "오른쪽 앞바퀴", x: 180, y: 52, w: 14, h: 40, round: true },
  { id: "l_r_wheel", label: "왼쪽 뒷바퀴", x: 6, y: 290, w: 14, h: 40, round: true },
  { id: "r_r_wheel", label: "오른쪽 뒷바퀴", x: 180, y: 290, w: 14, h: 40, round: true },
];
export const partLabel = (id: string) => BODY_PARTS.find((p) => p.id === id)?.label ?? id;

/** 도면 좌표 → 부위 */
export function partAt(x: number, y: number): string | null {
  const hit = BODY_PARTS.find((p) => x >= p.x && x <= p.x + p.w && y >= p.y && y <= p.y + p.h);
  return hit?.id ?? null;
}

export function cleanMarks(raw: unknown): BodyMark[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((m): m is BodyMark => !!m && typeof m === "object" && typeof m.x === "number" && typeof m.y === "number" && typeof m.kind === "string" && isMarkKind(m.kind))
    .slice(0, 80)
    .map((m) => ({ x: Math.max(0, Math.min(200, Math.round(m.x))), y: Math.max(0, Math.min(400, Math.round(m.y))), kind: m.kind, part: partAt(m.x, m.y) ?? String(m.part ?? "기타").slice(0, 30), ...(m.note ? { note: String(m.note).slice(0, 100) } : {}) }));
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
