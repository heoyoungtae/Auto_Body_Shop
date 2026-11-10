// 법규 대장(F-Q-06)·준수 평가(F-Q-07), 총람 Q.6
import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { legalItem, nonconformance, notification } from "@/db/schema";
import { myTodos } from "@/modules/dashboard/todo";
import {
  confirmLegalYear,
  createLegal,
  evalSheet,
  evaluateLegal,
  getLegal,
  importAppendixC,
  legalDailyAlerts,
  listLegal,
  recordDone,
  recordInspection,
  recordRevCheck,
  updateLegal,
  type LegalInput,
} from "@/modules/quality/legal";
import {
  APPENDIX_C,
  dueStage,
  nextDueAfter,
} from "@/modules/quality/legal-rules";
import { seedShop, testDb } from "./db";

let db: Db;
let ids: Awaited<ReturnType<typeof seedShop>>;
beforeEach(async () => {
  db = await testDb();
  ids = await seedShop(db);
});
const now = new Date("2026-11-10T00:00:00Z");
const safety = () => ({ id: ids.safety, roles: ["safety" as const] });
const owner = () => ({ id: ids.owner, roles: ["owner" as const] });
const tech = () => ({ id: ids.tech1, roles: ["technician" as const] });
const base: LegalInput = {
  area: "환경",
  lawName: "대기환경보전법",
  clause: "제23조",
  duty: "도장 부스 배출시설 신고",
  stdRef: "",
  applies: "yes",
  basis: "도장 부스 1기",
  ownerId: "",
  cycle: "yearly",
  nextDue: "2026-11-20",
  evidence: "",
  authority: "구청 환경과",
  permitNo: "",
  validUntil: "",
  note: "",
};

describe("법규 대장 규칙", () => {
  it("주기·기한 단계", () => {
    expect(nextDueAfter("yearly", "2026-11-10")).toBe("2027-11-10");
    expect(nextDueAfter("quarterly", "2026-11-30")).toBe("2027-02-28");
    expect(nextDueAfter("none", "2026-11-10")).toBeNull();
    expect(dueStage("2026-11-01", "2026-11-10", 30, 7)).toBe("late");
    expect(dueStage("2026-11-15", "2026-11-10", 30, 7)).toBe("second");
    expect(dueStage("2026-12-01", "2026-11-10", 30, 7)).toBe("first");
    expect(dueStage("2027-03-01", "2026-11-10", 30, 7)).toBeNull();
  });
});

