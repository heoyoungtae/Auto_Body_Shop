// AOS 지급 조회 엑셀로 보험 입금 맞추기(AOS 1묶음 1번, 대표 결정 2026-11-23).
// AOS '보험금 종결·지급 조회' 화면은 엑셀로 저장된다. 그 파일을 올리면 제목 줄을 보고 칸(접수번호·차량번호·지급액·지급일)을 찾아
// 청구한 건과 맞춘다. 실제 입금 확인은 보험 청구 화면의 입금 확인(recordPayment)을 그대로 쓴다(전표·감액 알림 같음).
// AOS 를 쓰지 않으면 이 화면을 쓰지 않으면 된다. 다른 일은 막지 않는다.
import { and, eq, inArray } from "drizzle-orm";
import type { Db } from "@/db/client";
import { appConfig, insuranceClaim, repairOrder, vehicle } from "@/db/schema";
import { can } from "@/modules/auth/permissions";
import type { Role } from "@/modules/auth/roles";
import { parseDateTime, parseWon } from "@/modules/bank/rules";
import { readSheet, type Grid } from "@/modules/bank/sheet-read";
import { UserError } from "@/modules/platform/errors";
import { seoulDate } from "@/modules/platform/time";
import { recordPayment } from "./claims";

export class AosPaidError extends UserError {}
type Actor = { id: string; roles: Role[] };

/** 엑셀 한 줄에서 읽은 값 */
export type AosPaidRow = { line: number; claimNo: string; plate: string; insurer: string; paidWon: number; paidOn: string | null; memo: string };

const COLS = {
  claimNo: /접수\s*번호|사고\s*번호|보상\s*번호|청구\s*번호|증권\s*번호/,
  plate: /차량\s*번호|차\s*번호|차번/,
  paidWon: /지급\s*(보험금|금액|액)|실\s*지급|결정\s*금액|보험금/,
  paidOn: /지급\s*일|종결\s*일|결정\s*일|입금\s*일/,
  insurer: /보험\s*사|보험\s*회사|공제/,
  memo: /감액|삭감|사유|비고|메모/,
} as const;
type Col = keyof typeof COLS;

const text = (v: unknown) => (v == null ? "" : String(v).trim());
export const digits = (s: string) => s.replace(/\D/g, "");
export const plateKey = (s: string) => s.replace(/\s/g, "");

/** 제목 줄 찾기: 앞 20줄 중 지급액 칸과 (접수번호 또는 차량번호) 칸이 함께 있는 첫 줄 */
function findHeader(grid: Grid): { at: number; col: Partial<Record<Col, number>> } | null {
  for (let i = 0; i < Math.min(grid.length, 20); i++) {
    const col: Partial<Record<Col, number>> = {};
    grid[i].forEach((c, j) => {
      const t = text(c);
      if (!t || t.length > 20) return;
      for (const k of Object.keys(COLS) as Col[]) {
        // '보험금' 은 지급액이 따로 없을 때만 쓴다. 보험사 칸과 겹치지 않게 순서대로 한 칸에 하나만
        if (col[k] == null && COLS[k].test(t)) {
          if (k === "insurer" && COLS.paidWon.test(t)) continue;
          if (k === "paidWon" && /지급\s*일|일자/.test(t)) continue;
          col[k] = j;
          break;
        }
      }
    });
    if (col.paidWon != null && (col.claimNo != null || col.plate != null)) return { at: i, col };
  }
  return null;
}

