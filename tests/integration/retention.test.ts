// 보존·파기(STD-Q 8절): 보존 기간 지난 기록 세기, 파기 결재(대표 승인) 뒤에만 지움
import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { approvalDoc, auditLog, corrDoc, fiveSDaily } from "@/db/schema";
import { act } from "@/modules/approval/service";
import { myTodos } from "@/modules/dashboard/todo";
import { cutoffOf, requestPurge, retentionSheet } from "@/modules/quality/retention";
import { seedShop, testDb } from "./db";

let db: Db;
let ids: Awaited<ReturnType<typeof seedShop>>;
beforeEach(async () => {
  db = await testDb();
  ids = await seedShop(db);
});
const now = new Date("2026-11-21T01:00:00Z");
const owner = () => ({ id: ids.owner, roles: ["owner" as const] });
const quality = () => ({ id: ids.quality, roles: ["quality" as const] });
const tech = () => ({ id: ids.tech1, roles: ["technician" as const] });

async function seedOld() {
  const mk = (no: string, status: string, receivedOn: string, replyToId: string | null = null) => ({ dir: "in", no, status, party: "구청", title: no, receivedOn, replyToId });
  const [a] = await db.insert(corrDoc).values(mk("RC-2011-0001", "done", "2020-11-01")).returning();
  await db.insert(corrDoc).values([mk("RC-2011-0002", "open", "2020-11-02"), mk("RC-2611-0001", "done", "2026-11-01", a.id)]);
  await db.insert(fiveSDaily).values([
    { zone: "A", checkDate: "2025-11-01", results: [true], items: ["정리"], checkedBy: ids.tech1 },
    { zone: "A", checkDate: "2026-11-01", results: [true], items: ["정리"], checkedBy: ids.tech1 },
  ]);
}

describe("보존·파기", () => {
  it("기준일·권한·대장별 건수", async () => {
    expect(cutoffOf("2026-11-21", 5)).toBe("2021-11-21");
    await seedOld();
    await expect(retentionSheet(db, tech(), "2026-11-21")).rejects.toThrow(/대표·품질/);
    const s = await retentionSheet(db, quality(), "2026-11-21");
    // 처리 중(open)인 받은 문서는 지우지 않는다
    expect(s.corr).toBe(1);
    expect(s.fiveS).toBe(1);
    const corr = s.rows.find((r) => r.list === "corr")!;
    expect(corr.count).toBe(2);
    expect(corr.href).toContain("to=2021-11-20");
  });

  it("품질 담당이 올리고 대표가 승인하면 지움, 결재 문서에 목록이 남음", async () => {
    await seedOld();
    expect((await myTodos(db, quality(), now)).some((t) => t.key.startsWith("records-purge"))).toBe(true);
    const doc = await requestPurge(db, quality(), "", now);
    await expect(requestPurge(db, quality(), "", now)).rejects.toThrow(/결재 중/);
    expect((await myTodos(db, quality(), now)).some((t) => t.key.startsWith("records-purge"))).toBe(false);
    expect((await db.select().from(corrDoc)).length).toBe(3);
    await act(db, doc.id, ids.owner, "approve", null, now);
    const left = await db.select().from(corrDoc);
    expect(left.map((r) => r.no).sort()).toEqual(["RC-2011-0002", "RC-2611-0001"]);
    expect(left.find((r) => r.no === "RC-2611-0001")!.replyToId).toBeNull();
    expect((await db.select().from(fiveSDaily)).map((r) => r.checkDate)).toEqual(["2026-11-01"]);
    const [d] = await db.select().from(approvalDoc).where(eq(approvalDoc.id, doc.id));
    expect(d.status).toBe("confirmed");
    expect(String((d.data as { purgeList: string }).purgeList)).toContain("RC-2011-0001");
    expect((await db.select().from(auditLog).where(eq(auditLog.action, "records.purge"))).length).toBe(1);
    await expect(requestPurge(db, owner(), "", now)).rejects.toThrow(/없습니다/);
  });

  it("대표가 올리면 바로 승인되어 지움", async () => {
    await seedOld();
    await requestPurge(db, owner(), "보존 기간이 지남", now);
    expect((await db.select().from(fiveSDaily)).length).toBe(1);
  });
});
