// 차량 전개도(차형 5종): 앞·뒤·위·왼쪽·오른쪽 다섯 면을 펼친 그림과 부위 구역, 부위 안 3×3 칸.
// 화면(car-map.tsx)과 서버(입고 도면·진단 줄 검사)가 같이 쓰므로 DB·브라우저를 부르지 않는다.
// 그림은 실제 차 도면(GetOutlines 무료 도면, CC BY 4.0)을 선화로 바꾼 것이다(엠블럼은 지움). 부위 경계는 거칠게 잡고 실루엣으로 잘라 곡선이 되게 한다.
import { type ArtView, CAR_ART } from "./car-art-data";

export const VIEWS = ["right", "top", "left", "front", "rear"] as const;
export type View = (typeof VIEWS)[number];
export const isView = (s: string): s is View => (VIEWS as readonly string[]).includes(s);

export const VIEW_LABEL: Record<View, string> = {
  right: "오른쪽 옆",
  top: "위에서 본 모습",
  left: "왼쪽 옆",
  front: "앞모습",
  rear: "뒷모습",
};
/** 그림 위 안내(좌우 혼동 방지) */
export const VIEW_HINT: Record<View, string> = {
  right: "차 앞이 오른쪽",
  top: "앞이 왼쪽, 위쪽이 차 오른쪽",
  left: "차 앞이 왼쪽",
  front: "그림 왼쪽이 차 오른쪽",
  rear: "그림 왼쪽이 차 왼쪽",
};

/** 부위 목록. id 는 예전 도면과 같다(저장된 진단 줄·견적이 그대로 읽힘). 사이드실부터는 전개도에서, 적재함은 화물차 그림에서 새로 생긴 부위 */
export const BODY_PARTS: { id: string; label: string }[] = [
  { id: "f_bumper", label: "앞범퍼" },
  { id: "hood", label: "후드" },
  { id: "windshield", label: "앞유리" },
  { id: "roof", label: "지붕" },
  { id: "rear_glass", label: "뒷유리" },
  { id: "trunk", label: "트렁크·테일게이트" },
  { id: "r_bumper", label: "뒷범퍼" },
  { id: "l_f_fender", label: "왼쪽 앞펜더" },
  { id: "l_f_door", label: "왼쪽 앞도어" },
  { id: "l_r_door", label: "왼쪽 뒷도어" },
  { id: "l_quarter", label: "왼쪽 뒤펜더(쿼터)" },
  { id: "r_f_fender", label: "오른쪽 앞펜더" },
  { id: "r_f_door", label: "오른쪽 앞도어" },
  { id: "r_r_door", label: "오른쪽 뒷도어" },
  { id: "r_quarter", label: "오른쪽 뒤펜더(쿼터)" },
  { id: "l_mirror", label: "왼쪽 사이드미러" },
  { id: "r_mirror", label: "오른쪽 사이드미러" },
  { id: "l_f_wheel", label: "왼쪽 앞바퀴" },
  { id: "r_f_wheel", label: "오른쪽 앞바퀴" },
  { id: "l_r_wheel", label: "왼쪽 뒷바퀴" },
  { id: "r_r_wheel", label: "오른쪽 뒷바퀴" },
  { id: "l_sill", label: "왼쪽 사이드실" },
  { id: "r_sill", label: "오른쪽 사이드실" },
  { id: "l_headlamp", label: "왼쪽 헤드램프" },
  { id: "r_headlamp", label: "오른쪽 헤드램프" },
  { id: "l_taillamp", label: "왼쪽 리어램프" },
  { id: "r_taillamp", label: "오른쪽 리어램프" },
  { id: "grille", label: "그릴" },
  // 화물차 적재함
  { id: "l_bed", label: "왼쪽 적재함 옆판" },
  { id: "r_bed", label: "오른쪽 적재함 옆판" },
  { id: "bed_gate", label: "적재함 뒷문" },
  { id: "bed_floor", label: "적재함 바닥" },
];
export const isPart = (id: string) => BODY_PARTS.some((p) => p.id === id);
export const partLabel = (id: string) => BODY_PARTS.find((p) => p.id === id)?.label ?? id;

/**
 * 세부 부위: 그림 칸보다 잘게 나뉜 부품. 고르지 않아도 되고, 목록에 없으면 직접 적는다.
 * 고르면 진단 줄과 견적 줄 이름에 붙는다(예: 앞범퍼(하단 스포일러) 판금).
 */
