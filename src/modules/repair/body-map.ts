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
/** 차 그림에 넘기는 차량 모양: 차형 + 부착물 */
export type CarLook = { body: BodyType; attach: string[] };
export const carOf = (v: { bodyType?: string | null; model?: string | null; options?: string[] | null } | null | undefined): CarLook => ({
  body: bodyOf(v),
  attach: (v?.options ?? []).filter((o) => ATTACH_OPTIONS.includes(o)),
});

/** 부위 구역 하나. d=경계(실루엣으로 잘림), box=3×3 칸을 나누는 사각형[x,y,w,h], clip=false 면 실루엣 밖으로 나오는 것(미러·바퀴), look=칠 모양(유리·램프·그릴) */
export type Shape = { part: string; d: string; box: [number, number, number, number]; clip?: boolean; look?: "glass" | "lamp" | "tail" | "grille" };
export type ViewDef = { view: View; x: number; y: number; w: number; h: number; flip?: boolean; silhouette: string; shapes: Shape[] };

const circle = (cx: number, cy: number, r: number) => `M${cx - r},${cy} a${r},${r} 0 1,0 ${r * 2},0 a${r},${r} 0 1,0 ${-r * 2},0 Z`;
/** 경로의 "x,y" 쌍을 바꾼다(M·L·Q·C 절대 좌표만 쓰는 경로) */
const mapPts = (d: string, f: (x: number, y: number) => [number, number]) =>
  d.replace(/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g, (_, x, y) => f(Number(x), Number(y)).join(","));
const flipY = (sh: Shape, part: string): Shape => {
  const [x, y, w, h] = sh.box;
  return { ...sh, part, d: mapPts(sh.d, (px, py) => [px, 200 - py]), box: [x, 200 - y - h, w, h] };
};
const flipX = (sh: Shape, part: string): Shape => {
  const [x, y, w, h] = sh.box;
  return { ...sh, part, d: mapPts(sh.d, (px, py) => [200 - px, py]), box: [200 - x - w, y, w, h] };
};
const mirror = (s: "l" | "r", d: string, box: Shape["box"]): Shape => ({ part: `${s}_mirror`, d, box, clip: false });
const wheels = (s: "l" | "r", fx: number, rx: number): Shape[] => [
  { part: `${s}_f_wheel`, d: circle(fx, 132, 30), box: [fx - 30, 102, 60, 60], clip: false },
  { part: `${s}_r_wheel`, d: circle(rx, 132, 30), box: [rx - 30, 102, 60, 60], clip: false },
];
/** 위에서 본 모습의 오른쪽 가장자리 부위(왼쪽은 위아래로 뒤집어 만든다). k=[앞펜더 시작, 앞도어, 뒷도어, 뒤펜더, 끝] x 좌표 */
function topSides(k: [number, number, number, number, number], mx: number, truck = false): Shape[] {
  const [a, b, c, d, e] = k;
  const right: Shape[] = truck
    ? [
        { part: "r_f_fender", d: `M${a},0 L${b},0 L${b},28 L${a},28 Z`, box: [a, 18, b - a, 12] },
        { part: "r_f_door", d: `M${b},0 L${c},0 L${c},28 L${b},28 Z`, box: [b, 18, c - b, 12] },
        { part: "r_bed", d: `M${d},0 L${e},0 L${e},26 L${d},26 Z`, box: [d, 18, e - d, 10] },
      ]
    : [
        { part: "r_f_fender", d: `M${a},0 L${b},0 L${b},32 L${a - 4},32 Z`, box: [a - 4, 16, b - a + 4, 16] },
        { part: "r_f_door", d: `M${b},0 L${c},0 L${c},36 L${b + 66},36 L${b},32 Z`, box: [b, 14, c - b, 21] },
        { part: "r_r_door", d: `M${c},0 L${d},0 L${d},36 L${c},36 Z`, box: [c, 14, d - c, 22] },
        { part: "r_quarter", d: `M${d},0 L${e},0 L${e},32 L${d + 52},34 L${d},36 Z`, box: [d, 14, e - d, 21] },
      ];
  right.push({ part: "r_mirror", d: `M${mx},17 C${mx},8 ${mx + 4},3 ${mx + 12},3 C${mx + 20},3 ${mx + 24},8 ${mx + 24},17 Z`, box: [mx, 3, 24, 14], clip: false });
  return [...right, ...right.map((s) => flipY(s, s.part.replace(/^r_/, "l_")))];
}
/** 위에서 본 가운데 줄(앞→뒤). xs=[범퍼|후드, 후드|앞유리, 앞유리|지붕, 지붕|뒷유리, 뒷유리|트렁크, 트렁크|뒷범퍼] */
function topCenter(xs: [number, number, number, number, number, number]): Shape[] {
  const [a, b, c, d, e, f] = xs;
  const band = (part: string, x1: number, x2: number, y1: number, look?: Shape["look"]): Shape => ({
    part,
    d: `M${x1},${y1} L${x2},${y1 + 2} Q${x2 + 6},100 ${x2},${200 - y1 - 2} L${x1},${200 - y1} Q${x1 + 6},100 ${x1},${y1} Z`,
    box: [x1 + 2, y1 + 2, x2 - x1, 196 - 2 * y1],
    ...(look ? { look } : {}),
  });
  return [
    { part: "f_bumper", d: `M0,0 L${a + 4},0 L${a},32 Q${a - 10},100 ${a},168 L${a + 4},200 L0,200 Z`, box: [6, 24, a - 4, 152] },
    { ...band("hood", a, b, 32), d: `M${a},32 L${b},32 Q${b + 8},100 ${b},168 L${a},168 Q${a - 10},100 ${a},32 Z`, box: [a - 4, 32, b - a + 8, 136] },
    band("windshield", b, c, 32, "glass"),
    band("roof", c, d, 36),
    band("rear_glass", d, e, 36, "glass"),
    band("trunk", e, f, 34),
    { part: "r_bumper", d: `M${f},0 L470,0 L470,200 L${f},200 L${f},168 Q${f + 8},100 ${f},32 Z`, box: [f - 4, 26, 470 - f - 8, 148] },
  ];
}

