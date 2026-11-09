// 비품·자산(STD-07 9절, F-07-04): 등록(자산 구분·관리 번호) → 지급·수령 확인 → 이동 → 분실 신고·실물 확인 → 처분(자산은 대표, 전산은 자료 삭제)
import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { myTodos } from "@/modules/dashboard/todo";
import { checkFixture, confirmReceipt, disposeFixture, getFixture, listFixtures, moveFixture, registerFixture } from "@/modules/purchase/fixture";
import { nextFxNo } from "@/modules/purchase/rules";
import { seedShop, testDb } from "./db";

let db: Db;
let ids: Awaited<ReturnType<typeof seedShop>>;
beforeEach(async () => {
  db = await testDb();
  ids = await seedShop(db);
});
const now = new Date("2026-12-02T01:00:00Z");
const account = () => ({ id: ids.account, roles: ["accounting" as const] });
const owner = () => ({ id: ids.owner, roles: ["owner" as const] });
const tech = () => ({ id: ids.tech1, roles: ["technician" as const] });
const base = { spec: "", purchasedOn: "2026-12-01", location: "", warrantyUntil: "", supplierId: "", expenseRef: "", note: "" };

describe("비품", () => {
  it("관리 번호", () => {
    expect(nextFxNo([])).toBe("FX-001");
    expect(nextFxNo(["FX-009", "FX-002"])).toBe("FX-010");
  });

  it("등록·지급·수령·이동·분실·처분", async () => {
    await expect(registerFixture(db, tech(), { ...base, name: "드릴", category: "tool", priceWon: 200_000, holderId: ids.tech1 }, now)).rejects.toThrow(/회계/);
    const drill = await registerFixture(db, account(), { ...base, name: "충전 드릴", category: "tool", priceWon: 200_000, holderId: ids.tech1 }, now);
    const pc = await registerFixture(db, account(), { ...base, name: "사무용 PC", category: "it", priceWon: 1_200_000, holderId: "", location: "사무실" }, now);
    expect(drill.no).toBe("FX-001");
    expect((await getFixture(db, pc.id)).f.asset).toBe(true);
    expect((await myTodos(db, tech(), now)).some((t) => t.key === `fx-rcv-${drill.id}`)).toBe(true);
    await expect(confirmReceipt(db, account(), drill.id, now)).rejects.toThrow(/지급받은/);
    await confirmReceipt(db, tech(), drill.id, now);
    // 사용자가 공구장으로 반납
    await moveFixture(db, tech(), drill.id, { location: "공구장 B-2", holderId: "" }, now);
    let g = await getFixture(db, drill.id);
    expect(g.f.holderId).toBeNull();
    expect(g.events.some(({ e }) => e.kind === "move" && e.detail?.includes("공구장"))).toBe(true);
    await expect(moveFixture(db, tech(), drill.id, { location: "x", holderId: "" }, now)).rejects.toThrow(/본인/);
    // 12월 실물 확인 할 일, 분실은 경위 필수
    expect((await myTodos(db, account(), now)).some((t) => t.key === "fx-check-2026")).toBe(true);
    await expect(checkFixture(db, account(), drill.id, "lost", "", now)).rejects.toThrow(/경위/);
    await checkFixture(db, account(), drill.id, "lost", "출장 작업 뒤 못 찾음", now);
    await checkFixture(db, account(), pc.id, "ok", "", now);
    expect((await listFixtures(db, account(), "problem")).map((r) => r.f.id)).toContain(drill.id);
    g = await getFixture(db, pc.id);
    expect(g.checkedThisYear).toBe(true);
    // 자산 비품은 대표, 전산은 자료 삭제 확인
    await expect(disposeFixture(db, account(), pc.id, { method: "scrap", note: "고장", dataWiped: true }, now)).rejects.toThrow(/대표/);
    await expect(disposeFixture(db, owner(), pc.id, { method: "scrap", note: "고장", dataWiped: false }, now)).rejects.toThrow(/자료/);
    await disposeFixture(db, owner(), pc.id, { method: "scrap", note: "메인보드 고장", dataWiped: true }, now);
    expect((await getFixture(db, pc.id)).f.status).toBe("disposed");
  });
});
