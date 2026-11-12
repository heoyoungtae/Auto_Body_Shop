// 마감한 날·달에는 전표를 새로 넣지 않는다(STD-12 12.4). 고칠 것은 오늘 날짜의 취소 전표로.
import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { dailyClose, monthClose } from "@/db/schema";
import { UserError } from "@/modules/platform/errors";

export class LockedError extends UserError {}

export async function monthLocked(db: Db, ym: string) {
  const [m] = await db
    .select({ status: monthClose.status })
    .from(monthClose)
    .where(eq(monthClose.ym, ym));
  return m && m.status !== "returned" ? m.status : null;
}

/** 입금 전표: 그날 일일 마감을 했거나 그 달 월 마감을 올렸으면 막는다 */
export async function assertOpenDay(db: Db, day: string) {
  const [d] = await db
    .select({ id: dailyClose.id })
    .from(dailyClose)
    .where(eq(dailyClose.day, day));
  if (d)
    throw new LockedError(
      `${day}은(는) 일일 마감을 했습니다. 그날 것을 고치려면 오늘 날짜로 취소 전표를 적으세요`,
    );
  await assertOpenMonth(db, day);
}

/** 지출 지급 등: 그 달 월 마감을 올렸거나 승인했으면 막는다 */
export async function assertOpenMonth(db: Db, day: string) {
  const ym = day.slice(0, 7);
  const st = await monthLocked(db, ym);
  if (st)
    throw new LockedError(
      `${ym}은(는) 월 마감을 ${st === "approved" ? "승인했습니다" : "올렸습니다(승인 대기)"}. 그 달 날짜로는 적을 수 없습니다${st === "submitted" ? ". 고쳐야 하면 대표가 마감을 돌려보내야 합니다" : ""}`,
    );
}
