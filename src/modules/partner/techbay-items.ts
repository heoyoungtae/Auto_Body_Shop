// 테크베이 작업 내용(요청 항목) 풀이. 화면과 서버가 같이 쓴다(DB 없음). 대표 결정 2026-11-22:
// "테크베이 작업 내용을 입고로 넘길 때 자동으로 풀어 손상 부위를 그림에 찍고 항목으로 나누고, 빠진 것이 없는지 확인받는다."
// - 작업 항목 한 줄 = 한 요청. 줄 안의 부위는 상담 '글 → 그림' 풀이(repair/damage-text)를 그대로 쓴다.
// - 한 줄에 부위가 여럿이면 나눈다("좌측 앞도어, 뒷도어 판금" → 왼쪽 앞도어·왼쪽 뒷도어). 앞 조각의 좌우는 쉼표 뒤로 이어진다.
// - 요청 방법(판금·도장, 교환)과 손상 종류를 읽는다. 덴트·광택은 우리가 하지 않는 작업이라 직원이 고르게 한다.
// - 줄마다 ok(다 알아봄)·check(확인 필요)·none(부위를 못 찾음). 알아보지 못한 것은 지어내지 않는다.
// - 직원이 고쳐 읽은 말은 '낱말 사전'(app_config techbay.words)으로 남겨 다음 주문부터 바로 알아듣는다.
import { type BodyType, kindFit, partLabel, viewsOf, type View } from "@/modules/repair/body-map";
import { circled, kindIn, partsIn, sideOf, ZONE_KIND_LABEL, type Zone, type ZoneKind } from "@/modules/repair/damage-text";

/** 업체가 요청한 방법. pdr·polish 는 우리가 하지 않는 작업(공업사: 판금·도장만, 2026-11-22) */
export type ReqMethod = "partial" | "replace" | "pdr" | "polish";
export const REQ_METHOD_LABEL: Record<ReqMethod, string> = { partial: "판금·도장", replace: "교환", pdr: "덴트", polish: "광택" };
export const NOT_OURS: ReqMethod[] = ["pdr", "polish"];
/** 상담 '예비 판단'(customer/rules METHODS) 이름 */
export const REQ_METHOD_CONSULT: Record<"partial" | "replace", string> = { partial: "판금·도장", replace: "교환" };
/** 기호 → 상담 '손상 유형'(customer/rules DAMAGE_TYPES) */
export const KIND_CONSULT: Record<ZoneKind, string> = { D: "찌그러짐", S: "긁힘", C: "기타", R: "부식", W: "긁힘" };

export type Word = { word: string; means: string };
export type LineItem = { part: string; kind: ZoneKind };
export type LineStatus = "ok" | "check" | "none";
export type ParsedLine = {
  /** 작업 항목 순서(1부터) */
  no: number;
  /** 테크베이 묶음 이름(외판·휠 등) */
  type: string;
  /** 원문 */
  text: string;
  /** 읽은 글(직원이 고쳐 적었으면 그 글) */
  read: string;
  items: LineItem[];
  method: ReqMethod | null;
  issues: string[];
  status: LineStatus;
  /** 왼쪽·오른쪽 / 앞·뒤를 몰라서 확인이 필요한가(화면 단추) */
  ask: { side: boolean; fr: boolean };
  /** 낱말 사전으로 바꿔 읽은 말 */
  learned: string[];
};

const compact = (s: string) => s.toLowerCase().replace(/\s+/g, "");

/** 요청 방법. 판금·도색·교환이 함께 있으면 교환이 먼저(부품 교환 뒤 도장) */
export function methodIn(s: string): ReqMethod | null {
  const t = compact(s);
  if (/교환|교체|신품|새것으로/.test(t)) return "replace";
  if (/판금|도색|도장|페인트|수리|복원|용접|부식제거|녹제거/.test(t)) return "partial";
  if (/덴트|pdr|무도장/.test(t)) return "pdr";
  if (/광택|폴리싱|컴파운드|기스제거|흠집제거/.test(t)) return "polish";
  return null;
}