// 옆모습(앞이 왼쪽, 470×170). 오른쪽 옆은 좌우를 뒤집어 그린다.
export const SIDE_SILHOUETTE =
  "M14,128 C6,124 4,104 8,92 C10,82 18,76 34,74 C80,70 130,66 166,62 C190,46 208,30 232,22 C262,14 300,14 330,20 C352,30 372,50 392,60 C415,62 438,62 448,68 C456,80 456,104 450,124 L440,130 L412,130 A40,40 0 0 0 332,130 L132,130 A40,40 0 0 0 52,130 L24,130 Q16,130 14,128 Z";
export const TOP_SILHOUETTE =
  "M30,24 C14,32 6,62 6,100 C6,138 14,168 30,176 C140,188 330,188 432,178 C448,172 458,140 458,100 C458,60 448,28 432,22 C330,12 140,12 30,24 Z";
export const END_SILHOUETTE =
  "M24,150 C14,148 10,140 10,128 L12,96 C14,84 24,76 40,72 C52,46 66,30 100,28 C134,30 148,46 160,72 C176,76 186,84 188,96 L190,128 C190,140 186,148 176,150 Z";
const TALL_TOP = "M28,22 C12,30 6,62 6,100 C6,138 12,170 28,178 C140,190 340,190 444,180 C456,172 460,140 460,100 C460,60 456,28 444,20 C340,10 140,10 28,22 Z";

