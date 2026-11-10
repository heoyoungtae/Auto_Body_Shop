// 문서 번호 — 앱 설계서 7.4: 접두어-연월-일련번호(예: RO-2611-0012). 서버만 매긴다.
import { sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { docSequence } from "@/db/schema";
import { seoulPeriod } from "./time";

export const DOC_PREFIXES = ["CS", "RO", "ES", "WO", "IV", "CP", "PO", "OS", "EX", "NC", "R", "L", "CH", "LV", "EC", "LC", "PL", "EF", "WI", "SG", "RK", "IA", "HA", "AC"] as const;
export type DocPrefix = (typeof DOC_PREFIXES)[number];

export async function nextDocNo(db: Db, prefix: DocPrefix, now = new Date()): Promise<string> {
  const period = seoulPeriod(now);
  const [row] = await db
    .insert(docSequence)
    .values({ prefix, period, last: 1 })
    .onConflictDoUpdate({ target: [docSequence.prefix, docSequence.period], set: { last: sql`${docSequence.last} + 1` } })
    .returning({ last: docSequence.last });
  return `${prefix}-${period}-${String(row.last).padStart(4, "0")}`;
}