const SUB = {
  bumperF: ["범퍼 커버", "하단 스포일러(립)", "그릴 몰딩", "안개등 커버", "범퍼 레일·브래킷"],
  bumperR: ["범퍼 커버", "디퓨저(하단)", "반사판", "범퍼 레일·브래킷"],
  door: ["도어 외판", "도어 손잡이", "도어 몰딩", "창틀(벨트) 몰딩"],
  fender: ["펜더 패널", "휠 아치 몰딩", "사이드 리피터"],
  quarter: ["쿼터 패널", "휠 아치 몰딩", "주유구 도어", "C필러"],
  sill: ["사이드실(로커) 패널", "사이드 스커트", "사이드 스텝"],
  mirror: ["미러 커버", "미러 유리", "방향지시등"],
  glass: ["유리", "유리 몰딩"],
  lamp: ["램프 렌즈", "램프 하우징"],
  wheel: ["휠 림", "휠 캡", "타이어 옆면"],
};
export const SUB_PARTS: Record<string, string[]> = {
  f_bumper: SUB.bumperF,
  r_bumper: SUB.bumperR,
  hood: ["후드 패널", "후드 몰딩"],
  trunk: ["트렁크 리드", "리어 스포일러", "번호판 가니시", "엠블럼"],
  roof: ["지붕 패널", "루프랙", "선루프 주변", "루프 몰딩"],
  windshield: SUB.glass,
  rear_glass: SUB.glass,
  grille: ["그릴", "엠블럼"],
  l_bed: ["적재함 옆판(측판)", "옆판 기둥", "로프 고리", "적재함 몰딩"],
  r_bed: ["적재함 옆판(측판)", "옆판 기둥", "로프 고리", "적재함 몰딩"],
  bed_gate: ["뒷문 판", "뒷문 잠금 고리", "뒷문 경첩"],
  bed_floor: ["바닥판", "바닥 보강재", "적재함 덮개"],
  ...Object.fromEntries(
    ["l", "r"].flatMap((s) => [
      [`${s}_f_door`, SUB.door],
      [`${s}_r_door`, SUB.door],
      [`${s}_f_fender`, SUB.fender],
      [`${s}_quarter`, SUB.quarter],
      [`${s}_sill`, SUB.sill],
      [`${s}_mirror`, SUB.mirror],
      [`${s}_headlamp`, SUB.lamp],
      [`${s}_taillamp`, SUB.lamp],
      [`${s}_f_wheel`, SUB.wheel],
      [`${s}_r_wheel`, SUB.wheel],
    ]),
  ),
};

// ── 손상 기호와 부위 ────────────────────────────────
// 기호 D 찌그러짐·S 긁힘·C 깨짐·크랙·R 부식·W 휠 긁힘(O 수리 대상은 어디든). 대표 지적 2026-11-19: 휠 긁힘이 아무 데나 찍힘
/** 바퀴(휠) 부위인가 */
export const isWheel = (part: string) => part.endsWith("_wheel");
/** 유리·램프(유리·플라스틱 렌즈): 찌그러짐·부식은 없고 깨짐·긁힘만 */
export const isGlassy = (part: string) => /^(windshield|rear_glass|[lr]_(head|tail)lamp)$/.test(part);
/**
 * 이 부위에 찍을 기호. 바퀴에 '긁힘'을 고르면 '휠 긁힘'으로 바꾸고, 맞지 않는 짝(휠 긁힘을 차체에, 찌그러짐·부식을 유리·램프에)은 null.
 */
export function kindFit<K extends string>(part: string, kind: K): K | "W" | null {
  if (kind === "O") return kind;
  if (isWheel(part)) return kind === "S" ? "W" : kind;
  if (kind === "W") return null;
  if (isGlassy(part) && (kind === "D" || kind === "R")) return null;
  return kind;
}
/** 기호를 찍을 수 없는 까닭(화면 안내) */
export function kindWhy(kind: string): string {
  if (kind === "W") return "휠 긁힘은 바퀴(휠)에만 찍을 수 있습니다";
  if (kind === "D" || kind === "R") return `${kind === "D" ? "찌그러짐" : "부식"}은 유리·램프에 찍을 수 없습니다(깨짐·크랙이나 긁힘을 고르세요)`;
  return "이 부위에는 찍을 수 없는 손상입니다";
}

