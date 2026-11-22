// 상담 '손상 부위' 글 ↔ 차 그림(찍은 부위) 맞추기. 화면에서만 쓴다(DB 없음). 대표 요청 2026-11-19:
// "그림을 누르면 글이 들어가는데, 글을 넣거나 지워도 그림은 바뀌지 않는다."
// - 글 → 그림: 쉼표·줄바꿈으로 나눈 조각마다 부위 이름(본넷·운전석 앞도어·조수석 뒤휀다 등 흔한 말 포함)을 찾아 그림에 찍고,
//   글에서 빠진 부위는 그림에서도 지운다. 알아보지 못한 조각은 글로만 남긴다(지어내지 않는다).
// - 그림 → 글: 바뀐 부위의 조각만 고치고 나머지(직접 적은 말, 알아보지 못한 글)는 그대로 둔다.
import { type BodyType, cellLabel, cellsLabel, kindFit, partLabel, VIEWS, type View, viewsOf } from "./body-map";

export type ZoneKind = "D" | "S" | "C" | "R" | "W";
export type Zone = { part: string; view: View; cell: number; kind: ZoneKind };
export const ZONE_KIND_LABEL: Record<ZoneKind, string> = { D: "찌그러짐", S: "긁힘", C: "깨짐·크랙", R: "부식", W: "휠 긁힘" };

/** 찍은 부위 → 문장. 같은 부위·기호·면은 칸을 모아 한 번만: "왼쪽 앞도어(아래 뒤) 찌그러짐" */
export function zonesText(zones: Zone[]): string {
  const groups = new Map<string, Zone[]>();
  for (const z of zones) {
    const k = `${z.part}|${z.kind}|${z.view}`;
    groups.set(k, [...(groups.get(k) ?? []), z]);
  }
  return [...groups.values()]
    .map((g) => {
      const cells = [...new Set(g.map((z) => z.cell))].sort((a, b) => a - b);
      const where = cellsLabel(g[0].view, cells);
      return `${partLabel(g[0].part)}${where === "전체" ? "" : `(${where})`} ${ZONE_KIND_LABEL[g[0].kind]}`;
    })
    .join("\n");
}

// ── 부위 낱말 ───────────────────────────────────────
type Side = "l" | "r" | "both" | null;
type FR = "f" | "r" | "both" | null;
// 앞에 둔 것이 먼저 맞는다(적재함뒷문이 뒷문보다, 백도어가 도어보다, 앞유리가 유리보다 먼저)
const WORDS: [string, string][] = [
  ["적재함뒷문|적재함문|적재함게이트", "bed_gate"],
  ["적재함바닥", "bed_floor"],
  ["적재함옆판|적재함측판|적재함", "bed"],
  ["백도어|테일게이트|트렁크리드|트렁크|해치백도어|해치", "trunk"],
  ["앞유리|전면유리|윈드실드|윈드쉴드|프론트글라스|프런트글라스", "windshield"],
  ["뒷유리|뒤유리|후면유리|리어글라스", "rear_glass"],
  ["헤드램프|헤드라이트|전조등", "headlamp"],
  ["리어램프|테일램프|테일라이트|후미등|브레이크등|리어콤비", "taillamp"],
  ["사이드미러|백미러|아웃사이드미러|미러", "mirror"],
  ["사이드실|사이드스커트|로커패널|락커패널|로커|락커", "sill"],
  ["쿼터패널|쿼터", "quarter"],
  ["펜더|휀더|휀다|펜다", "fender"],
  ["앞문|뒷문|뒤문|도어|(?<=석)문", "door"],
  ["범퍼", "bumper"],
  ["후드|본넷|보닛|본네트|bonnet|hood", "hood"],
  ["루프|지붕|천장", "roof"],
  ["라디에이터그릴|그릴", "grille"],
  ["알루미늄휠|알로이휠|휠|타이어|바퀴", "wheel"],
];
const ALL = new RegExp(WORDS.map(([w]) => `(${w})`).join("|"), "g");

export function sideOf(s: string): Side {
  if (/양쪽|양측|좌우|양옆|양면/.test(s)) return "both";
  const l = /좌측|좌|왼쪽|왼|운전석|lh/.test(s);
  const r = /우측|우(?!레탄)|오른쪽|오른|조수석|동승석|rh/.test(s);
  return l && r ? "both" : l ? "l" : r ? "r" : null;
}
function frOf(s: string): FR {
  if (/앞뒤|앞·뒤|전후|전·후/.test(s)) return "both";
  const f = /앞|전면|전방|프론트|프런트|front/.test(s);
  const r = /뒷|뒤|후면|후방|리어|rear/.test(s);
  return f && r ? "both" : f ? "f" : r ? "r" : null;
}
const sides = (s: Side): ("l" | "r")[] => (s === "both" ? ["l", "r"] : s ? [s] : []);
const frs = (s: FR): ("f" | "r")[] => (s === "both" ? ["f", "r"] : s ? [s] : []);

