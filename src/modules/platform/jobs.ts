// 주기 작업 — 앱 설계서 8.6. jobs 컨테이너가 정해진 시각에 /api/jobs/<이름> 을 부른다.
// 같은 작업·같은 날은 한 번만 돈다(두 번 불려도 알림이 겹치지 않게).
import { and, eq, lt } from "drizzle-orm";
import type { Db } from "@/db/client";
import { jobRun, session } from "@/db/schema";
import { seoulDate } from "./time";
import { notifyDueConsults, purgeUnconsented, sendReminders } from "@/modules/customer/service";
import { equipmentDailyAlerts } from "@/modules/equipment/service";
import { ncDailyAlerts } from "@/modules/quality/nc";
import { csDailyAlerts } from "@/modules/cs/service";
import { syncNextMinWage } from "@/modules/staff/min-wage";
import { instructionDailyAlerts } from "@/modules/task/service";
import { stockDailyAlerts } from "@/modules/purchase/stock";
import { scheduleDailyAlerts } from "@/modules/schedule/service";

export type JobResult = { job: string; status: "done" | "skipped" | "failed"; message?: string };

type JobFn = (db: Db, today: string, now: Date) => Promise<string>;

/** 작업 목록. 1차부터 윤활·예방정비·일상점검 누락·설문 같은 작업을 여기에 더한다 */
export const JOBS: Record<string, JobFn> = {
  daily: async (db, _today, now) => {
    const removed = await db.delete(session).where(lt(session.expiresAt, now)).returning({ t: session.tokenHash });
    const due = await notifyDueConsults(db, now);
    const purged = await purgeUnconsented(db, now);
    const equip = await equipmentDailyAlerts(db, now);
    const nc = await ncDailyAlerts(db, now);
    const cs = await csDailyAlerts(db, now);
    const wage = await syncNextMinWage(db, now);
    const wi = await instructionDailyAlerts(db, now);
    const stock = await stockDailyAlerts(db, now);
    const sch = await scheduleDailyAlerts(db, now);
    return `만료 세션 ${removed.length}건 정리 · ${due} · ${purged} · ${equip} · ${nc} · ${cs} · ${wage.message} · ${wi} · ${stock} · ${sch}`;
  },
  /** 매일 16:00: 내일 입고 예약 전날 안내(STD-01 7단계) */
  reminders: async (db, _today, now) => sendReminders(db, now),
};

export async function runJob(db: Db, job: string, now = new Date()): Promise<JobResult> {
  const fn = JOBS[job];
  if (!fn) return { job, status: "failed", message: "알 수 없는 작업" };
  const today = seoulDate(now);
  const claimed = await db.insert(jobRun).values({ job, runDate: today }).onConflictDoNothing().returning({ id: jobRun.id });
  if (!claimed.length) return { job, status: "skipped", message: "오늘 이미 실행함" };
  try {
    const message = await fn(db, today, now);
    await db.update(jobRun).set({ finishedAt: new Date(), ok: true, message }).where(eq(jobRun.id, claimed[0].id));
    return { job, status: "done", message };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await db.update(jobRun).set({ finishedAt: new Date(), ok: false, message }).where(eq(jobRun.id, claimed[0].id));
    return { job, status: "failed", message };
  }
}

export async function recentRuns(db: Db, job: string) {
  return db.select().from(jobRun).where(and(eq(jobRun.job, job))).orderBy(jobRun.runDate).limit(30);
}