/** 부위 이름 + 세부 부위: '앞범퍼(하단 스포일러)' */
export const partName = (part: string, sub?: string | null) => (sub ? `${partLabel(part)}(${sub})` : partLabel(part));

// ── 그림 ─────────────────────────────────────────────

/** 차형. 그림(실루엣·부위 경계)이 차형마다 다르고, 부위 id 는 같이 쓴다(화물차만 적재함 부위가 있음) */
export const BODY_TYPES = { sedan: "세단", hatch: "해치백·왜건", suv: "SUV", van: "승합·미니밴", truck: "소형 화물(1톤)" } as const;
export type BodyType = keyof typeof BODY_TYPES;
export const isBodyType = (s: string | null | undefined): s is BodyType => !!s && s in BODY_TYPES;

/** 차종 이름 → 차형(흔한 국산·수입 모델). 모르면 null(세단으로 그림) */
const MODEL_BODY: [RegExp, BodyType][] = [
  [/포터|봉고|라보|마이티|트럭|화물|픽업|무쏘|렉스턴\s*스포츠|코란도\s*스포츠|타스만|콜로라도|레인저|타코마|프론티어/i, "truck"],
  [/스타리아|스타렉스|카니발|쏠라티|그랜드\s*스타렉스|코란도\s*투리스모|로디우스|트라제|오딧세이|시에나|알파드|마스터|스프린터|PV5/i, "van"],
  [/싼타페|투싼|팰리세이드|코나|베뉴|넥쏘|아이오닉\s*5|아이오닉\s*9|캐스퍼|쏘렌토|스포티지|모하비|셀토스|니로|EV3|EV5|EV6|EV9|쏘울|토레스|렉스턴|코란도|티볼리|액티언|QM6|그랑\s*콜레오스|XM3|아르카나|트레일블레이저|트랙스|이쿼녹스|트래버스|타호|GV60|GV70|GV80|X[1-7]\b|GL[ABCES]|Q[2-8]\b|XC[4-9]0|RAV4|CR-?V|티구안|투아렉|레인지로버|디스커버리|랭글러|체로키|모델\s*[YX]/i, "suv"],
  [/i30|i40|벨로스터|프라이드|모닝|레이|스파크|클리오|골프|폴로|미니|프리우스|모델\s*3P|아이오닉(?!\s*[569])|왜건|투어링|에스테이트|슈팅브레이크/i, "hatch"],
];
export function bodyGuess(model: string | null | undefined): BodyType | null {
  const m = (model ?? "").trim();
  if (!m) return null;
  return MODEL_BODY.find(([re]) => re.test(m))?.[1] ?? null;
}
/** 차량 기록 → 그릴 차형: 직접 고른 것, 없으면 차종 이름으로 짐작, 그래도 모르면 세단 */
export const bodyOf = (v: { bodyType?: string | null; model?: string | null } | null | undefined): BodyType => (isBodyType(v?.bodyType) ? v.bodyType : bodyGuess(v?.model)) ?? "sedan";
/** 그림에 그리는 부착물(차량 수리 사양 키) */
export const ATTACH_OPTIONS = ["spoiler", "side_step", "roof_rack", "sunroof"];
/** 그림에 그리지 않는 부착물은 그림 위에 이름표로 알린다 */
export const ATTACH_LABEL: Record<string, string> = { spoiler: "스포일러", side_step: "사이드 스텝", roof_rack: "루프랙", sunroof: "선루프" };
/** 차 그림에 넘기는 차량 모양: 차형 + 부착물 */
export type CarLook = { body: BodyType; attach: string[] };
export const carOf = (v: { bodyType?: string | null; model?: string | null; options?: string[] | null } | null | undefined): CarLook => ({
  body: bodyOf(v),
  attach: (v?.options ?? []).filter((o) => ATTACH_OPTIONS.includes(o)),
});

/** 부위 구역 하나. d=경계(실루엣으로 잘림), box=3×3 칸을 나누는 사각형[x,y,w,h], clip=false 면 실루엣 밖으로 나오는 것(미러·바퀴), look=칠 모양(유리·램프·그릴) */
export type Shape = { part: string; d: string; box: [number, number, number, number]; clip?: boolean; look?: "glass" | "lamp" | "tail" | "grille" };
export type ViewDef = { view: View; x: number; y: number; w: number; h: number; flip?: boolean; silhouette: string; shapes: Shape[]; art: ViewArt };