/** 조각 글에서 기호. 없으면 null(그림의 지금 기호를 쓴다) */
export function kindIn(s: string, wheel: boolean): ZoneKind | null {
  const t = s.replace(/\s+/g, "");
  if (/깨짐|크랙|균열|파손|찢어|깨진|금감|금갔/.test(t)) return "C";
  if (/부식|녹/.test(t)) return "R";
  if (/휠긁힘|휠기스/.test(t) || (wheel && /긁|기스|스크래치|까짐/.test(t))) return "W";
  if (/찌그|찍힘|들어감|함몰|움푹|덴트/.test(t)) return "D";
  if (/긁|기스|스크래치|까짐|벗겨/.test(t)) return "S";
  return null;
}

/** 조각 글에서 부위 찾기. 좌우·앞뒤는 낱말 앞의 글에서 읽고, 같은 조각 안의 뒤 낱말로 이어진다 */
export function partsIn(raw: string): { parts: string[]; issues: string[] } {
  const parts: string[] = [];
  const issues: string[] = [];
  const add = (p: string) => !parts.includes(p) && parts.push(p);
  const s = raw.toLowerCase().replace(/\s+/g, "").replace(/전체|전부|모두/g, "");
  let side: Side = null;
  let fr: FR = null;
  let at = 0;
  for (const m of s.matchAll(ALL)) {
    const gi = m.slice(1).findIndex((x) => x !== undefined);
    const g = WORDS[gi]?.[1];
    if (!g) continue;
    const name = m[0];
    const pre = s.slice(at, m.index) + (/^(앞문|뒷문|뒤문|앞유리|뒷유리|뒤유리)$/.test(name) ? name : "");
    at = (m.index ?? 0) + name.length;
    side = sideOf(pre) ?? side;
    fr = frOf(pre) ?? (/^(쿼터|쿼터패널)$/.test(name) ? "r" : fr);
    const needSide = (what: string, make: (x: "l" | "r") => string[]) => {
      if (!side) issues.push(`${what}: 왼쪽·오른쪽을 알 수 없습니다`);
      for (const x of sides(side)) make(x).forEach(add);
    };
    if (g === "bumper") {
      if (!fr) issues.push("범퍼: 앞·뒤를 알 수 없습니다");
      for (const x of frs(fr)) add(x === "f" ? "f_bumper" : "r_bumper");
    } else if (g === "door") {
      // '운전석 문'·'조수석 문'은 앞도어
      const dfr: FR = fr ?? (/석/.test(pre + name) || name === "문" ? "f" : null);
      if (!dfr) issues.push(`${name}: 앞·뒤를 알 수 없습니다`);
      else needSide(name, (x) => frs(dfr).map((y) => `${x}_${y}_door`));
    } else if (g === "fender") needSide("펜더", (x) => (fr === "r" ? [`${x}_quarter`] : fr === "both" ? [`${x}_f_fender`, `${x}_quarter`] : [`${x}_f_fender`]));
    else if (g === "quarter") needSide("뒤펜더(쿼터)", (x) => [`${x}_quarter`]);
    else if (g === "mirror") needSide("사이드미러", (x) => [`${x}_mirror`]);
    else if (g === "sill") needSide("사이드실", (x) => [`${x}_sill`]);
    else if (g === "headlamp") needSide("헤드램프", (x) => [`${x}_headlamp`]);
    else if (g === "taillamp") needSide("리어램프", (x) => [`${x}_taillamp`]);
    else if (g === "bed") needSide("적재함 옆판", (x) => [`${x}_bed`]);
    else if (g === "wheel") {
      if (/4짝|4개|네짝|4본|사짝|휠4/.test(s)) ["l_f_wheel", "r_f_wheel", "l_r_wheel", "r_r_wheel"].forEach(add);
      else if (!side || !fr) issues.push(`바퀴: ${!side && !fr ? "어느 바퀴인지" : !side ? "왼쪽·오른쪽을" : "앞·뒤를"} 알 수 없습니다`);
      else for (const x of sides(side)) for (const y of frs(fr)) add(`${x}_${y}_wheel`);
    } else add(g);
  }
  return { parts, issues: [...new Set(issues)] };
}