/** 앞·뒷모습(200×170). belt=유리 아래 끝 y */
function endFront(belt: number, hood = true): Shape[] {
  const endMirror: Shape = { part: "", d: `M2,${belt + 4} C2,${belt - 3} 10,${belt - 6} 18,${belt - 4} L22,${belt + 8} C14,${belt + 11} 6,${belt + 11} 2,${belt + 7} Z`, box: [2, belt - 6, 20, 17], clip: false };
  return [
    { part: "windshield", d: `M0,0 L200,0 L200,${belt} L0,${belt} Z`, box: [40, belt - 44, 120, 44] },
    ...(hood ? [{ part: "hood", d: `M0,${belt} L200,${belt} L200,92 L0,92 Z`, box: [14, belt, 172, 92 - belt] as Shape["box"] }] : []),
    { part: "f_bumper", d: "M0,110 L62,110 L66,116 L134,116 L138,110 L200,110 L200,170 L0,170 Z", box: [10, 110, 180, 40] },
    { part: "r_headlamp", d: "M0,92 L62,92 L60,110 L0,112 Z", box: [12, 92, 50, 20], look: "lamp" },
    { part: "grille", d: `M62,${hood ? 92 : belt} L138,${hood ? 92 : belt} L134,116 L66,116 Z`, box: [62, hood ? 92 : belt, 76, 116 - (hood ? 92 : belt)], look: "grille" },
    { part: "l_headlamp", d: "M138,92 L200,92 L200,112 L140,110 Z", box: [138, 92, 50, 20], look: "lamp" },
    { ...endMirror, part: "r_mirror" },
    flipX(endMirror, "l_mirror"),
  ];
}
function endRear(belt: number, lamp: [number, number]): Shape[] {
  const endMirror: Shape = { part: "", d: `M2,${belt + 6} C2,${belt - 1} 10,${belt - 4} 18,${belt - 2} L22,${belt + 10} C14,${belt + 13} 6,${belt + 13} 2,${belt + 9} Z`, box: [2, belt - 4, 20, 17], clip: false };
  const [ly, lh] = lamp;
  return [
    { part: "rear_glass", d: `M0,0 L200,0 L200,${belt} L0,${belt} Z`, box: [44, belt - 40, 112, 40] },
    { part: "trunk", d: `M0,${belt} L200,${belt} L200,100 L0,100 Z`, box: [14, belt, 172, 100 - belt] },
    { part: "r_bumper", d: "M0,100 L200,100 L200,170 L0,170 Z", box: [10, 100, 180, 50] },
    { part: "l_taillamp", d: `M0,${ly} L56,${ly + 2} L56,${ly + lh - 4} L0,${ly + lh} Z`, box: [10, ly, 46, lh], look: "tail" },
    { part: "r_taillamp", d: `M200,${ly} L144,${ly + 2} L144,${ly + lh - 4} L200,${ly + lh} Z`, box: [144, ly, 46, lh], look: "tail" },
    { ...endMirror, part: "l_mirror" },
    flipX(endMirror, "r_mirror"),
  ];
}
const endSil = (top: number, belt: number) =>
  `M22,150 C12,148 8,140 8,128 L10,${belt + 22} C12,${belt + 10} 22,${belt + 4} 36,${belt} C44,${top + 22} 56,${top + 2} 100,${top} C144,${top + 2} 156,${top + 22} 164,${belt} C178,${belt + 4} 188,${belt + 10} 190,${belt + 22} L192,128 C192,140 188,148 178,150 Z`;

/** 차형 하나의 그림 + 꾸밈 위치(car-art.tsx 가 읽는다) */
export type BodySpec = {
  side: { silhouette: string; shapes: (s: "l" | "r") => Shape[] };
  top: { silhouette: string; shapes: Shape[] };
  front: { silhouette: string; shapes: Shape[] };
  rear: { silhouette: string; shapes: Shape[] };
  art: {
    /** 앞·뒷바퀴 중심 x, 휠 하우스 [시작, 끝, 아래 y] */
    wheels: [number, number];
    arches: [number, number, number][];
    /** 창: 검은 창틀, 유리들, 크롬 벨트 [x1, x2, y] */
    frame: string;
    glass: string[];
    belt: [number, number, number];
    handles: number[];
    handleY: number;
    head: string;
    tail: string;
    fuel?: [number, number];
    /** 어깨선 y(앞→뒤), 스커트 그늘 [x1, x2, y] */
    shoulder: [number, number];
    skirt: [number, number, number];
    /** 지붕 레일 [x1, x2, y], 스포일러 경로, 사이드 스텝 [x1, x2] */
    rack: [number, number, number];
    spoiler: string;
    step: [number, number];
    /** 앞·뒷모습 유리 경로 */
    frontGlass: string;
    rearGlass: string;
    /** 위에서: 지붕 [x1, x2] */
    roof: [number, number];
    truck?: boolean;
  };
};