/** 차 그림(선화) 한 면: 면 좌표 안 위치 */
export type ViewArt = { img: string; x: number; y: number; w: number; h: number };

// 차형별 그림과 부위 구역은 car-art-data.ts(도면에서 자동 생성)에 있다.
const sideShapes = (shapes: Shape[], s: "l" | "r") => shapes.map((x) => (x.part.startsWith("s_") ? { ...x, part: `${s}_${x.part.slice(2)}` } : x));

/** 전체 그림 960×620 안의 다섯 면 위치 */
export const MAP_W = 960;
export const MAP_H = 620;
const defsCache = new Map<BodyType, ViewDef[]>();
export function viewDefsOf(body: BodyType = "sedan"): ViewDef[] {
  const hit = defsCache.get(body);
  if (hit) return hit;
  const b = CAR_ART[body];
  const art = (a: ArtView): ViewArt => ({ img: a.img, x: a.x, y: a.y, w: a.w, h: a.h });
  const defs: ViewDef[] = [
    { view: "right", x: 250, y: 30, w: 470, h: 170, flip: true, silhouette: b.side.sil, shapes: sideShapes(b.side.shapes, "r"), art: art(b.side) },
    { view: "top", x: 250, y: 228, w: 470, h: 200, silhouette: b.top.sil, shapes: b.top.shapes, art: art(b.top) },
    { view: "left", x: 250, y: 446, w: 470, h: 170, silhouette: b.side.sil, shapes: sideShapes(b.side.shapes, "l"), art: art(b.side) },
    { view: "front", x: 24, y: 244, w: 200, h: 170, silhouette: b.front.sil, shapes: b.front.shapes, art: art(b.front) },
    { view: "rear", x: 736, y: 244, w: 200, h: 170, silhouette: b.rear.sil, shapes: b.rear.shapes, art: art(b.rear) },
  ];
  defsCache.set(body, defs);
  return defs;
}
/** 세단 그림(예전 이름) */
export const VIEW_DEFS: ViewDef[] = viewDefsOf("sedan");
export const viewDef = (v: View, body: BodyType = "sedan") => viewDefsOf(body).find((d) => d.view === v)!;

/** 이 차형 그림에 나오는 부위(목록 고르기용) */
export const partsOf = (body: BodyType = "sedan") => BODY_PARTS.filter((p) => viewDefsOf(body).some((v) => v.shapes.some((s) => s.part === p.id)));

/** 부위가 나오는 면(처음 것이 대표 면). 차형을 안 주면 어느 차형에든 나오는 면(저장 값 검사용) */
export function viewsOf(part: string, body?: BodyType): View[] {
  const order: View[] = part.startsWith("l_") ? ["left", "top", "front", "rear"] : part.startsWith("r_") && part !== "r_bumper" ? ["right", "top", "front", "rear"] : ["top", "front", "rear", "left", "right"];
  const bodies = body ? [body] : (Object.keys(CAR_ART) as BodyType[]);
  return order.filter((v) => bodies.some((b) => viewDef(v, b).shapes.some((s) => s.part === part)));
}
/** 부위 모양. 차형을 안 주면 세단부터 찾아 처음 나오는 것 */
export function shapeOf(view: View, part: string, body?: BodyType): Shape | null {
  const bodies = body ? [body] : (Object.keys(CAR_ART) as BodyType[]);
  for (const b of bodies) {
    const s = viewDef(view, b).shapes.find((x) => x.part === part);
    if (s) return s;
  }
  return null;
}

