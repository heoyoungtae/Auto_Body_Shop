// 퇴직 처리 점검표(F-11-07): 반납·인계 0건 확인, 확인서·계정 잠금, 정산 기한, 퇴직금 어림
import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { appUser, fiveSZone, staffProfile } from "@/db/schema";
import {
  checkExitItem,
  closeExit,
  exitTodos,
  getExit,
  lockExitAccount,
  severanceEstimate,
  startExit,
} from "@/modules/staff/exit";
import { seedShop, testDb } from "./db";

let db: Db;
let ids: Awaited<ReturnType<typeof seedShop>>;
beforeEach(async () => {
  db = await testDb();
  ids = await seedShop(db);
});
const owner = () => ({ id: ids.owner, roles: ["owner" as const] });
const acct = () => ({ id: ids.account, roles: ["accounting" as const] });
const pm = () => ({ id: ids.manager, roles: ["plant_manager" as const] });
const now = new Date("2026-12-01T01:00:00Z");

describe("퇴직 처리", () => {
  it("시작 → 항목 확인 → 마치기", async () => {
    await db
      .insert(staffProfile)
      .values({ userId: ids.tech1, hiredOn: "2026-03-02" });
    await expect(
      startExit(
        db,
        pm(),
        {
          userId: ids.tech1,
          leftOn: "2026-12-31",
          reason: "resign",
          noticeOn: "",
        },
        now,
      ),
    ).rejects.toThrow(/회계/);
    await expect(
      startExit(
        db,
        acct(),
        {
          userId: ids.tech1,
          leftOn: "2026-12-31",
          reason: "resign",
          noticeOn: "2027-01-02",
        },
        now,
      ),
    ).rejects.toThrow(/앞이어야/);
    const id = await startExit(
      db,
      acct(),
      {
        userId: ids.tech1,
        leftOn: "2026-12-31",
        reason: "resign",
        noticeOn: "2026-12-01",
      },
      now,
    );
    await expect(
      startExit(
        db,
        acct(),
        {
          userId: ids.tech1,
          leftOn: "2026-12-31",
          reason: "resign",
          noticeOn: "",
        },
        now,
      ),
    ).rejects.toThrow(/이미/);
    const [p] = await db
      .select()
      .from(staffProfile)
      .where(eq(staffProfile.userId, ids.tech1));
    expect(p).toMatchObject({ leftOn: "2026-12-31", leftReason: "본인 사직" });
    const g = await getExit(db, acct(), id);
    expect(g.x.settleDue).toBe("2027-01-14");
    expect(g.sev).toMatchObject({ eligible: false });
    // 담당 구역이 남아 있으면 인계 확인 안 됨
    await db
      .insert(fiveSZone)
      .values({ code: "Z", name: "시험 구역", ownerId: ids.tech1 });
    await expect(
      checkExitItem(db, pm(), id, "handover", "", now),
    ).rejects.toThrow(/넘기지 않은/);
    await db
      .update(fiveSZone)
      .set({ ownerId: ids.tech2 })
      .where(eq(fiveSZone.code, "Z"));
    await checkExitItem(db, pm(), id, "handover", "", now);
    await checkExitItem(db, pm(), id, "return_items", "", now);
    await expect(
      checkExitItem(db, acct(), id, "pledge", "", now),
    ).rejects.toThrow(/확인서/);
    await expect(
      checkExitItem(db, acct(), id, "settle", "", now),
    ).rejects.toThrow(/지급한 날/);
    await expect(lockExitAccount(db, acct(), id, now)).rejects.toThrow(
      /퇴직일/,
    );
    expect((await exitTodos(db, pm(), "2026-12-01")).length).toBe(0);
    expect((await exitTodos(db, acct(), "2027-01-15"))[0].when).toBe("late");
    const jan = new Date("2027-01-02T01:00:00Z");
    await lockExitAccount(db, acct(), id, jan);
    const [u] = await db
      .select()
      .from(appUser)
      .where(eq(appUser.id, ids.tech1));
    expect(u.active).toBe(false);
    await checkExitItem(db, acct(), id, "settle", "01-05 임금 이체", jan);
    await checkExitItem(db, acct(), id, "insurance", "01-03 상실 신고", jan);
    await expect(closeExit(db, acct(), id, jan)).rejects.toThrow(/비밀유지/);
  });

  it("퇴직금 어림: 1년 미만 대상 아님", async () => {
    expect(
      await severanceEstimate(db, ids.tech1, "2026-01-01", "2026-12-30"),
    ).toMatchObject({ eligible: false });
    expect(
      await severanceEstimate(db, ids.tech1, "2025-01-01", "2026-12-31"),
    ).toMatchObject({ eligible: true, amount: null });
    expect(
      await getExit(db, owner(), "00000000-0000-0000-0000-000000000000").catch(
        (e) => e.message,
      ),
    ).toMatch(/찾을 수 없/);
  });
});
