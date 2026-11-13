// 마감 때 보고서 저장(보고서 센터 5단계): 월 마감을 대표가 승인하면 그 달 보고서를 모두 계산해 숫자 그대로 남긴다.
// 나중에 지난달 전표가 취소 전표 등으로 바뀌어도 마감 때 본 숫자를 다시 볼 수 있다(보고서 화면 '마감 저장본').
import { and, eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { reportSnapshot } from "@/db/schema";
import { seoulDate } from "@/modules/platform/time";
import { REPORTS } from "./catalog";
import type { Metric } from "./service";
import type { RTable } from "./kit";
import { comparePeriod, periodOf } from "./period";
import { BUILDERS } from "./run";

export type SavedBody = { kpis: Metric[]; tables: RTable[]; notes?: string[] };

/** 그 달 보고서를 모두 저장(이미 있으면 바꾼다). 계산이 안 되는 보고서는 건너뛴다 */
export async function saveMonthSnapshots(db: Db, actorId: string, ym: string, now = new Date()) {
  const p = periodOf("month", `${ym}-01`);
  const q = comparePeriod(p, "prev");
  const saved: string[] = [];
  for (const def of REPORTS) {
    const build = BUILDERS[def.id];
    if (def.phase || !build) continue;
    try {
      const b = await build({ db, actor: { id: actorId, roles: ["owner"] }, p, q, now, today: seoulDate(now), opt: {} });
      const body: SavedBody = { kpis: b.kpis, tables: b.tables, notes: b.notes };
      await db
        .insert(reportSnapshot)
        .values({ ym, reportId: def.id, body, savedBy: actorId, savedAt: now })
        .onConflictDoUpdate({ target: [reportSnapshot.ym, reportSnapshot.reportId], set: { body, savedBy: actorId, savedAt: now } });
      saved.push(def.id);
    } catch (e) {
      console.error(`보고서 저장 실패 ${ym} ${def.id}`, e);
    }
  }
  return saved;
}

export async function getSnapshot(db: Db, ym: string, reportId: string) {
  const [r] = await db
    .select()
    .from(reportSnapshot)
    .where(and(eq(reportSnapshot.ym, ym), eq(reportSnapshot.reportId, reportId)));
  return r ? { ...r, body: r.body as SavedBody } : null;
}