/** 괄호 속 자리 글 "위 앞·아래 뒤" → 그 부위의 면·칸. 못 읽으면 null */
export function cellsIn(text: string, part: string, body?: BodyType, prefer?: View): { view: View; cells: number[] } | null {
  const words = text.split(/[·,，/]/).map((w) => w.trim().replace(/\s+/g, " ")).filter(Boolean);
  if (!words.length) return null;
  const views = viewsOf(part, body);
  const order = prefer && views.includes(prefer) ? [prefer, ...views.filter((v) => v !== prefer)] : views;
  for (const v of order) {
    const cells: number[] = [];
    for (const w of words) {
      const c = [0, 1, 2, 3, 4, 5, 6, 7, 8].find((n) => cellLabel(v, n) === w);
      if (c === undefined) break;
      cells.push(c);
    }
    if (cells.length === words.length) return { view: v, cells: [...new Set(cells)].sort((a, b) => a - b) };
  }
  return null;
}
const looksLikeCells = (t: string) => /^[\s·,가-힣]*$/.test(t) && t.split(/[·,]/).every((w) => /^(정가운데|(위|가운데|아래|오른쪽|왼쪽) (앞|가운데|뒤|차 오른쪽|차 왼쪽))$/.test(w.trim().replace(/\s+/g, " ")));

export type TextItem = { part: string; kind: ZoneKind | null; at: { view: View; cells: number[] } | null };
export type Segment = { raw: string; sep: string; items: TextItem[]; issues: string[] };

/** 글 → 조각들. 조각마다 알아본 부위(items)와 알아보지 못한 까닭(issues) */
export function parseDamageText(text: string, body?: BodyType): Segment[] {
  const out: Segment[] = [];
  const re = /([^,，\n;]*)([,，\n;]\s*|$)/g;
  for (const m of text.matchAll(re)) {
    if (m[0] === "" && (m.index ?? 0) >= text.length) break;
    const raw = m[1];
    const sep = m[2];
    if (!raw.trim()) {
      if (sep) out.push({ raw, sep, items: [], issues: [] });
      continue;
    }
    // 괄호: 자리 글이면 따로 읽고, 아니면(예: '뒤펜더(쿼터)') 괄호만 걷어 부위 찾기에 쓴다
    let cellsText: string | null = null;
    const bare = raw.replace(/\(([^)]*)\)/g, (_, t: string) => {
      if (looksLikeCells(t)) {
        cellsText = t;
        return " ";
      }
      return t === "전체" ? " " : ` ${t} `;
    });
    const { parts, issues } = partsIn(bare);
    const items: TextItem[] = [];
    for (const p of parts) {
      if (!viewsOf(p, body).length) {
        issues.push(`${partLabel(p)}: 이 차형 그림에는 없는 부위입니다`);
        continue;
      }
      const k = kindIn(bare, p.endsWith("_wheel"));
      const fit = k ? kindFit(p, k) : null;
      if (k && !fit) issues.push(`${partLabel(p)}: ${ZONE_KIND_LABEL[k]}은(는) 이 부위에 찍을 수 없어 기호는 그림에서 고른 것으로 둡니다`);
      const at = cellsText ? cellsIn(cellsText, p, body) : null;
      if (cellsText && !at) issues.push(`${partLabel(p)}: 괄호 속 자리를 알아보지 못해 가운데에 찍습니다`);
      items.push({ part: p, kind: fit as ZoneKind | null, at });
    }
    if (!parts.length && !issues.length) issues.push("부위 이름을 찾지 못했습니다");
    out.push({ raw, sep, items, issues: [...new Set(issues)] });
    if (!sep) break;
  }
  return out;
}

const same = (a: number[], b: number[]) => a.length === b.length && a.every((x, i) => x === b[i]);
const cellsOfGroup = (zs: Zone[]) => [...new Set(zs.map((z) => z.cell))].sort((a, b) => a - b);

/**
 * 글 → 찍을 부위. 글에 있는 부위는 지금 찍힌 것을 그대로 살리고(자리·기호를 글이 바꿨으면 고치고),
 * 새 부위는 대표 면 가운데(괄호 자리 글이 있으면 그 칸)에 찍는다. 글에서 빠진 부위는 지운다.
 * defaultKind 는 글에 손상 낱말이 없을 때 쓸 기호(그림에서 고른 것).
 */
