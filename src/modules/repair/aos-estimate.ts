// AOS 견적서(내역서) 엑셀로 견적 줄 채우기(AOS 1묶음 2번, 대표가 실제 표본을 줌 2026-11-25).
// AOS '보험 수리비 견적서(내역서)'를 엑셀(xls)로 저장해 올리면 줄(탈착·판금·도장 공임, 부품, 도장 재료비)을 읽어
// 견적 초안에 더한다. 앱은 AOS가 낸 공임 금액을 그대로 쓴다(AOS를 쓰지 않으면 이 기능을 쓰지 않으면 된다).
import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { appConfig, estimateLine } from "@/db/schema";
import type { Role } from "@/modules/auth/roles";
import { parseWon } from "@/modules/bank/rules";
import { readSheet, type Grid } from "@/modules/bank/sheet-read";
import { UserError } from "@/modules/platform/errors";
import { getEstimate, saveLine } from "./estimate";

export class AosEstimateError extends UserError {}
type Actor = { id: string; roles: Role[] };

export type AosLine = {
  /** 엑셀 No */
  no: number;
  category: "detach" | "sheet" | "paint" | "part" | "etc";
  name: string;
  /** 부품 번호(부품 줄) */
  partNo: string;
  qty: number;
  /** 부품 단가(부품 줄) 또는 도장 재료비 줄의 금액은 laborWon */
  unitWon: number;
  laborMinutes: number;
  laborWon: number;
  note: string;
};
export type AosEstimate = {
  fileName: string;
  /** 엑셀 머리 정보(견적과 맞는지 보여 주기용) */
  head: { insurer: string; claimNo: string; plate: string; rateWon: number | null; subtotal: number | null };
  lines: AosLine[];
  /** 읽지 못해 건너뛴 줄 */
  skipped: string[];
};