/** 엑셀(또는 CSV) → 지급 줄. 제목 줄을 못 찾으면 무엇이 없는지 알려 준다 */
export function parseAosPaid(grid: Grid): AosPaidRow[] {
  const h = findHeader(grid);
  if (!h) throw new AosPaidError("제목 줄을 찾지 못했습니다. AOS '보험금 종결·지급 조회' 화면에서 엑셀로 저장한 파일인지 봐 주세요(접수번호나 차량번호, 지급액 칸이 있어야 합니다)");
  const get = (r: Grid[number], k: Col) => (h.col[k] == null ? null : r[h.col[k]!]);
  const out: AosPaidRow[] = [];
  for (let i = h.at + 1; i < grid.length; i++) {
    const r = grid[i];
    const paidWon = parseWon(get(r, "paidWon"));
    const claimNo = text(get(r, "claimNo"));
    const plate = plateKey(text(get(r, "plate")));
    if (paidWon == null || paidWon <= 0 || (!digits(claimNo) && !plate)) continue; // 합계·빈 줄
    if (/합\s*계|소\s*계/.test(r.map(text).join(""))) continue;
    out.push({ line: i + 1, claimNo, plate, insurer: text(get(r, "insurer")), paidWon, paidOn: parseDateTime(get(r, "paidOn"))?.on ?? null, memo: text(get(r, "memo")) });
  }
  if (!out.length) throw new AosPaidError("지급 줄이 없습니다. 조회 기간을 넓혀 다시 저장해 주세요");
  return out;
}

export type AosMatchStatus = "ok" | "cut" | "over" | "paid" | "dup" | "none";
export const AOS_MATCH_LABEL: Record<AosMatchStatus, string> = {
  ok: "청구액대로 들어옴",
  cut: "덜 들어옴(감액)",
  over: "청구액보다 많음",
  paid: "이미 입금 확인함",
  dup: "같은 청구가 위에 있음",
  none: "맞는 청구 없음",
};

export type AosMatch = AosPaidRow & {
  status: AosMatchStatus;
  claim: { roId: string; seq: number; docNo: string; roNo: string; insurer: string; claimedWon: number | null; paidWon: number | null } | null;
  /** 입금 확인할 수 있는 줄(청구한 건과 맞고 아직 입금 확인 전) */
  ready: boolean;
};

/** 청구한(또는 이미 입금 확인한) 건과 맞추기. 접수번호 숫자가 같으면 우선, 없으면 차량번호(+금액) */
export async function matchAosPaid(db: Db, rows: AosPaidRow[]): Promise<AosMatch[]> {
  const claims = await db
    .select({ roId: insuranceClaim.repairOrderId, seq: insuranceClaim.seq, docNo: insuranceClaim.docNo, claimNo: insuranceClaim.claimNo, insurer: insuranceClaim.insurer, status: insuranceClaim.status, claimedWon: insuranceClaim.claimedWon, paidWon: insuranceClaim.paidWon, roNo: repairOrder.docNo, plate: vehicle.plateNo })
    .from(insuranceClaim)
    .innerJoin(repairOrder, eq(repairOrder.id, insuranceClaim.repairOrderId))
    .innerJoin(vehicle, eq(vehicle.id, repairOrder.vehicleId))
    .where(inArray(insuranceClaim.status, ["claimed", "paid"]));
  const used = new Set<string>();
  return rows.map((row) => {
    const no = digits(row.claimNo);
    let hit = no.length >= 5 ? claims.find((c) => digits(c.claimNo) === no) : undefined;
    if (!hit && row.plate) {
      // 차량번호로는 위 줄에서 이미 맞춘 청구를 빼고 찾는다(쌍방 과실이면 한 차에 청구가 둘)
      const same = claims.filter((c) => plateKey(c.plate) === row.plate && !used.has(`${c.roId}:${c.seq}`));
      hit =
        same.find((c) => c.status === "claimed" && c.claimedWon === row.paidWon) ??
        same.find((c) => c.status === "paid" && c.paidWon === row.paidWon) ??
        same.find((c) => c.status === "claimed") ??
        (same.length === 1 ? same[0] : undefined);
    }
    if (!hit) return { ...row, status: "none" as const, claim: null, ready: false };
    const key = `${hit.roId}:${hit.seq}`;
    const claim = { roId: hit.roId, seq: hit.seq, docNo: hit.docNo, roNo: hit.roNo, insurer: hit.insurer, claimedWon: hit.claimedWon, paidWon: hit.paidWon };
    if (used.has(key)) return { ...row, status: "dup" as const, claim, ready: false };
    used.add(key);
    if (hit.status === "paid") return { ...row, status: "paid" as const, claim, ready: false };
    const status: AosMatchStatus = hit.claimedWon == null || row.paidWon > hit.claimedWon ? "over" : row.paidWon < hit.claimedWon ? "cut" : "ok";
    return { ...row, status, claim, ready: status !== "over" };
  });
}

