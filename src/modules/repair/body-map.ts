// 차량 전개도(세단): 앞·뒤·위·왼쪽·오른쪽 다섯 면을 펼친 그림과 부위 구역, 부위 안 3×3 칸.
// 화면(car-map.tsx)과 서버(입고 도면·진단 줄 검사)가 같이 쓰므로 DB·브라우저를 부르지 않는다.
// 그림은 직접 그린 일반 실루엣이다(특정 차종·엠블럼 없음). 부위 경계는 거칠게 잡고 실루엣으로 잘라 곡선이 되게 한다.

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

/** 부위 목록. id 는 예전 도면과 같다(저장된 진단 줄·견적이 그대로 읽힘). 뒤 8개는 전개도에서 새로 생긴 부위 */
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

/** 부위 이름 + 세부 부위: '앞범퍼(하단 스포일러)' */
export const partName = (part: string, sub?: string | null) => (sub ? `${partLabel(part)}(${sub})` : partLabel(part));

// ── 그림 ─────────────────────────────────────────────

/** 부위 구역 하나. d=경계(실루엣으로 잘림), box=3×3 칸을 나누는 사각형[x,y,w,h], clip=false 면 실루엣 밖으로 나오는 것(미러·바퀴), look=칠 모양(유리·램프·그릴) */
export type Shape = { part: string; d: string; box: [number, number, number, number]; clip?: boolean; look?: "glass" | "lamp" | "tail" | "grille" };
export type ViewDef = { view: View; x: number; y: number; w: number; h: number; flip?: boolean; silhouette: string; shapes: Shape[] };

const circle = (cx: number, cy: number, r: number) => `M${cx - r},${cy} a${r},${r} 0 1,0 ${r * 2},0 a${r},${r} 0 1,0 ${-r * 2},0 Z`;
/** 경로의 "x,y" 쌍을 바꾼다(M·L·Q·C 절대 좌표만 쓰는 경로) */
const mapPts = (d: string, f: (x: number, y: number) => [number, number]) =>
  d.replace(/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g, (_, x, y) => f(Number(x), Number(y)).join(","));

// 옆모습(앞이 왼쪽, 470×170). 오른쪽 옆은 좌우를 뒤집어 그린다.
export const SIDE_SILHOUETTE =
  "M14,128 C6,124 4,104 8,92 C10,82 18,76 34,74 C80,70 130,66 166,62 C190,46 208,30 232,22 C262,14 300,14 330,20 C352,30 372,50 392,60 C415,62 438,62 448,68 C456,80 456,104 450,124 L440,130 L412,130 A40,40 0 0 0 332,130 L132,130 A40,40 0 0 0 52,130 L24,130 Q16,130 14,128 Z";
const side = (s: "l" | "r"): Shape[] => [
  { part: "f_bumper", d: "M0,0 L40,0 L40,70 Q44,100 54,128 L54,170 L0,170 Z", box: [6, 74, 46, 56] },
  { part: `${s}_f_fender`, d: "M40,0 L166,0 L166,116 L132,116 L132,170 L54,170 L54,128 Q44,100 40,70 Z", box: [40, 62, 126, 68] },
  { part: `${s}_f_door`, d: "M166,0 L272,0 L272,116 L166,116 Z", box: [166, 18, 106, 98] },
  { part: `${s}_r_door`, d: "M272,0 L332,0 L346,40 Q350,80 336,116 L272,116 Z", box: [272, 16, 76, 100] },
  { part: `${s}_quarter`, d: "M332,0 L470,0 L470,62 L444,62 Q430,100 412,130 L412,170 L336,170 L336,116 Q350,80 346,40 Z", box: [334, 18, 112, 112] },
  { part: "r_bumper", d: "M444,62 L470,62 L470,170 L412,170 L412,130 Q430,100 444,62 Z", box: [414, 64, 42, 66] },
  { part: `${s}_sill`, d: "M132,116 L336,116 L336,170 L132,170 Z", box: [132, 116, 200, 14] },
  { part: `${s}_mirror`, d: "M176,60 C176,52 190,48 204,50 C208,51 209,60 206,64 C198,67 184,67 176,64 Z", box: [176, 49, 33, 18], clip: false },
  { part: `${s}_f_wheel`, d: circle(92, 132, 30), box: [62, 102, 60, 60], clip: false },
  { part: `${s}_r_wheel`, d: circle(372, 132, 30), box: [342, 102, 60, 60], clip: false },
];
/** 옆모습 꾸밈(누르지 않음): 옆 유리, 램프, 손잡이, 캐릭터 라인 */
export const SIDE_DECOR = {
  glass: ["M178,62 C192,46 210,32 234,26 L268,24 L268,62 Z", "M276,24 L318,24 C330,30 340,42 343,52 L343,62 L276,62 Z", "M350,42 C362,50 372,56 382,62 L350,62 Z"],
  headlamp: "M10,92 C14,83 25,78 42,77 L46,86 C34,88 22,90 10,95 Z",
  taillamp: "M440,67 L452,71 L455,86 L441,84 Z",
  handles: [
    [236, 72],
    [312, 72],
  ] as [number, number][],
  line: "M42,90 C150,86 300,84 448,82",
  wheels: [
    [92, 132],
    [372, 132],
  ] as [number, number][],
};