export function zonesFromText(text: string, prev: Zone[], body: BodyType | undefined, defaultKind: ZoneKind): Zone[] {
  const out: Zone[] = [];
  const push = (z: Zone) => !out.some((o) => o.part === z.part && o.view === z.view && o.cell === z.cell && o.kind === z.kind) && out.push(z);
  for (const seg of parseDamageText(text, body))
    for (const it of seg.items) {
      const cand = prev.filter((z) => z.part === it.part && (!it.kind || z.kind === it.kind));
      if (!it.at && cand.length) {
        cand.forEach(push);
        continue;
      }
      if (it.at) {
        const sameAt = cand.filter((z) => z.view === it.at!.view);
        if (sameAt.length && same(cellsOfGroup(sameAt), it.at.cells)) {
          sameAt.forEach(push);
          continue;
        }
      }
      const kind = (kindFit(it.part, it.kind ?? cand[0]?.kind ?? defaultKind) ?? (it.part.endsWith("_wheel") ? "W" : "D")) as ZoneKind;
      const at = it.at ?? { view: viewsOf(it.part, body)[0], cells: [4] };
      for (const c of at.cells) push({ part: it.part, view: at.view, cell: c, kind });
    }
  return out;
}

/**
 * 그림이 prev → next 로 바뀌었을 때 글 고치기. 바뀌지 않은 부위의 조각과 알아보지 못한 조각은 손대지 않고,
 * 바뀐(지운·자리 바꾼) 부위의 조각은 빼고, 새로 찍은 부위는 끝에 "부위(자리) 손상" 으로 붙인다.
 */
export function textFromZones(text: string, prev: Zone[], next: Zone[], body?: BodyType): string {
  const key = (z: Zone) => `${z.part}|${z.kind}`;
  const groupCells = (zs: Zone[], k: string) => zs.filter((z) => key(z) === k).map((z) => `${z.view}${z.cell}`).sort().join(",");
  const changed = (k: string) => groupCells(prev, k) !== groupCells(next, k);
  const covered = new Set<string>();
  const kept: Segment[] = [];
  for (const seg of parseDamageText(text, body)) {
    if (!seg.items.length) {
      if (seg.raw.trim()) kept.push(seg);
      continue;
    }
    // 이 조각이 가리키는 그림 묶음(기호가 없으면 그 부위의 모든 기호)
    const keys = seg.items.flatMap((it) => {
      const ks = [...new Set([...prev, ...next].filter((z) => z.part === it.part && (!it.kind || z.kind === it.kind)).map(key))];
      return ks.length ? ks : [`${it.part}|${it.kind ?? "?"}`];
    });
    const alive = keys.some((k) => next.some((z) => key(z) === k));
    if (keys.every((k) => !changed(k)) && alive) {
      kept.push(seg);
      keys.forEach((k) => covered.add(k));
    } else if (!alive && keys.every((k) => !changed(k))) {
      // 그림에 없던 부위를 적은 조각(그림과 상관없는 글)은 그대로
      kept.push(seg);
    }
  }
  const fresh = zonesText(next.filter((z) => !covered.has(key(z))));
  return [...kept.map((s) => s.raw.trim()), fresh].filter(Boolean).join("\n");
}

// ── 번호(①②③): 그림 표시와 글 줄을 짝짓는다(대표 결정 2026-11-19) ──────
// 부위를 알아본 조각마다 글 순서대로 번호를 매기고, 그 조각이 가리키는 그림 표시에 같은 번호를 보인다.
// 번호는 앱이 붙인다: 그림을 바꾸거나 글 칸을 떠나면 다시 매긴다. 알아보지 못한 조각은 번호 없이 글로만.
const CIRCLED = "①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳";
export const circled = (n: number) => (n >= 1 && n <= 20 ? CIRCLED[n - 1] : `(${n})`);
const NUM_HEAD = /^\s*(?:[①-⑳]|\(\d+\))\s*/;
const stripNum = (s: string) => s.replace(NUM_HEAD, "");

/** 글을 한 줄에 한 조각으로 다시 쓰고, 부위를 알아본 줄 앞에 ①②… */
export function renumberText(text: string, body?: BodyType): string {
  let n = 0;
  return parseDamageText(text, body)
    .filter((s) => s.raw.trim())
    .map((s) => {
      const t = stripNum(s.raw.trim());
      return s.items.length ? `${circled(++n)} ${t}` : t;
    })
    .join("\n");
}

/** 찍은 표시마다 번호(글 순서). 글에 짝이 없으면 0 */
export function zoneNumbers(text: string, zones: Zone[], body?: BodyType): number[] {
  const out = zones.map(() => 0);
  let n = 0;
  for (const seg of parseDamageText(text, body)) {
    if (!seg.items.length) continue;
    n++;
    zones.forEach((z, i) => {
      if (!out[i] && seg.items.some((it) => it.part === z.part && (!it.kind || it.kind === z.kind))) out[i] = n;
    });
  }
  return out;
}