const SEDAN: BodySpec = {
  side: {
    silhouette: SIDE_SILHOUETTE,
    shapes: (s) => [
      { part: "f_bumper", d: "M0,0 L40,0 L40,70 Q44,100 54,128 L54,170 L0,170 Z", box: [6, 74, 46, 56] },
      { part: `${s}_f_fender`, d: "M40,0 L166,0 L166,116 L132,116 L132,170 L54,170 L54,128 Q44,100 40,70 Z", box: [40, 62, 126, 68] },
      { part: `${s}_f_door`, d: "M166,0 L272,0 L272,116 L166,116 Z", box: [166, 18, 106, 98] },
      { part: `${s}_r_door`, d: "M272,0 L332,0 L346,40 Q350,80 336,116 L272,116 Z", box: [272, 16, 76, 100] },
      { part: `${s}_quarter`, d: "M332,0 L470,0 L470,62 L444,62 Q430,100 412,130 L412,170 L336,170 L336,116 Q350,80 346,40 Z", box: [334, 18, 112, 112] },
      { part: "r_bumper", d: "M444,62 L470,62 L470,170 L412,170 L412,130 Q430,100 444,62 Z", box: [414, 64, 42, 66] },
      { part: `${s}_sill`, d: "M132,116 L336,116 L336,170 L132,170 Z", box: [132, 116, 200, 14] },
      mirror(s, "M176,60 C176,52 190,48 204,50 C208,51 209,60 206,64 C198,67 184,67 176,64 Z", [176, 49, 33, 18]),
      ...wheels(s, 92, 372),
    ],
  },
  top: { silhouette: TOP_SILHOUETTE, shapes: [...topCenter([40, 166, 232, 330, 388, 444]), ...topSides([44, 166, 272, 336, 444], 186)] },
  front: { silhouette: END_SILHOUETTE, shapes: endFront(72) },
  rear: { silhouette: END_SILHOUETTE, shapes: endRear(70, [82, 22]) },
  art: {
    wheels: [92, 372],
    arches: [[52, 132, 130], [332, 412, 130]],
    frame: "M174,63 C190,45 208,30 232,23 C262,15 300,15 326,21 C340,30 352,44 384,63 Z",
    glass: ["M178,62 C192,46 210,32 234,26 L268,24 L268,62 Z", "M276,24 L318,24 C330,30 340,42 343,52 L343,62 L276,62 Z", "M350,44 C360,50 370,56 380,62 L350,62 Z"],
    belt: [176, 382, 63.5],
    handles: [226, 304],
    handleY: 71,
    head: "M8,91 C12,82 24,78 48,76 L54,84 C36,87 22,90 9,96 Z",
    tail: "M434,66 L451,70 L456,88 L437,85 Z",
    fuel: [398, 77],
    shoulder: [85, 75],
    skirt: [120, 340, 118],
    rack: [236, 320, 17],
    spoiler: "M428,61 C436,57 446,57 452,60 L452,64 C444,62 436,62 428,64 Z",
    step: [138, 326],
    frontGlass: "M47,70 C57,47 72,34 100,32 C128,34 143,47 153,70 Z",
    rearGlass: "M49,68 C59,47 74,37 100,35 C126,37 141,47 151,68 Z",
    roof: [232, 330],
  },
};