const text = (v: unknown) => (v == null ? "" : String(v).replace(/\s+/g, " ").trim());
const num = (v: unknown) => {
  const n = parseWon(typeof v === "number" ? Math.round(v * 1000) / 1000 : v);
  return n == null ? null : n;
};
const dec = (v: unknown) => {
  if (typeof v === "number") return v;
  const n = Number(text(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
};

/** 작업 글자 → 견적 구분 */
function categoryOf(work: string): AosLine["category"] {
  if (/도장/.test(work)) return "paint";
  if (/탈착|탈부착|교환|분해|조립|탈거|장착/.test(work)) return "detach";
  if (/판금|수리|오버홀|성형|교정|용접|절단|보수/.test(work)) return "sheet";
  return "etc";
}

/** 라벨 칸 바로 오른쪽(같은 줄)에서 값을 찾는다. 라벨이 '보험사명'처럼 띄어쓰기가 달라도 맞춘다 */
function after(grid: Grid, label: RegExp, max = 40): string {
  for (const row of grid.slice(0, max)) {
    const i = row.findIndex((c) => label.test(text(c).replace(/\s/g, "")));
    if (i < 0) continue;
    for (let j = i + 1; j < row.length; j++) {
      const t = text(row[j]);
      if (t && !/^(담보|피보|수리차량|사고일자|공장|주\s*소|대\s*표|사업자|전화|팩스)/.test(t.replace(/\s/g, ""))) return t;
    }
  }
  return "";
}

/** 라벨 칸 오른쪽 첫 숫자 */
function numAfter(grid: Grid, label: RegExp, max = 40): number | null {
  for (const row of grid.slice(0, max)) {
    const i = row.findIndex((c) => label.test(text(c).replace(/\s/g, "")));
    if (i < 0) continue;
    for (let j = i + 1; j < row.length; j++) {
      const n = typeof row[j] === "number" ? Math.round(row[j] as number) : num(row[j]);
      if (n != null) return n;
    }
  }
  return null;
}

/** 엑셀 → 견적 줄. 제목 줄(No·작업항목 및 부품명·작업·H.Q %·부품코드·부품가격·공임)을 보고 칸을 찾는다 */
export function parseAosEstimate(grid: Grid, fileName = ""): AosEstimate {
  const isHead = (r: Grid[number]) => r.some((c) => /작업항목/.test(text(c))) && r.some((c) => /부품가격/.test(text(c)));
  const at = grid.findIndex(isHead);
  if (at < 0) throw new AosEstimateError("AOS 견적서(내역서) 엑셀이 아닌 것 같습니다. '작업항목 및 부품명·부품가격' 제목 줄을 찾지 못했습니다. AOS 견적서(내역서) 화면에서 엑셀로 저장한 파일을 올려 주세요");
  const h = grid[at];
  const col = (re: RegExp) => h.findIndex((c) => re.test(text(c).replace(/\s/g, "")));
  const cNo = col(/^No$/i);
  const cName = col(/작업항목/);
  const cWork = col(/^작업$/);
  const cHq = col(/H\.?Q/i);
  const cCode = col(/부품코드/);
  const cPrice = col(/부품가격/);
  const cLabor = col(/^공임$/);
  const cNote = col(/비고/);
  if (cName < 0 || cPrice < 0 || cLabor < 0) throw new AosEstimateError("제목 줄에서 작업항목·부품가격·공임 칸을 찾지 못했습니다");

  const lines: AosLine[] = [];
  const skipped: string[] = [];
  for (let i = at + 1; i < grid.length; i++) {
    const r = grid[i];
    if (isHead(r)) continue; // 쪽마다 되풀이되는 제목 줄
    const name = text(r[cName]);
    const no = cNo >= 0 ? num(r[cNo]) : null;
    if (!name || no == null) continue; // 안내 문구·빈 줄
    const work = cWork >= 0 ? text(r[cWork]) : "";
    const hq = cHq >= 0 ? dec(r[cHq]) : null;
    const price = cPrice >= 0 ? (num(r[cPrice]) ?? 0) : 0;
    const labor = num(r[cLabor]) ?? 0;
    const partNo = cCode >= 0 ? text(r[cCode]) : "";
    const note = cNote >= 0 ? text(r[cNote]) : "";
    if (work) {
      const category = categoryOf(work);
      lines.push({ no, category, name: `${name} ${work}`, partNo: "", qty: 1, unitWon: 0, laborMinutes: hq != null && hq > 0 ? Math.round(hq * 60) : 0, laborWon: labor, note });
      // 도장 줄의 부품가격은 도장 재료비다(AOS는 공임 쪽 '재료대'로 센다). 금액만 남기는 줄로 따로 둔다
      if (price > 0) lines.push({ no, category: "etc", name: `${name} 재료비`, partNo: "", qty: 1, unitWon: 0, laborMinutes: 0, laborWon: price, note: "AOS 도장 재료비" });
    } else if (price > 0 || partNo) {
      const q = hq != null && Number.isInteger(hq) && hq >= 1 && hq <= 99 ? hq : 1;
      lines.push({ no, category: "part", name, partNo, qty: q, unitWon: price, laborMinutes: 0, laborWon: 0, note });
    } else skipped.push(`${no}번 ${name}: 작업·부품가격이 없어 건너뜀`);
  }
  if (!lines.length) throw new AosEstimateError("견적 줄이 없습니다. 파일을 확인해 주세요");
  const rate = numAfter(grid, /^탈부착M\/H$/);
  const subtotal = numAfter(grid, /^소계$/);
  return {
    fileName,
    head: { insurer: after(grid, /^보험사명$/), claimNo: after(grid, /^접수번호$/), plate: after(grid, /^차량번호$/).replace(/\s/g, ""), rateWon: rate && rate > 0 ? rate : null, subtotal },
    lines,
    skipped,
  };
}

/** 줄 합계(부가세 전): 부품 + 공임 */
export const aosLinesTotal = (lines: AosLine[]) => lines.reduce((s, l) => s + l.qty * l.unitWon + l.laborWon, 0);

// ── 올린 파일은 견적 하나당 사람마다 하나 보관(설정 저장소, 줄 값만)
const keyOf = (userId: string) => `aos-est:${userId}`;
export type AosEstimateUpload = AosEstimate & { estimateId: string; at: string };

export async function loadAosEstimate(db: Db, userId: string, estimateId: string): Promise<AosEstimateUpload | null> {
  const [r] = await db.select({ data: appConfig.data }).from(appConfig).where(eq(appConfig.key, keyOf(userId)));
  const d = r?.data as AosEstimateUpload | undefined;
  return d?.estimateId === estimateId && d.lines?.length ? d : null;
}

export async function uploadAosEstimate(db: Db, actor: Actor, estimateId: string, file: { bytes: Uint8Array; fileName: string }, now = new Date()) {
  const e = await getEstimate(db, estimateId);
  if (e.status !== "draft") throw new AosEstimateError("작성 중인 견적에만 AOS 견적서를 넣을 수 있습니다");
  const parsed = parseAosEstimate(readSheet(file.bytes, file.fileName), file.fileName);
  const data: AosEstimateUpload = { ...parsed, estimateId, at: now.toISOString() };
  await db
    .insert(appConfig)
    .values({ key: keyOf(actor.id), data, updatedBy: actor.id, updatedAt: now })
    .onConflictDoUpdate({ target: appConfig.key, set: { data, updatedBy: actor.id, updatedAt: now } });
  return parsed.lines.length;
}

export async function clearAosEstimate(db: Db, actor: Actor) {
  await db.delete(appConfig).where(eq(appConfig.key, keyOf(actor.id)));
}

/**
 * 올린 줄을 견적 초안에 더한다(이미 있는 줄은 그대로 두고 뒤에 더함). 보험 견적이면 보험 줄, 일반 견적이면 일반 줄로 넣는다.
 * 부품 구분은 새 부품(A)으로 넣는다. 엑셀에 구분이 없다. 넣은 뒤 부품 구분·가격은 화면에서 고친다.
 */
export async function importAosEstimate(db: Db, actor: Actor, estimateId: string, now = new Date()) {
  const up = await loadAosEstimate(db, actor.id, estimateId);
  if (!up) throw new AosEstimateError("먼저 AOS 견적서 엑셀을 올려 주세요");
  const e = await getEstimate(db, estimateId);
  if (e.status !== "draft") throw new AosEstimateError("작성 중인 견적에만 넣을 수 있습니다");
  const payer = e.kind === "insurance" ? "insurance" : "general";
  const before = (await db.select({ id: estimateLine.id }).from(estimateLine).where(eq(estimateLine.estimateId, estimateId))).length;
  for (const l of up.lines) {
    await saveLine(db, actor, estimateId, {
      payer,
      category: l.category,
      name: l.name,
      partCode: "A",
      partNo: l.partNo,
      qty: l.qty,
      unitWon: l.unitWon,
      laborMinutes: l.category === "part" || !l.laborWon ? null : l.laborMinutes || null,
      // 금액이 0인 공임 줄도 0원 그대로 넣는다(기준표 시간 계산으로 바뀌지 않게 시간을 비움)
      laborWon: l.category === "part" ? null : l.laborWon,
      note: l.note || "AOS 견적서",
      laborCode: undefined,
    }, now);
  }
  await clearAosEstimate(db, actor);
  return { added: up.lines.length, before, total: aosLinesTotal(up.lines) };
}