describe("법규 대장", () => {
  it("부록 C 불러오기·대상 판단·이행 기록", async () => {
    await expect(importAppendixC(db, tech(), now)).rejects.toThrow(/안전환경/);
    expect(await importAppendixC(db, safety(), now)).toBe(APPENDIX_C.length);
    expect(await importAppendixC(db, safety(), now)).toBe(0);
    const { list } = await listLegal(db, safety(), "check", now);
    expect(list.length).toBe(APPENDIX_C.length);
    // 안전환경 담당 할 일: 대상 여부 확인
    expect(
      (await myTodos(db, safety(), now)).some((t) => t.key === "legal-check"),
    ).toBe(true);

    const x = list[0];
    await expect(
      updateLegal(
        db,
        safety(),
        x.id,
        { ...base, lawName: x.lawName, applies: "no", basis: "" },
        now,
      ),
    ).rejects.toThrow(/근거/);
    await expect(
      updateLegal(
        db,
        safety(),
        x.id,
        { ...base, lawName: x.lawName, nextDue: "" },
        now,
      ),
    ).rejects.toThrow(/다음 기한/);
    await updateLegal(
      db,
      safety(),
      x.id,
      { ...base, lawName: x.lawName, ownerId: ids.tech1 },
      now,
    );
    const n = await db
      .select()
      .from(notification)
      .where(eq(notification.userId, ids.tech1));
    expect(n.some((m) => m.title.includes("법규 담당"))).toBe(true);

    // 담당자는 이행 기록 가능, 다음 기한이 주기만큼 밀림
    await expect(
      recordDone(
        db,
        tech(),
        x.id,
        { doneOn: "2026-11-10", evidence: "", validUntil: "" },
        now,
      ),
    ).rejects.toThrow(/증빙/);
    expect(
      await recordDone(
        db,
        tech(),
        x.id,
        { doneOn: "2026-11-10", evidence: "신고필증 2026-01", validUntil: "" },
        now,
      ),
    ).toBe("2027-11-10");
    const r = await getLegal(db, x.id);
    expect(r.x.nextDue).toBe("2027-11-10");
    expect(r.events.map((e) => e.e.kind)).toContain("done");
    // 담당 아닌 직원은 못 함
    await expect(
      recordDone(
        db,
        { id: ids.tech2, roles: ["technician"] },
        x.id,
        { doneOn: "2026-11-10", evidence: "x", validUntil: "" },
        now,
      ),
    ).rejects.toThrow(/담당자/);
  });

  it("기한 알림·할 일", async () => {
    const id = await createLegal(
      db,
      safety(),
      { ...base, ownerId: ids.tech1, nextDue: "2026-11-15" },
      now,
    );
    expect(await legalDailyAlerts(db, now)).toMatch(/1건/);
    const t1 = await db
      .select()
      .from(notification)
      .where(eq(notification.userId, ids.tech1));
    expect(t1.some((m) => m.title.includes("기한 다가옴"))).toBe(true);
    // 7일 안이라 대표에게도
    const o = await db
      .select()
      .from(notification)
      .where(eq(notification.userId, ids.owner));
    expect(o.some((m) => m.title.includes("대기환경"))).toBe(true);
    // 같은 날 다시 돌려도 중복 알림 없음
    await legalDailyAlerts(db, now);
    expect(
      (
        await db
          .select()
          .from(notification)
          .where(eq(notification.userId, ids.tech1))
      ).filter((m) => m.title.includes("기한 다가옴")).length,
    ).toBe(1);
    expect(
      (await myTodos(db, tech(), now)).find((t) => t.key === `legal-due-${id}`)
        ?.when,
    ).toBe("today");
    expect((await listLegal(db, safety(), "due", now)).list.length).toBe(1);
  });

  it("관청 점검 지적·개정 확인 → 부적합·알림", async () => {
    const id = await createLegal(db, safety(), base, now);
    await expect(
      recordInspection(
        db,
        safety(),
        id,
        { on: "2026-11-10", finding: "표지 미부착", fixDue: "" },
        now,
      ),
    ).rejects.toThrow(/시정 기한/);
    const nc = await recordInspection(
      db,
      safety(),
      id,
      { on: "2026-11-10", finding: "표지 미부착", fixDue: "2026-11-30" },
      now,
    );
    expect(nc).toBeTruthy();
    const [row] = await db
      .select()
      .from(nonconformance)
      .where(eq(nonconformance.id, nc!));
    expect(row.source).toBe("legal");
    expect(
      await recordInspection(
        db,
        safety(),
        id,
        { on: "2026-11-11", finding: "", fixDue: "" },
        now,
      ),
    ).toBeNull();

    await expect(
      recordRevCheck(db, safety(), [id], { changed: true, note: "" }, now),
    ).rejects.toThrow(/바뀌었/);
    expect(
      await recordRevCheck(
        db,
        safety(),
        [id],
        { changed: true, note: "시행규칙 개정" },
        now,
      ),
    ).toBe(1);
    const [x] = await db.select().from(legalItem).where(eq(legalItem.id, id));
    expect(x.revCheckedOn).toBe("2026-11-10");
    const o = await db
      .select()
      .from(notification)
      .where(eq(notification.userId, ids.owner));
    expect(o.some((m) => m.title.includes("법령 개정"))).toBe(true);
  });

  it("연간 준수 평가: 미흡 → 부적합, 모두 평가해야 대표 확정", async () => {
    const a = await createLegal(db, safety(), base, now);
    const b = await createLegal(
      db,
      safety(),
      { ...base, lawName: "폐기물관리법", applies: "check", basis: "" },
      now,
    );
    await createLegal(
      db,
      safety(),
      {
        ...base,
        lawName: "소음진동관리법",
        applies: "no",
        basis: "해당 시설 없음",
      },
      now,
    );
    expect((await evalSheet(db, 2026)).rows.length).toBe(2);
    await expect(
      evaluateLegal(
        db,
        safety(),
        a,
        { year: 2026, result: "ok", evidence: "" },
        now,
      ),
    ).rejects.toThrow(/증빙/);
    await evaluateLegal(
      db,
      safety(),
      a,
      { year: 2026, result: "ok", evidence: "신고필증" },
      now,
    );
    await expect(confirmLegalYear(db, owner(), 2026, now)).rejects.toThrow(
      /1개/,
    );
    const r = await evaluateLegal(
      db,
      safety(),
      b,
      { year: 2026, result: "lacking", evidence: "보관 기록 없음" },
      now,
    );
    expect(r.ncId).toBeTruthy();
    // 다시 저장하면 덮어씀
    await evaluateLegal(
      db,
      safety(),
      a,
      { year: 2026, result: "ok", evidence: "신고필증 사본" },
      now,
    );
    expect(
      (await evalSheet(db, 2026)).rows.find((x) => x.x.id === a)?.ev?.detail,
    ).toBe("신고필증 사본");
    await expect(confirmLegalYear(db, safety(), 2026, now)).rejects.toThrow(
      /대표/,
    );
    expect(await confirmLegalYear(db, owner(), 2026, now)).toBe(
      "준수 1 · 미흡 1 · 대상 아님 0",
    );
    await expect(
      evaluateLegal(
        db,
        safety(),
        a,
        { year: 2026, result: "ok", evidence: "x" },
        now,
      ),
    ).rejects.toThrow(/확정/);
  });
});
