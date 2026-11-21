// 문서 번호 — 앱 설계서 7.4: 접두어-연월-일련번호(예: RO-2611-0012). 서버만 매긴다.
import { eq, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { branch, docSequence, MAIN_BRANCH_ID } from "@/db/schema";
import { seoulPeriod } from "./time";

export const DOC_PREFIXES = [
  "CS",
  "RO",
  "ES",
  "WO",
  "IV",
  "CP",
  "PO",
  "OS",
  "EX",
  "NC",
  "R",
  "L",
  "CH",
  "LV",
  "EC",
  "LC",
  "PL",
  "EF",
  "WI",
  "SG",
  "RK",
  "IA",
  "HA",
  "AC",
  "GF",
  "TR",
  "PY",
  "PE",
  "RT",
  "PM",
  "BL",
  "FS",
  "MR",
  "ST",
  "QT",
  "HC",
  "RC",
  "OL",
  "PG",
] as const;
export type DocPrefix = (typeof DOC_PREFIXES)[number];

export async function nextDocNo(
  db: Db,
  prefix: DocPrefix,
  now = new Date(),
  /** 지점 코드(영문 1~2자). 지점 서류는 번호가 지점마다 따로 매겨진다(예: RO-S2611-0005). 본점은 빈 값 */
  branchCode = "",
): Promise<string> {
  const period = seoulPeriod(now);
  const key = branchCode ? `${prefix}-${branchCode}` : prefix;
  const [row] = await db
    .insert(docSequence)
    .values({ prefix: key, period, last: 1 })
    .onConflictDoUpdate({
      target: [docSequence.prefix, docSequence.period],
      set: { last: sql`${docSequence.last} + 1` },
    })
    .returning({ last: docSequence.last });
  return `${prefix}-${branchCode}${period}-${String(row.last).padStart(4, "0")}`;
}

/** 지점 서류 번호: 그 지점의 전표 코드를 붙인다(본점·코드 없는 지점은 그대로, 예: RO-2611-0012 / RO-S2611-0005) */
export async function branchDocNo(db: Db, prefix: DocPrefix, now: Date, branchId: string | null | undefined): Promise<string> {
  let code = "";
  if (branchId && branchId !== MAIN_BRANCH_ID) {
    const [b] = await db.select({ code: branch.code }).from(branch).where(eq(branch.id, branchId));
    code = b?.code ?? "";
  }
  return nextDocNo(db, prefix, now, code);
}

/** 행위자의 지금 지점(로그인 때 정해짐: 소속 지점 또는 마지막으로 고른 지점). 모르면 본점 */
export function actorBranch(actor: unknown): string {
  const b = actor && typeof actor === "object" ? (actor as { branchId?: unknown }).branchId : undefined;
  return typeof b === "string" && b ? b : MAIN_BRANCH_ID;
}