/** 손상 낱말이 없을 때의 기호: 판금은 찌그러짐, 도색만이면 긁힘, 교환은 찌그러짐(유리·램프는 깨짐) */
function defaultKind(part: string, line: string): ZoneKind {
  const t = compact(line);
  const k: ZoneKind = /판금|덴트|찌그|찍힘/.test(t) ? "D" : /도색|도장|페인트|광택|기스|긁/.test(t) ? "S" : "D";
  return (kindFit(part, k) ?? kindFit(part, "C") ?? "D") as ZoneKind;
}

/** 낱말 사전으로 바꿔 읽기: 띄어쓰기를 빼고 맞춘다 */
export function applyWords(text: string, words: Word[]): { text: string; used: string[] } {
  let t = compact(text);
  const used: string[] = [];
  for (const w of [...words].sort((a, b) => compact(b.word).length - compact(a.word).length)) {
    const k = compact(w.word);
    if (k && t.includes(k)) {
      t = t.split(k).join(` ${w.means} `);
      used.push(w.word);
    }
  }
  return { text: used.length ? t : text, used };
}

const SPLIT = /[,，/;]|및|그리고|&|\+/;

/** 한 줄 → 부위·기호·방법. read 는 직원이 고쳐 적은 글(없으면 원문) */
export function parseLine(no: number, type: string, text: string, opts: { read?: string; words?: Word[]; body?: BodyType } = {}): ParsedLine {
  const src = (opts.read ?? text).trim();
  const { text: line, used } = applyWords(src, opts.words ?? []);
  const method = methodIn(line);
  const items: LineItem[] = [];
  const issues: string[] = [];
  const ask = { side: false, fr: false };
  let side = "";
  for (const seg of line.split(SPLIT)) {
    if (!seg.trim()) continue;
    // 앞 조각의 좌우는 이어진다("좌측 앞도어, 뒷도어")
    const s = sideOf(compact(seg)) ? seg : `${side}${seg}`;
    const sd = sideOf(compact(seg));
    if (sd) side = sd === "both" ? "양쪽 " : sd === "l" ? "왼쪽 " : "오른쪽 ";
    // 괄호(예: '뒤펜더(쿼터)')는 걷어 낸다
    const r = partsIn(s.replace(/[()[\]]/g, " "));
    for (const i of r.issues) {
      if (/왼쪽·오른쪽|어느 바퀴/.test(i)) ask.side = true;
      if (/앞·뒤|어느 바퀴/.test(i)) ask.fr = true;
    }
    issues.push(...r.issues);
    for (const p of r.parts) {
      if (opts.body && !viewsOf(p, opts.body).length) {
        issues.push(`${partLabel(p)}: 이 차형 그림에는 없는 부위입니다`);
        continue;
      }
      const k = kindIn(s, p.endsWith("_wheel"));
      const kind = ((k && kindFit(p, k)) || defaultKind(p, line)) as ZoneKind;
      if (!items.some((x) => x.part === p && x.kind === kind)) items.push({ part: p, kind });
    }
  }
  if (method && NOT_OURS.includes(method)) issues.push(`${REQ_METHOD_LABEL[method]}은(는) 우리가 하지 않는 작업입니다. 판금·도장으로 받을지, 하지 않고 기타 요구로 둘지 골라 주세요`);
  const uniq = [...new Set(issues)];
  const status: LineStatus = !items.length && !ask.side && !ask.fr ? "none" : uniq.length ? "check" : "ok";
  if (status === "none" && !uniq.length) uniq.push("부위 이름을 찾지 못했습니다");
  return { no, type, text, read: src, items, method, issues: uniq, status, ask, learned: used };
}

export function parseOrderItems(items: { type: string; content: string }[], words: Word[] = [], body?: BodyType): ParsedLine[] {
  return items.map((it, i) => parseLine(i + 1, it.type, it.content, { words, body }));
}

// ── 확인(직원이 줄마다 고른 것) ─────────────────────
/** 줄마다: 고쳐 적은 글, 기타 요구로 둠(손상 아님·하지 않음), 덴트·광택을 판금·도장으로 받음 */
export type LineDecision = { read?: string; skip?: boolean; asPartial?: boolean };
export type CheckedLine = { no: number; type: string; text: string; read: string; skip: boolean; method: "partial" | "replace" | null; items: LineItem[] };
export type CheckResult = { lines: CheckedLine[]; open: { no: number; why: string }[] };