// 위에서 본 모습(앞이 왼쪽, 위쪽이 차 오른쪽, 470×200)
export const TOP_SILHOUETTE =
  "M30,24 C14,32 6,62 6,100 C6,138 14,168 30,176 C140,188 330,188 432,178 C448,172 458,140 458,100 C458,60 448,28 432,22 C330,12 140,12 30,24 Z";
const flipY = (sh: Shape, part: string): Shape => {
  const [x, y, w, h] = sh.box;
  return { ...sh, part, d: mapPts(sh.d, (px, py) => [px, 200 - py]), box: [x, 200 - y - h, w, h] };
};
const topRight: Shape[] = [
  { part: "r_f_fender", d: "M44,0 L166,0 L166,32 L40,32 Z", box: [40, 16, 126, 16] },
  { part: "r_f_door", d: "M166,0 L272,0 L272,36 L232,36 L166,32 Z", box: [166, 14, 106, 21] },
  { part: "r_r_door", d: "M272,0 L336,0 L336,36 L272,36 Z", box: [272, 14, 64, 22] },
  { part: "r_quarter", d: "M336,0 L444,0 L444,32 L388,34 L336,36 Z", box: [336, 14, 108, 21] },
  { part: "r_mirror", d: "M186,17 C186,8 190,3 198,3 C206,3 210,8 210,17 Z", box: [186, 3, 24, 14], clip: false },
];
const TOP: Shape[] = [
  { part: "f_bumper", d: "M0,0 L44,0 L40,32 Q30,100 40,168 L44,200 L0,200 Z", box: [6, 24, 36, 152] },
  { part: "hood", d: "M40,32 L166,32 Q174,100 166,168 L40,168 Q30,100 40,32 Z", box: [36, 32, 134, 136] },
  { part: "windshield", d: "M166,32 L232,36 Q240,100 232,164 L166,168 Q174,100 166,32 Z", box: [168, 34, 68, 132], look: "glass" },
  { part: "roof", d: "M232,36 L330,36 Q336,100 330,164 L232,164 Q240,100 232,36 Z", box: [236, 36, 96, 128] },
  { part: "rear_glass", d: "M330,36 L388,34 Q380,100 388,166 L330,164 Q336,100 330,36 Z", box: [332, 35, 52, 130], look: "glass" },
  { part: "trunk", d: "M388,34 L444,32 Q452,100 444,168 L388,166 Q380,100 388,34 Z", box: [384, 33, 64, 134] },
  { part: "r_bumper", d: "M444,0 L470,0 L470,200 L444,200 L444,168 Q452,100 444,32 Z", box: [440, 26, 18, 148] },
  ...topRight,
  ...topRight.map((s) => flipY(s, s.part.replace(/^r_/, "l_"))),
];

// 앞·뒷모습(200×170)
export const END_SILHOUETTE =
  "M24,150 C14,148 10,140 10,128 L12,96 C14,84 24,76 40,72 C52,46 66,30 100,28 C134,30 148,46 160,72 C176,76 186,84 188,96 L190,128 C190,140 186,148 176,150 Z";
