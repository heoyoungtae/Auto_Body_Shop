// 업체 견적서(단가표) 읽기 규칙 — 데이터베이스 없는 순수 함수(대표 요청 2026-11-20 "업체 단가표로 품목 등록").
// 엑셀·CSV·붙여넣은 표를 줄 × 칸으로 받아 머리줄(품명·규격·단위·수량·단가·금액)을 알아보고,
// 사업자번호·견적일·합계·유효기간을 찾고, 우리 품목과 같은지(중복) 판정한다.
import type { Cell, Grid } from "@/modules/bank/sheet-read";
import { STOCK_KINDS, type StockKind, type TrackMode } from "./rules";

export type RawQuoteLine = { supName: string; spec: string | null; supUnit: string | null; qty: number; unitWon: number; amountWon: number | null; kind: string | null; packAmount: number | null; packUnit: string | null; buyQty: number | null; baseUnit: string | null; track: TrackMode | null; note: string | null };

export type QuoteRead = {
  lines: RawQuoteLine[];
  /** 알아본 열 이름(화면에 보여 줌) */
  columns: string[];
  bizNos: string[];
  supplierName: string | null;
  quotedOn: string | null;
  validDays: number | null;
  readTotalWon: number | null;
  /** 견적서에 적힌 부가세 별도·포함(없으면 null) */
  vatMode: "excluded" | "included" | null;
  /** 머리 부분(품목 표 위)의 업체 정보: 새 업체 후보 등록에 씀 */
  ceo: string | null;
  contactName: string | null;
  phone: string | null;
  address: string | null;
  /** 머리줄을 못 찾아 우리 양식 순서로 읽었는지 */
  templateOrder: boolean;
  skipped: number;
};

/** 우리 엑셀 양식의 열(내려받기 양식과 같은 순서) */
export const TEMPLATE_COLUMNS = [
  { key: "name", label: "품명", note: "업체 견적서에 적힌 그대로(예: 마스킹테이프 24MM). 꼭 적습니다", width: 30 },
  { key: "spec", label: "규격", note: "용량·색상·입도(예: P400, 24mm). 없으면 비움", width: 14 },
  { key: "unit", label: "단위", note: "업체 단위 그대로(BOX·EA·말·G·4L 등). 앱이 우리 단위로 바꿔 추천", width: 8 },
  { key: "qty", label: "수량", note: "견적 수량. 비우면 1", width: 7 },
  { key: "price", label: "단가", note: "숫자만(쉼표 가능). 부가세 별도인지 포함인지는 올릴 때 고릅니다", width: 12 },
  { key: "amount", label: "금액", note: "수량×단가. 비워도 됨(합계 검사에만 씀)", width: 12 },
  { key: "kind", label: "구분", note: "도료 · 소모품 · 상비 부품 중 하나. 비우면 품명으로 추천", width: 10 },
  { key: "pack", label: "용량", note: "한 캔·통의 양(숫자). 예: 4", width: 7 },
  { key: "packUnit", label: "용량단위", note: "ml · L · g · kg", width: 9 },
  { key: "buyQty", label: "입수", note: "박스·세트로 사서 낱개로 쓰면 1박스에 든 개수(예: 40). 아니면 비움", width: 7 },
  { key: "baseUnit", label: "낱개단위", note: "입수를 적었으면 쓰는 단위(롤·장·개 등)", width: 9 },
  { key: "track", label: "관리방식", note: "수량 관리 · 실사로 관리 · 관리 안 함. 비우면 앱이 추천", width: 12 },
  { key: "note", label: "메모", note: "업체 품번 등 남길 말", width: 20 },
] as const;

type ColKey = (typeof TEMPLATE_COLUMNS)[number]["key"];