/** 직원이 고른 것을 받아 줄마다 끝났는지 본다. open 이 비어야 입고할 수 있다 */
export function resolveCheck(items: { type: string; content: string }[], decisions: Record<number, LineDecision>, words: Word[] = [], body?: BodyType): CheckResult {
  const lines: CheckedLine[] = [];
  const open: { no: number; why: string }[] = [];
  items.forEach((it, i) => {
    const no = i + 1;
    const d = decisions[no] ?? {};
    const p = parseLine(no, it.type, it.content, { read: d.read?.trim() || undefined, words, body });
    if (d.skip) {
      lines.push({ no, type: p.type, text: p.text, read: p.read, skip: true, method: null, items: [] });
      return;
    }
    const notOurs = !!p.method && NOT_OURS.includes(p.method);
    const rest = p.issues.filter((x) => !/우리가 하지 않는 작업/.test(x));
    if (!p.items.length) open.push({ no, why: rest[0] ?? "부위 이름을 찾지 못했습니다" });
    else if (rest.length) open.push({ no, why: rest[0] });
    else if (notOurs && !d.asPartial) open.push({ no, why: `${REQ_METHOD_LABEL[p.method!]}은(는) 하지 않는 작업입니다. 판금·도장으로 받거나 기타 요구로 두세요` });
    const method = notOurs ? (d.asPartial ? "partial" : null) : (p.method as "partial" | "replace" | null);
    lines.push({ no, type: p.type, text: p.text, read: p.read, skip: false, method, items: p.items });
  });
  return { lines, open };
}

/** 확인한 줄 → 그림 표시(부위마다 대표 면 가운데) */
export function zonesOfCheck(lines: CheckedLine[], body?: BodyType): Zone[] {
  const out: Zone[] = [];
  for (const l of lines)
    for (const it of l.items) {
      const view: View | undefined = viewsOf(it.part, body)[0];
      if (!view || out.some((z) => z.part === it.part && z.kind === it.kind)) continue;
      out.push({ part: it.part, view, cell: 4, kind: it.kind });
    }
  return out;
}

/** 확인한 줄 → 상담 '손상 부위' 글(①② 번호, 한 줄에 한 요청) */
export function checkText(lines: CheckedLine[]): string {
  let n = 0;
  return lines
    .filter((l) => !l.skip && l.items.length)
    .map((l) => `${circled(++n)} ${l.items.map((it) => `${partLabel(it.part)} ${ZONE_KIND_LABEL[it.kind]}`).join(", ")}${l.method ? ` (${REQ_METHOD_LABEL[l.method]})` : ""}`)
    .join("\n");
}

/** "7줄 = 손상 부위 5 + 기타 요구 2" */
export function checkCount(lines: CheckedLine[]) {
  const dmg = lines.filter((l) => !l.skip && l.items.length).length;
  return { total: lines.length, damage: dmg, other: lines.length - dmg };
}

// ── 낱말 사전 ───────────────────────────────────────
/** 고쳐 적은 줄에서 기억할 말: 원문에서 방법·손상 낱말을 뺀 것 → 읽은 부위 이름 */
export function wordFrom(text: string, items: LineItem[]): Word | null {
  const word = text
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/판금|도색|도장|페인트|교환|교체|수리|복원|덴트|광택|작업|요청|부탁|찌그러짐|찌그러진|찍힘|긁힘|기스|스크래치|부식|녹|깨짐|파손/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 30);
  const means = [...new Set(items.map((i) => partLabel(i.part)))].join(", ");
  if (!word || !means || compact(word) === compact(means)) return null;
  return { word, means };
}

export function cleanWords(raw: unknown): Word[] {
  if (!Array.isArray(raw)) return [];
  const out: Word[] = [];
  for (const r of raw) {
    const w = r as Partial<Word>;
    if (typeof w?.word !== "string" || typeof w?.means !== "string") continue;
    const word = w.word.trim().slice(0, 30);
    const means = w.means.trim().slice(0, 60);
    if (word && means && !out.some((o) => compact(o.word) === compact(word))) out.push({ word, means });
  }
  return out;
}