const HATCH: BodySpec = {
  side: {
    silhouette:
      "M14,128 C6,124 4,104 8,92 C10,82 18,76 34,74 C80,70 130,66 166,62 C190,46 208,30 232,22 C262,14 330,14 376,18 C400,22 422,36 440,54 C452,64 456,84 454,104 C454,114 452,120 450,124 L440,130 L412,130 A40,40 0 0 0 332,130 L132,130 A40,40 0 0 0 52,130 L24,130 Q16,130 14,128 Z",
    shapes: (s) => [
      ...SEDAN.side.shapes(s).filter((x) => ![`${s}_r_door`, `${s}_quarter`, "r_bumper"].includes(x.part)),
      { part: `${s}_r_door`, d: "M272,0 L336,0 L342,40 Q348,80 336,116 L272,116 Z", box: [272, 16, 72, 100] },
      { part: `${s}_quarter`, d: "M336,0 L438,0 L448,92 Q430,110 412,130 L412,170 L336,170 L336,116 Q348,80 342,40 Z", box: [336, 18, 106, 112] },
      { part: "trunk", d: "M438,0 L470,0 L470,92 L448,92 Z", box: [440, 40, 16, 52] },
      { part: "r_bumper", d: "M448,92 L470,92 L470,170 L412,170 L412,130 Q430,110 448,92 Z", box: [416, 92, 40, 38] },
    ],
  },
  top: { silhouette: TOP_SILHOUETTE, shapes: [...topCenter([40, 166, 232, 404, 436, 450]), ...topSides([44, 166, 272, 336, 440], 186)] },
  front: SEDAN.front,
  rear: { silhouette: endSil(26, 74), shapes: endRear(74, [80, 24]) },
  art: {
    ...SEDAN.art,
    frame: "M174,63 C190,45 208,30 232,23 C262,15 330,15 374,19 C396,23 416,36 430,52 L432,63 Z",
    glass: ["M178,62 C192,46 210,32 234,26 L268,24 L268,62 Z", "M276,24 L330,22 L336,62 L276,62 Z", "M344,22 L374,21 C394,25 410,36 422,50 L426,62 L346,62 Z"],
    belt: [176, 432, 63.5],
    tail: "M440,60 L452,66 L455,86 L444,84 Z",
    rack: [236, 392, 17],
    spoiler: "M386,15 C404,15 420,19 432,26 L430,30 C418,24 404,20 386,19 Z",
    rearGlass: "M44,72 C54,46 70,32 100,30 C130,32 146,46 156,72 Z",
    roof: [232, 404],
  },
};

const SUV: BodySpec = {
  side: {
    silhouette:
      "M12,126 C4,120 4,98 8,86 C10,74 18,66 34,64 C80,60 130,56 160,52 C182,36 200,16 222,10 C262,6 380,6 420,10 C440,12 450,22 454,40 C458,70 458,100 454,122 L444,128 L414,128 A42,42 0 0 0 330,128 L134,128 A42,42 0 0 0 50,128 L22,128 Q14,128 12,126 Z",
    shapes: (s) => [
      { part: "f_bumper", d: "M0,0 L40,0 L40,62 Q44,96 52,126 L52,170 L0,170 Z", box: [6, 64, 44, 62] },
      { part: `${s}_f_fender`, d: "M40,0 L160,0 L160,114 L134,114 L134,170 L52,170 L52,126 Q44,96 40,62 Z", box: [40, 52, 120, 76] },
      { part: `${s}_f_door`, d: "M160,0 L268,0 L268,114 L160,114 Z", box: [160, 12, 108, 102] },
      { part: `${s}_r_door`, d: "M268,0 L340,0 L346,60 Q348,90 340,114 L268,114 Z", box: [268, 10, 78, 104] },
      { part: `${s}_quarter`, d: "M340,0 L446,0 L450,92 Q436,110 414,128 L414,170 L340,170 L340,114 Q348,90 346,60 Z", box: [340, 10, 108, 118] },
      { part: "trunk", d: "M446,0 L470,0 L470,92 L450,92 Z", box: [444, 14, 14, 78] },
      { part: "r_bumper", d: "M450,92 L470,92 L470,170 L414,170 L414,128 Q436,110 450,92 Z", box: [418, 92, 40, 36] },
      { part: `${s}_sill`, d: "M134,114 L340,114 L340,170 L134,170 Z", box: [134, 114, 206, 14] },
      mirror(s, "M168,52 C168,44 182,40 196,42 C200,43 201,52 198,56 C190,59 176,59 168,56 Z", [168, 41, 33, 18]),
      ...wheels(s, 92, 372),
    ],
  },
  top: { silhouette: TALL_TOP, shapes: [...topCenter([40, 160, 222, 424, 446, 456]), ...topSides([44, 160, 268, 340, 446], 178)] },
  front: { silhouette: endSil(14, 66), shapes: endFront(66) },
  rear: { silhouette: endSil(14, 66), shapes: endRear(66, [76, 22]) },
  art: {
    wheels: [92, 372],
    arches: [[50, 134, 128], [330, 414, 128]],
    frame: "M166,53 C182,35 200,16 222,11 C262,8 380,8 418,12 C434,15 442,24 444,40 L444,53 Z",
    glass: ["M172,52 C186,36 202,20 224,14 L264,13 L264,52 Z", "M272,13 L336,13 L338,52 L272,52 Z", "M346,13 L414,14 C426,16 432,24 434,34 L436,52 L348,52 Z"],
    belt: [168, 444, 53.5],
    handles: [220, 300],
    handleY: 62,
    head: "M8,82 C12,72 24,68 48,66 L54,74 C36,77 22,80 9,88 Z",
    tail: "M440,28 L454,32 L456,64 L442,60 Z",
    fuel: [400, 68],
    shoulder: [76, 66],
    skirt: [120, 344, 116],
    rack: [228, 432, 6],
    spoiler: "M410,6 C428,6 442,10 448,16 L446,21 C438,15 426,12 410,11 Z",
    step: [140, 326],
    frontGlass: "M40,66 C48,38 62,20 100,18 C138,20 152,38 160,66 Z",
    rearGlass: "M44,64 C52,40 66,24 100,22 C134,24 148,40 156,64 Z",
    roof: [222, 424],
  },
};