const HEADS: [ColKey, RegExp][] = [
  ["name", /^(품목명?|품명|상품명|제품명|자재명|품목및규격|item|itemname|description|name|품명\(규격\))$/i],
  ["spec", /^(규격|사양|spec|규격\/사양|사이즈)$/i],
  ["unit", /^(단위|unit|uom)$/i],
  ["qty", /^(수량|qty|quantity|수 량)$/i],
  ["price", /^(단가|공급단가|매입단가|unitprice|price|단가\(원\))$/i],
  ["amount", /^(공급가액|공급가|금액|amount|합계금액|공급금액)$/i],
  ["kind", /^(구분|분류|품목구분)$/i],
  ["pack", /^(용량|중량|용량·중량|용량중량)$/i],
  ["packUnit", /^(용량단위|중량단위)$/i],
  ["buyQty", /^(입수|입수량|포장수량|박스입수)$/i],
  ["baseUnit", /^(낱개단위|사용단위|쓰는단위)$/i],
  ["track", /^(관리방식|재고관리)$/i],
  ["note", /^(메모|비고|품번|코드|품목코드|partno|note|remark)$/i],
];

const squash = (c: Cell) => String(c ?? "").replace(/\s+/g, "").trim();
const text = (c: Cell) => String(c ?? "").replace(/\s+/g, " ").trim();

/** 숫자 칸: 42,000 · ₩42,000 · 42000원 → 42000. 숫자가 없으면 null */
export function toNumber(c: Cell): number | null {
  if (typeof c === "number") return Number.isFinite(c) ? c : null;
  const s = String(c ?? "").replace(/[₩,원\s]/g, "");
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  return Number(s);
}

/** 합계·여백·소계 줄 */
const TOTAL_ROW = /이하\s*여\s*백|^\**\s*이\s*하|합\s*계|총\s*계|소\s*계|^total$|^계$/i;

function findHeader(grid: Grid): { row: number; map: Partial<Record<ColKey, number>> } | null {
  for (let r = 0; r < Math.min(grid.length, 40); r++) {
    const map: Partial<Record<ColKey, number>> = {};
    grid[r].forEach((c, i) => {
      const s = squash(c);
      for (const [k, re] of HEADS) if (map[k] == null && re.test(s)) map[k] = i;
    });
    if (map.name != null && (map.price != null || map.amount != null)) return { row: r, map };
  }
  return null;
}

const BIZ = /(?<!\d)(\d{3})\s*-\s*(\d{2})\s*-\s*(\d{5})(?!\d)/;
export const fmtBizNo = (d: string) => `${d.slice(0, 3)}-${d.slice(3, 5)}-${d.slice(5)}`;