// ── 3×3 칸 ───────────────────────────────────────────
/** 칸 번호 0~8: 줄(위→아래) × 열(그림 왼쪽→오른쪽). 면마다 줄·열 이름이 다르다 */
const AXES: Record<View, { rows: [string, string, string]; cols: [string, string, string] }> = {
  left: { rows: ["위", "가운데", "아래"], cols: ["앞", "가운데", "뒤"] },
  right: { rows: ["위", "가운데", "아래"], cols: ["앞", "가운데", "뒤"] },
  top: { rows: ["오른쪽", "가운데", "왼쪽"], cols: ["앞", "가운데", "뒤"] },
  front: { rows: ["위", "가운데", "아래"], cols: ["차 오른쪽", "가운데", "차 왼쪽"] },
  rear: { rows: ["위", "가운데", "아래"], cols: ["차 왼쪽", "가운데", "차 오른쪽"] },
};
export const CELLS = [0, 1, 2, 3, 4, 5, 6, 7, 8] as const;
export function cellLabel(view: View, cell: number): string {
  const r = AXES[view].rows[Math.floor(cell / 3)];
  const c = AXES[view].cols[cell % 3];
  if (r === "가운데" && c === "가운데") return "정가운데";
  return `${r} ${c}`;
}
/** 고른 칸 이름. 없거나 다 고르면 '전체' */
export function cellsLabel(view: View | null | undefined, cells: number[]): string {
  if (!view || !cells.length || cells.length >= 9) return "전체";
  return cells.map((c) => cellLabel(view, c)).join("·");
}
/** 면 좌표(뒤집기 전) → 칸 */
export function cellAt(box: [number, number, number, number], x: number, y: number): number {
  const [bx, by, bw, bh] = box;
  const col = Math.min(2, Math.max(0, Math.floor(((x - bx) / bw) * 3)));
  const row = Math.min(2, Math.max(0, Math.floor(((y - by) / bh) * 3)));
  return row * 3 + col;
}
export const cellRect = (box: [number, number, number, number], cell: number) => {
  const [bx, by, bw, bh] = box;
  return { x: bx + (bw * (cell % 3)) / 3, y: by + (bh * Math.floor(cell / 3)) / 3, w: bw / 3, h: bh / 3 };
};
export function cleanCells(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n <= 8))].sort((a, b) => a - b);
}
/** "2,5,8" → [2,5,8] */
export const parseCells = (s: string) => cleanCells(s.split(/[^\d]+/).filter(Boolean));

// ── 예전 도면(위에서 본 네모 21칸, 가로 200 × 세로 400, 앞이 위) ─────
const LEGACY: { id: string; x: number; y: number; w: number; h: number }[] = [
  { id: "f_bumper", x: 40, y: 8, w: 120, h: 22 },
  { id: "hood", x: 48, y: 32, w: 104, h: 70 },
  { id: "windshield", x: 52, y: 104, w: 96, h: 30 },
  { id: "roof", x: 54, y: 136, w: 92, h: 120 },
  { id: "rear_glass", x: 52, y: 258, w: 96, h: 28 },
  { id: "trunk", x: 48, y: 288, w: 104, h: 64 },
  { id: "r_bumper", x: 40, y: 354, w: 120, h: 22 },
  { id: "l_f_fender", x: 22, y: 34, w: 24, h: 74 },
  { id: "l_f_door", x: 22, y: 110, w: 30, h: 82 },
  { id: "l_r_door", x: 22, y: 194, w: 30, h: 76 },
  { id: "l_quarter", x: 22, y: 272, w: 24, h: 78 },
  { id: "r_f_fender", x: 154, y: 34, w: 24, h: 74 },
  { id: "r_f_door", x: 148, y: 110, w: 30, h: 82 },
  { id: "r_r_door", x: 148, y: 194, w: 30, h: 76 },
  { id: "r_quarter", x: 154, y: 272, w: 24, h: 78 },
  { id: "l_mirror", x: 4, y: 108, w: 16, h: 14 },
  { id: "r_mirror", x: 180, y: 108, w: 16, h: 14 },
  { id: "l_f_wheel", x: 6, y: 52, w: 14, h: 40 },
  { id: "r_f_wheel", x: 180, y: 52, w: 14, h: 40 },
  { id: "l_r_wheel", x: 6, y: 290, w: 14, h: 40 },
  { id: "r_r_wheel", x: 180, y: 290, w: 14, h: 40 },
];
/** 예전 도면 좌표 → 부위·면·칸. 앞뒤(세로)는 열, 좌우(가로)는 위에서 본 모습의 줄로 옮긴다 */
export function fromLegacy(x: number, y: number): { part: string; view: View; cell: number } | null {
  const hit = LEGACY.find((p) => x >= p.x && x <= p.x + p.w && y >= p.y && y <= p.y + p.h);
  if (!hit) return null;
  const col = Math.min(2, Math.floor(((y - hit.y) / hit.h) * 3));
  const view = viewsOf(hit.id)[0];
  // 옆모습은 높이를 알 수 없어 가운데 줄, 위에서 본 모습은 그림 왼쪽(차 왼쪽)을 아래 줄로
  const row = view === "top" ? 2 - Math.min(2, Math.floor(((x - hit.x) / hit.w) * 3)) : 1;
  return { part: hit.id, view, cell: row * 3 + col };
}