const VAN: BodySpec = {
  side: {
    silhouette:
      "M12,126 C4,118 4,96 8,84 C12,72 22,66 40,62 C70,58 96,52 110,46 C130,28 150,10 176,6 C260,2 380,2 440,6 C452,8 458,20 458,40 C460,70 460,100 456,122 L446,128 L414,128 A42,42 0 0 0 330,128 L134,128 A42,42 0 0 0 50,128 L22,128 Q14,128 12,126 Z",
    shapes: (s) => [
      { part: "f_bumper", d: "M0,0 L40,0 L40,62 Q44,96 52,126 L52,170 L0,170 Z", box: [6, 62, 44, 64] },
      { part: `${s}_f_fender`, d: "M40,0 L150,0 L150,114 L134,114 L134,170 L52,170 L52,126 Q44,96 40,62 Z", box: [40, 46, 110, 82] },
      { part: `${s}_f_door`, d: "M150,0 L248,0 L248,114 L150,114 Z", box: [150, 8, 98, 106] },
      { part: `${s}_r_door`, d: "M248,0 L352,0 L352,114 L248,114 Z", box: [248, 6, 104, 108] },
      { part: `${s}_quarter`, d: "M352,0 L448,0 L452,92 Q436,110 414,128 L414,170 L352,170 L352,114 Z", box: [352, 6, 96, 122] },
      { part: "trunk", d: "M448,0 L470,0 L470,92 L452,92 Z", box: [446, 10, 14, 82] },
      { part: "r_bumper", d: "M452,92 L470,92 L470,170 L414,170 L414,128 Q436,110 452,92 Z", box: [418, 92, 40, 36] },
      { part: `${s}_sill`, d: "M134,114 L352,114 L352,170 L134,170 Z", box: [134, 114, 218, 14] },
      mirror(s, "M148,46 C148,38 162,34 176,36 C180,37 181,46 178,50 C170,53 156,53 148,50 Z", [148, 35, 33, 18]),
      ...wheels(s, 92, 372),
    ],
  },
  top: { silhouette: TALL_TOP, shapes: [...topCenter([40, 112, 196, 438, 450, 458]), ...topSides([44, 150, 248, 352, 448], 158)] },
  front: { silhouette: endSil(8, 62), shapes: endFront(62) },
  rear: { silhouette: endSil(8, 62), shapes: endRear(62, [70, 26]) },
  art: {
    wheels: [92, 372],
    arches: [[50, 134, 128], [330, 414, 128]],
    frame: "M146,47 C158,30 172,10 192,7 C260,4 380,4 438,7 C448,9 452,18 452,30 L452,47 Z",
    glass: ["M154,46 C164,32 176,14 196,10 L244,9 L244,46 Z", "M254,9 L346,9 L346,46 L254,46 Z", "M358,9 L436,9 C444,10 448,16 448,26 L448,46 L358,46 Z"],
    belt: [148, 452, 47.5],
    handles: [196, 256],
    handleY: 58,
    head: "M8,80 C12,70 26,64 50,62 L56,70 C38,73 22,76 9,86 Z",
    tail: "M442,22 L456,26 L458,66 L444,62 Z",
    fuel: [400, 64],
    shoulder: [70, 62],
    skirt: [120, 356, 116],
    rack: [200, 440, 2],
    spoiler: "M420,3 C436,3 448,6 454,12 L452,17 C444,11 434,8 420,8 Z",
    step: [140, 346],
    frontGlass: "M34,62 C38,30 52,12 100,10 C148,12 162,30 166,62 Z",
    rearGlass: "M40,60 C44,32 58,16 100,14 C142,16 156,32 160,60 Z",
    roof: [196, 438],
  },
};