const flipX = (sh: Shape, part: string): Shape => {
  const [x, y, w, h] = sh.box;
  return { ...sh, part, d: mapPts(sh.d, (px, py) => [200 - px, py]), box: [200 - x - w, y, w, h] };
};
const endMirror: Shape = { part: "", d: "M2,76 C2,69 10,66 18,68 L22,80 C14,83 6,83 2,79 Z", box: [2, 66, 20, 17], clip: false };
const FRONT: Shape[] = [
  { part: "windshield", d: "M0,0 L200,0 L200,72 L0,72 Z", box: [44, 30, 112, 42] },
  { part: "hood", d: "M0,72 L200,72 L200,92 L0,92 Z", box: [14, 72, 172, 20] },
  { part: "f_bumper", d: "M0,110 L62,110 L66,116 L134,116 L138,110 L200,110 L200,170 L0,170 Z", box: [10, 110, 180, 40] },
  { part: "r_headlamp", d: "M0,92 L62,92 L60,110 L0,112 Z", box: [12, 92, 50, 20], look: "lamp" },
  { part: "grille", d: "M62,92 L138,92 L134,116 L66,116 Z", box: [62, 92, 76, 24], look: "grille" },
  { part: "l_headlamp", d: "M138,92 L200,92 L200,112 L140,110 Z", box: [138, 92, 50, 20], look: "lamp" },
  { ...endMirror, part: "r_mirror" },
  flipX(endMirror, "l_mirror"),
];
const REAR: Shape[] = [
  { part: "rear_glass", d: "M0,0 L200,0 L200,70 L0,70 Z", box: [44, 30, 112, 40] },
  { part: "trunk", d: "M0,70 L200,70 L200,100 L0,100 Z", box: [14, 70, 172, 30] },
  { part: "r_bumper", d: "M0,100 L200,100 L200,170 L0,170 Z", box: [10, 100, 180, 50] },
  { part: "l_taillamp", d: "M0,82 L56,84 L56,100 L0,104 Z", box: [10, 82, 46, 22], look: "tail" },
  { part: "r_taillamp", d: "M200,82 L144,84 L144,100 L200,104 Z", box: [144, 82, 46, 22], look: "tail" },
  { ...endMirror, part: "l_mirror" },
  flipX(endMirror, "r_mirror"),
];
/** 앞·뒷모습 꾸밈: 유리, 번호판, 바퀴 */
export const END_DECOR = {
  frontGlass: "M48,70 C58,48 72,36 100,34 C128,36 142,48 152,70 Z",
  rearGlass: "M50,68 C60,48 74,38 100,36 C126,38 140,48 150,68 Z",
  plate: [80, 126, 40, 11] as [number, number, number, number],
  tires: [
    [20, 144],
    [154, 144],
  ] as [number, number][],
};

/** 전체 그림 960×620 안의 다섯 면 위치 */
export const MAP_W = 960;
export const MAP_H = 620;
export const VIEW_DEFS: ViewDef[] = [
  { view: "right", x: 250, y: 30, w: 470, h: 170, flip: true, silhouette: SIDE_SILHOUETTE, shapes: side("r") },
  { view: "top", x: 250, y: 228, w: 470, h: 200, silhouette: TOP_SILHOUETTE, shapes: TOP },
  { view: "left", x: 250, y: 446, w: 470, h: 170, silhouette: SIDE_SILHOUETTE, shapes: side("l") },
  { view: "front", x: 24, y: 244, w: 200, h: 170, silhouette: END_SILHOUETTE, shapes: FRONT },
  { view: "rear", x: 736, y: 244, w: 200, h: 170, silhouette: END_SILHOUETTE, shapes: REAR },
];
export const viewDef = (v: View) => VIEW_DEFS.find((d) => d.view === v)!;

/** 부위가 나오는 면(처음 것이 대표 면) */
export function viewsOf(part: string): View[] {
  const order: View[] = part.startsWith("l_") ? ["left", "top", "front", "rear"] : part.startsWith("r_") && part !== "r_bumper" ? ["right", "top", "front", "rear"] : ["top", "front", "rear", "left", "right"];
  return order.filter((v) => viewDef(v).shapes.some((s) => s.part === part));
}
export const shapeOf = (view: View, part: string) => viewDef(view).shapes.find((s) => s.part === part) ?? null;

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