/** 견적일: 2026년 11월 17일 · 2026-11-17 · 2026.11.17 */
export function findDate(s: string): string | null {
  const m = /(20\d\d)\s*[년.\-/]\s*(\d{1,2})\s*[월.\-/]\s*(\d{1,2})/.exec(s);
  if (!m) return null;
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return `${m[1]}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** 머리 정보(사업자번호·상호·견적일·유효기간·합계)를 표 전체에서 찾는다 */
function findMeta(grid: Grid, ownBizNo: string | null) {
  const bizNos: string[] = [];
  let supplierName: string | null = null;
  let quotedOn: string | null = null;
  let validDays: number | null = null;
  let readTotalWon: number | null = null;
  const own = (ownBizNo ?? "").replace(/\D/g, "");
  for (const row of grid) {
    const cells = row.map(text);
    const line = cells.join(" ");
    // 사업자번호: 칸 하나에 000-00-00000(띄어쓰기 허용), 또는 '등록번호·사업자' 줄의 숫자 10자리 칸. 금액 칸이 이어져 번호처럼 보이는 것은 빼려고 칸마다 본다
    const labeled = /등록\s*번호|사업자/.test(line);
    for (const c of cells) {
      const m = BIZ.exec(c) ?? (labeled ? /^(\d{3})(\d{2})(\d{5})$/.exec(c.replace(/\s/g, "")) : null);
      if (!m) continue;
      const d = m[1] + m[2] + m[3];
      if (d !== own && !bizNos.includes(fmtBizNo(d))) bizNos.push(fmtBizNo(d));
    }
    cells.forEach((c, i) => {
      if (!supplierName && /^상\s*호(\(법인명\))?$/.test(c)) supplierName = cells.slice(i + 1).find((x) => x && !/^(성\s*명|대표)/.test(x)) ?? null;
    });
    if (!quotedOn && /견적|작성|일자|날짜|date/i.test(line)) quotedOn = findDate(line);
    if (validDays == null && /유효/.test(line)) {
      const m = /(\d+)\s*일/.exec(line.slice(line.indexOf("유효")));
      const mo = /(\d+)\s*(개월|달)/.exec(line.slice(line.indexOf("유효")));
      const bare = /유효\S*\s+(\d+)$/.exec(line);
      if (m) validDays = Number(m[1]);
      else if (mo) validDays = Number(mo[1]) * 30;
      else if (bare) validDays = Number(bare[1]);
    }
    if (/합\s*계|총\s*계|total/i.test(line)) {
      const nums = row.map(toNumber).filter((n): n is number => n != null && n >= 1000);
      if (nums.length) readTotalWon = Math.max(readTotalWon ?? 0, nums[nums.length - 1]);
    }
  }
  if (!quotedOn) for (const row of grid) if ((quotedOn = findDate(row.map(text).join(" ")))) break;
  return { bizNos, supplierName, quotedOn, validDays, readTotalWon };
}

/** 부가세: 'V.A.T 별도' · '부가세 포함' · 양식의 '부가세 | 별도' */
function findVat(grid: Grid): "excluded" | "included" | null {
  for (const row of grid) {
    const line = row.map(text).join(" ").replace(/V\.?\s*A\.?\s*T\.?/gi, "VAT");
    const m = /(부가가치세|부가세|VAT)\s*[:：]?\s*\(?\s*(별도|미포함|포함)/i.exec(line);
    if (m) return m[2] === "포함" ? "included" : "excluded";
  }
  return null;
}

/** 품목 표 위 머리 부분에서 '이름표 칸 → 다음 칸' 값 */
const INFO_LABELS: [keyof Pick<QuoteRead, "ceo" | "contactName" | "phone" | "address">, RegExp][] = [
  ["ceo", /^(대표자?|성명|대표자명)$/],
  ["contactName", /^(담당자?|담당자명)$/],
  ["phone", /^(전화|전화번호|연락처|tel|휴대폰)$/i],
  ["address", /^(주소|소재지|사업장주소|사업장소재지)$/],
];
function findInfo(grid: Grid, upto: number) {
  const out: Pick<QuoteRead, "ceo" | "contactName" | "phone" | "address"> = { ceo: null, contactName: null, phone: null, address: null };
  for (let r = 0; r < Math.min(upto, grid.length); r++) {
    const cells = grid[r].map(text);
    cells.forEach((c, i) => {
      const k = INFO_LABELS.find(([, re]) => re.test(c.replace(/\s/g, "")))?.[0];
      if (!k || out[k]) return;
      const v = cells.slice(i + 1).find((x) => x);
      if (v && !INFO_LABELS.some(([, re]) => re.test(v.replace(/\s/g, "")))) out[k] = v.replace(/\s*\(인\)$/, "").slice(0, 200);
    });
  }
  return out;
}

/** 붙여 넣은 글(엑셀에서 복사하면 칸이 탭으로 나뉨)을 표로 */
export function pasteToGrid(s: string): Grid {
  return s
    .replace(/\r/g, "")
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => (l.includes("\t") ? l.split("\t") : l.split(/\s{2,}|,(?=\S)/)).map((c) => c.trim() || null));
}

/** 표 → 견적 줄 */
export function readQuoteGrid(grid: Grid, ownBizNo: string | null = null): QuoteRead {
  const meta = findMeta(grid, ownBizNo);
  const h = findHeader(grid);
  const map: Partial<Record<ColKey, number>> = h ? h.map : Object.fromEntries(TEMPLATE_COLUMNS.map((c, i) => [c.key, i]));
  const start = h ? h.row + 1 : 0;
  const lines: RawQuoteLine[] = [];
  let skipped = 0;
  const at = (row: Cell[], k: ColKey) => (map[k] != null ? row[map[k]!] ?? null : null);
  for (let r = start; r < grid.length; r++) {
    const row = grid[r];
    const name = text(at(row, "name"));
    if (!name || /^[-*=\s]+$/.test(name)) continue;
    if (TOTAL_ROW.test(name) || TOTAL_ROW.test(squash(at(row, "name")))) {
      const t = toNumber(at(row, "amount")) ?? toNumber(at(row, "price"));
      if (t) meta.readTotalWon = Math.max(meta.readTotalWon ?? 0, t);
      continue;
    }
    // 양식 첫 줄이 머리줄이 아니고 품명이 '품명'이면(머리줄만 있는 양식) 건너뜀
    if (!h && /^품\s*명$/.test(name)) continue;
    const qty = toNumber(at(row, "qty"));
    const price = toNumber(at(row, "price"));
    const amount = toNumber(at(row, "amount"));
    const unitWon = price ?? (amount != null && qty ? Math.round(amount / qty) : null);
    if (unitWon == null || unitWon < 0) {
      skipped++;
      continue;
    }
    const kindTxt = text(at(row, "kind"));
    const pack = toNumber(at(row, "pack"));
    lines.push({
      supName: name,
      spec: text(at(row, "spec")) || null,
      supUnit: text(at(row, "unit")) || null,
      qty: qty && qty > 0 ? qty : 1,
      unitWon: Math.round(unitWon),
      amountWon: amount != null ? Math.round(amount) : null,
      kind: kindFromText(kindTxt),
      packAmount: pack && pack > 0 ? pack : null,
      packUnit: text(at(row, "packUnit")) || null,
      buyQty: (() => {
        const n = toNumber(at(row, "buyQty"));
        return n && n > 1 ? Math.round(n) : null;
      })(),
      baseUnit: text(at(row, "baseUnit")) || null,
      track: trackFromText(text(at(row, "track"))),
      note: text(at(row, "note")) || null,
    });
  }
  const columns = h ? (Object.keys(map) as ColKey[]).map((k) => TEMPLATE_COLUMNS.find((c) => c.key === k)!.label) : TEMPLATE_COLUMNS.map((c) => c.label);
  return { lines, columns, ...meta, vatMode: findVat(grid), ...findInfo(grid, h ? h.row : 0), templateOrder: !h, skipped };
}

function trackFromText(s: string): TrackMode | null {
  const x = s.replace(/\s/g, "");
  if (!x) return null;
  if (/안함|안 함|없음/.test(x)) return "none";
  if (/실사/.test(x)) return "count";
  if (/수량/.test(x)) return "qty";
  return null;
}

function kindFromText(s: string): StockKind | null {
  if (!s) return null;
  if (/도료|페인트|paint/i.test(s)) return "paint";
  if (/소모/.test(s)) return "consumable";
  if (/부품|part/i.test(s)) return "part";
  return (Object.entries(STOCK_KINDS).find(([, l]) => l === s)?.[0] as StockKind) ?? null;
}

// ── 같은 품목 찾기(중복 걸러내기) ──

/** 비교용 이름: 띄어쓰기·대소문자·괄호·기호·법인 표기 무시, 전각→반각 */
export function normName(s: string): string {
  return s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/㈜|\(주\)|주식회사/g, "")
    .replace(/["'″“”‘’`]/g, "")
    .replace(/[\s()[\]{}<>·.,\-_/\\|:;~!@#$%^&*+=?]/g, "");
}

/** 두 글자씩 묶어 비교(Dice). 0~1 */
export function similarity(a: string, b: string): number {
  const x = normName(a);
  const y = normName(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  if (x.length >= 3 && y.length >= 3 && (x.includes(y) || y.includes(x))) return 0.75 + 0.2 * (Math.min(x.length, y.length) / Math.max(x.length, y.length));
  const bi = (s: string) => {
    const m = new Map<string, number>();
    for (let i = 0; i < s.length - 1; i++) m.set(s.slice(i, i + 2), (m.get(s.slice(i, i + 2)) ?? 0) + 1);
    return m;
  };
  const A = bi(x);
  const B = bi(y);
  let hit = 0;
  for (const [k, n] of A) hit += Math.min(n, B.get(k) ?? 0);
  const total = Math.max(1, x.length - 1 + y.length - 1);
  return (2 * hit) / total;
}

/** 이 점수 이상이면 '비슷한 품목'으로 물어본다 */
export const SIMILAR_MIN = 0.72;

export type MatchItem = { id: string; name: string; spec: string | null; active: boolean };
export type MatchPrice = { itemId: string; supName: string | null };
export type Matched = { match: "same" | "similar" | "new" | "dup"; itemId: string | null; candidates: { id: string; name: string; spec: string | null; score: number }[]; note: string | null };

const key = (name: string, spec: string | null) => normName(name) + "|" + normName(spec ?? "");

/**
 * 견적 줄마다 판정한다.
 * 1) 이 업체 단가표에 같은 업체 품명이 있으면 같은 품목(업체가 쓰는 이름을 기억해 둠)
 * 2) 우리 품목 이름(+규격)이 같으면 같은 품목
 * 3) 비슷한 이름이 있으면 '비슷한 품목'(사람이 고름)
 * 4) 없으면 새 품목. 같은 견적서 안에 같은 줄이 또 나오면 dup(건너뜀)
 */
export function matchLines(lines: { supName: string; spec: string | null; unitWon: number }[], items: MatchItem[], prices: MatchPrice[]): Matched[] {
  const bySupName = new Map<string, string>();
  for (const p of prices) if (p.supName) bySupName.set(normName(p.supName), p.itemId);
  const live = items.filter((i) => i.active);
  const byKey = new Map<string, MatchItem>();
  for (const i of live) {
    byKey.set(key(i.name, i.spec), i);
    // 규격을 품명에 붙여 쓴 경우(예: '마스킹테이프 24MM')도 같게 본다
    if (i.spec) byKey.set(key(`${i.name}${i.spec}`, null), i);
    if (!byKey.has(key(i.name, null))) byKey.set(key(i.name, null), i);
  }
  const seen = new Map<string, { idx: number; unitWon: number }>();
  return lines.map((l, idx) => {
    const k = key(l.supName, l.spec);
    const before = seen.get(k);
    if (before) return { match: "dup", itemId: null, candidates: [], note: `${before.idx + 1}번째 줄과 같은 품목${before.unitWon !== l.unitWon ? `(단가 다름: ${before.unitWon.toLocaleString("ko-KR")}원 / ${l.unitWon.toLocaleString("ko-KR")}원)` : ""}` };
    seen.set(k, { idx, unitWon: l.unitWon });
    const viaSup = bySupName.get(normName(l.supName + (l.spec ?? ""))) ?? bySupName.get(normName(l.supName));
    if (viaSup && live.some((i) => i.id === viaSup)) return { match: "same", itemId: viaSup, candidates: [], note: "이 업체 품명으로 전에 맞춘 품목" };
    const exact = byKey.get(k) ?? byKey.get(key(l.supName + (l.spec ?? ""), null));
    if (exact) return { match: "same", itemId: exact.id, candidates: [], note: null };
    const cands = live
      .map((i) => ({ id: i.id, name: i.name, spec: i.spec, score: Math.max(similarity(l.supName, i.name), similarity(`${l.supName}${l.spec ?? ""}`, `${i.name}${i.spec ?? ""}`)) }))
      .filter((c) => c.score >= SIMILAR_MIN)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map((c) => ({ ...c, score: Math.round(c.score * 100) / 100 }));
    if (cands.length) return { match: "similar", itemId: null, candidates: cands, note: null };
    return { match: "new", itemId: null, candidates: [], note: null };
  });
}

// ── 새 품목 추천값 ──

const PAINT = /신나|시너|thinner|도료|페인트|paint|클리어|크리어|크리아|clear|프라이머|primer|서페이서|surfacer|퍼티|putty|필러|filler|경화제|hardener|베이스|우레탄|프라임|유니탄|탑코트|바니시|래커|락카|에폭시|조색/i;
const PART = /클립|볼트|너트|엠블럼|몰딩|브라켓|그로멧|리벳|스크루|패스너/i;

export function guessKind(name: string): StockKind {
  if (PART.test(name)) return "part";
  if (PAINT.test(name)) return "paint";
  return "consumable";
}

/**
 * 업체 단위 → 우리 단위(재고 단위 목록)와 한 단위의 용량.
 * 예: BOX→박스, EA→개, SET→세트, 4L→캔 4 L, 0.5K→캔 0.5 kg, 말→통 18 L, G(갤런)→캔(약 3.8 L, 확인 필요)
 */
export function suggestUnit(sup: string | null): { unit: string; packAmount: number | null; packUnit: string | null; note: string | null } {
  const s = (sup ?? "").normalize("NFKC").replace(/\s/g, "");
  const u = s.toLowerCase();
  if (!u) return { unit: "개", packAmount: null, packUnit: null, note: null };
  if (/^(box|bx|박스|상자|곽|갑)$/.test(u)) return { unit: "박스", packAmount: null, packUnit: null, note: null };
  if (/^(ea|개|pcs|pc|ps)$/.test(u)) return { unit: "개", packAmount: null, packUnit: null, note: null };
  if (/^(set|세트|조)$/.test(u)) return { unit: "세트", packAmount: null, packUnit: null, note: null };
  if (/^(roll|롤)$/.test(u)) return { unit: "롤", packAmount: null, packUnit: null, note: null };
  if (/^(장|매|sheet)$/.test(u)) return { unit: "장", packAmount: null, packUnit: null, note: null };
  if (/^(벌|착|켤레|족)$/.test(u)) return { unit: "벌", packAmount: null, packUnit: null, note: null };
  if (/^(통|캔|can)$/.test(u)) return { unit: u === "can" ? "캔" : s, packAmount: null, packUnit: null, note: null };
  if (u === "말") return { unit: "통", packAmount: 18, packUnit: "L", note: "1말 = 18 L로 넣었습니다. 다르면 고치세요" };
  if (/^(g|gal|gallon|갤런|갤론)$/.test(u)) return { unit: "캔", packAmount: 3.8, packUnit: "L", note: "G = 갤런(약 3.8 L)으로 보았습니다. 실제 용량으로 고치세요" };
  const m = /^(\d+(?:\.\d+)?)(ml|l|리터|kg|k|키로|g)$/.exec(u);
  if (m) {
    const n = Number(m[1]);
    const unit = { ml: "ml", l: "L", 리터: "L", kg: "kg", k: "kg", 키로: "kg", g: "g" }[m[2]]!;
    return { unit: "캔", packAmount: n, packUnit: unit, note: null };
  }
  if (/^(l|리터)$/.test(u)) return { unit: "L", packAmount: null, packUnit: null, note: null };
  if (/^(kg|k|키로)$/.test(u)) return { unit: "kg", packAmount: null, packUnit: null, note: null };
  return { unit: "개", packAmount: null, packUnit: null, note: `업체 단위 '${sup}'를 알아보지 못해 '개'로 넣었습니다` };
}

/** 단가 변동률(%). 전 값이 없거나 0이면 null */
export const changePct = (before: number | null, after: number) => (before ? Math.round(((after - before) / before) * 1000) / 10 : null);

/** 이만큼(%) 넘게 오르면 대표에게 알린다 */
export const PRICE_RISE_ALERT_PCT = 10;