// 1톤 화물차(캡오버): 짧은 캡 + 적재함
const TRUCK: BodySpec = {
  side: {
    silhouette:
      "M8,124 C4,118 4,100 6,84 L8,24 C10,12 18,6 32,6 L132,6 C142,6 148,12 148,22 L148,64 L462,64 C466,64 468,68 468,72 L468,118 C468,124 464,126 458,126 L414,126 A42,42 0 0 0 330,126 L120,126 A42,42 0 0 0 36,126 L18,126 Q10,126 8,124 Z",
    shapes: (s) => [
      { part: "f_bumper", d: "M0,100 L36,100 L36,170 L0,170 Z", box: [4, 100, 32, 26] },
      { part: `${s}_f_fender`, d: "M0,0 L40,0 L40,100 L0,100 Z", box: [4, 10, 36, 90] },
      { part: `${s}_f_door`, d: "M40,0 L152,0 L152,100 L40,100 Z", box: [40, 10, 108, 90] },
      { part: `${s}_sill`, d: "M36,100 L152,100 L152,170 L36,170 Z", box: [40, 100, 112, 26] },
      { part: `${s}_bed`, d: "M152,0 L470,0 L470,118 L414,118 L414,170 L152,170 Z", box: [156, 66, 312, 52] },
      { part: "r_bumper", d: "M414,118 L470,118 L470,170 L414,170 Z", box: [416, 118, 52, 8] },
      mirror(s, "M2,30 C-6,30 -8,52 -2,56 L8,56 L8,30 Z", [-6, 30, 14, 26]),
      ...wheels(s, 78, 372),
    ],
  },
  top: {
    silhouette:
      "M12,22 C4,28 2,60 2,100 C2,140 4,172 12,178 L148,180 L154,182 L466,182 C468,182 470,180 470,178 L470,22 C470,20 468,18 466,18 L154,18 L148,20 Z",
    shapes: [
      { part: "f_bumper", d: "M0,0 L10,0 L10,200 L0,200 Z", box: [2, 26, 8, 148] },
      { part: "windshield", d: "M10,28 L40,28 L40,172 L10,172 Z", box: [10, 30, 30, 140], look: "glass" },
      { part: "roof", d: "M40,28 L152,28 L152,172 L40,172 Z", box: [40, 30, 112, 140] },
      { part: "bed_floor", d: "M152,26 L458,26 L458,174 L152,174 Z", box: [156, 28, 300, 144] },
      { part: "bed_gate", d: "M458,0 L470,0 L470,200 L458,200 Z", box: [458, 22, 12, 156] },
      ...topSides([0, 40, 152, 152, 458], 0, true),
    ],
  },
  front: {
    silhouette: "M14,150 C10,148 8,140 8,130 L10,24 C10,14 16,8 28,8 L172,8 C184,8 190,14 190,24 L192,130 C192,140 190,148 186,150 Z",
    shapes: [
      ...endFront(64, false),
      { part: "r_f_fender", d: "M0,64 L62,64 L62,92 L0,92 Z", box: [10, 64, 52, 28] },
      { part: "l_f_fender", d: "M138,64 L200,64 L200,92 L138,92 Z", box: [138, 64, 52, 28] },
    ],
  },
  rear: {
    silhouette: "M6,150 L6,70 L28,70 L30,20 C30,12 36,8 46,8 L154,8 C164,8 170,12 170,20 L172,70 L194,70 L194,150 Z",
    shapes: [
      { part: "roof", d: "M0,0 L200,0 L200,70 L0,70 Z", box: [30, 8, 140, 62] },
      { part: "rear_glass", d: "M48,22 L152,22 L152,52 L48,52 Z", box: [48, 22, 104, 30], look: "glass" },
      { part: "bed_gate", d: "M0,70 L200,70 L200,120 L0,120 Z", box: [8, 72, 184, 48] },
      { part: "r_bumper", d: "M0,120 L200,120 L200,170 L0,170 Z", box: [8, 120, 184, 30] },
      { part: "l_taillamp", d: "M6,122 L40,122 L40,136 L6,136 Z", box: [6, 122, 34, 14], look: "tail" },
      { part: "r_taillamp", d: "M194,122 L160,122 L160,136 L194,136 Z", box: [160, 122, 34, 14], look: "tail" },
    ],
  },
  art: {
    wheels: [78, 372],
    arches: [[36, 120, 126], [330, 414, 126]],
    frame: "M8,53 L8,24 C10,14 16,10 28,10 L140,10 C144,10 146,14 146,18 L146,53 Z",
    glass: ["M10,52 L10,24 C12,16 18,13 28,13 L40,13 L40,52 Z", "M48,13 L138,13 C141,13 143,15 143,18 L143,52 L48,52 Z"],
    belt: [8, 146, 53.5],
    handles: [120],
    handleY: 60,
    head: "M4,86 L16,86 L16,98 L4,98 Z",
    tail: "M462,98 L468,98 L468,114 L462,114 Z",
    shoulder: [70, 70],
    skirt: [36, 152, 100],
    rack: [20, 140, 2],
    spoiler: "M20,4 C60,0 110,0 140,4 L140,8 C110,5 60,5 20,8 Z",
    step: [40, 150],
    frontGlass: "M20,62 L22,18 C22,14 26,12 30,12 L170,12 C174,12 178,14 178,18 L180,62 Z",
    rearGlass: "M48,22 L152,22 L152,52 L48,52 Z",
    roof: [40, 152],
    truck: true,
  },
};