// ── 올린 파일은 맞추기가 끝날 때까지 사람마다 하나 보관(설정 저장소, 줄 값만)
const keyOf = (userId: string) => `aos-paid:${userId}`;
export type AosPaidUpload = { fileName: string; at: string; rows: AosPaidRow[] };

export async function loadAosUpload(db: Db, userId: string): Promise<AosPaidUpload | null> {
  const [r] = await db.select({ data: appConfig.data }).from(appConfig).where(eq(appConfig.key, keyOf(userId)));
  const d = r?.data as AosPaidUpload | undefined;
  return d?.rows?.length ? d : null;
}

export async function uploadAosPaid(db: Db, actor: Actor, file: { bytes: Uint8Array; fileName: string }, now = new Date()) {
  if (!can(actor, "claim.money")) throw new AosPaidError("보험 입금 확인은 회계 담당·대표가 합니다");
  const rows = parseAosPaid(readSheet(file.bytes, file.fileName));
  const data: AosPaidUpload = { fileName: file.fileName, at: now.toISOString(), rows };
  await db
    .insert(appConfig)
    .values({ key: keyOf(actor.id), data, updatedBy: actor.id, updatedAt: now })
    .onConflictDoUpdate({ target: appConfig.key, set: { data, updatedBy: actor.id, updatedAt: now } });
  return rows.length;
}

export async function clearAosUpload(db: Db, actor: Actor) {
  await db.delete(appConfig).where(and(eq(appConfig.key, keyOf(actor.id))));
}

/**
 * 고른 줄을 입금 확인한다. 날짜가 없거나 앞날이면 오늘로. 감액 줄은 사유가 있어야 한다(없으면 엑셀 비고 칸 값을 쓴다).
 * 줄마다 따로 처리해 한 줄이 막혀도 나머지는 확인된다.
 */
export async function applyAosPaid(db: Db, actor: Actor, picks: { line: number; cutReason: string }[], now = new Date()) {
  if (!can(actor, "claim.money")) throw new AosPaidError("보험 입금 확인은 회계 담당·대표가 합니다");
  const up = await loadAosUpload(db, actor.id);
  if (!up) throw new AosPaidError("먼저 AOS 지급 엑셀을 올려 주세요");
  if (!picks.length) throw new AosPaidError("입금 확인할 줄을 골라 주세요");
  const matches = await matchAosPaid(db, up.rows);
  const today = seoulDate(now);
  const done: string[] = [];
  const failed: string[] = [];
  for (const p of picks) {
    const m = matches.find((x) => x.line === p.line);
    if (!m?.claim || !m.ready) {
      failed.push(`${p.line}번째 줄: ${m ? AOS_MATCH_LABEL[m.status] : "없는 줄"}`);
      continue;
    }
    const paidOn = m.paidOn && m.paidOn <= today ? m.paidOn : today;
    try {
      const v = await recordPayment(db, actor, m.claim.roId, { paidOn, paidWon: m.paidWon, cutReason: p.cutReason.trim() || (m.status === "cut" ? m.memo : "") }, now, m.claim.seq);
      done.push(`${m.claim.docNo}(${v})`);
    } catch (e) {
      failed.push(`${p.line}번째 줄 ${m.claim.docNo}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return { done, failed };
}