export const BODY_SPECS: Record<BodyType, BodySpec> = { sedan: SEDAN, hatch: HATCH, suv: SUV, van: VAN, truck: TRUCK };

/** 전체 그림 960×620 안의 다섯 면 위치 */
export const MAP_W = 960;
export const MAP_H = 620;
const defsCache = new Map<BodyType, ViewDef[]>();
export function viewDefsOf(body: BodyType = "sedan"): ViewDef[] {
  const hit = defsCache.get(body);
  if (hit) return hit;
  const b = BODY_SPECS[body];
  const defs: ViewDef[] = [
    { view: "right", x: 250, y: 30, w: 470, h: 170, flip: true, silhouette: b.side.silhouette, shapes: b.side.shapes("r") },
    { view: "top", x: 250, y: 228, w: 470, h: 200, silhouette: b.top.silhouette, shapes: b.top.shapes },
    { view: "left", x: 250, y: 446, w: 470, h: 170, silhouette: b.side.silhouette, shapes: b.side.shapes("l") },
    { view: "front", x: 24, y: 244, w: 200, h: 170, silhouette: b.front.silhouette, shapes: b.front.shapes },
    { view: "rear", x: 736, y: 244, w: 200, h: 170, silhouette: b.rear.silhouette, shapes: b.rear.shapes },
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
  const bodies = body ? [body] : (Object.keys(BODY_SPECS) as BodyType[]);
  return order.filter((v) => bodies.some((b) => viewDef(v, b).shapes.some((s) => s.part === part)));
}
/** 부위 모양. 차형을 안 주면 세단부터 찾아 처음 나오는 것 */
export function shapeOf(view: View, part: string, body?: BodyType): Shape | null {
  const bodies = body ? [body] : (Object.keys(BODY_SPECS) as BodyType[]);
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
