// 동시 수정 막기(2026-11-20): 저장할 때 먼저 고친 사람 확인, 단계 단추 잠금, '고치는 중' 표시
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { estimate, estimateLine } from "@/db/schema";
import { createEstimate, getEstimate, saveEstimateHeader, saveLine, submitEstimate } from "@/modules/repair/estimate";
import { ConflictError, fingerprint, freshFor, freshForMany, guardEdit, parseToken, withLock } from "@/modules/platform/fresh";
import { heartbeat, leave, viewers } from "@/modules/platform/presence";
import { estimating } from "./flow";
import { seedShop, testDb } from "./db";

beforeAll(() => {
  process.env.STORAGE_DIR = mkdtempSync(join(tmpdir(), "abs-files-"));
});
let db: Db;
let ids: Awaited<ReturnType<typeof seedShop>>;
beforeEach(async () => {
  db = await testDb();
  ids = await seedShop(db);
});
const now = new Date("2026-11-09T01:00:00Z");
const advisor = () => ({ id: ids.advisor, roles: ["advisor" as const] });
const owner = () => ({ id: ids.owner, roles: ["owner" as const] });
const head = (note: string) => ({ kind: "general", paintGrade: "solid", dueDate: "", note, registeredOn: "" });

async function draftEstimate() {
  const roId = await estimating(db, ids, now);
  const e = await createEstimate(db, advisor(), roId, now);
  return e.id;
}

const form = (fresh: string | undefined) => {
  const f = new FormData();
  if (fresh) f.set("_fresh", fresh);
  return f;
};

describe("저장할 때 먼저 고친 사람 확인", () => {
  it("화면을 연 뒤 다른 사람이 같은 칸을 고쳤으면 저장하지 않고 누가 언제 고쳤는지 알린다", async () => {
    const id = await draftEstimate();
    const opened = await freshFor(db, "estimate.header", id, new Date(Date.now() - 1000));
    expect(parseToken(opened!)?.doc).toBe(`estimate:${id}`);
    // 대표가 먼저 고침
    await guardEdit(db, owner(), form(opened), (tx) => saveEstimateHeader(tx, owner(), id, head("대표 메모")));
    // 같은 화면(옛 표)으로 상담원이 저장 → 막힘
    const err = await guardEdit(db, advisor(), form(opened), (tx) => saveEstimateHeader(tx, advisor(), id, head("상담원 메모"))).catch((e) => e);
    expect(err).toBeInstanceOf(ConflictError);
    expect(String(err.message)).toMatch(/님이 \d\d:\d\d에 이 내용을 먼저 고쳤습니다/);
    const [e] = await db.select().from(estimate).where(eq(estimate.id, id));
    expect(e.note).toBe("대표 메모");
    // 새로 그린 화면의 표로는 저장된다
    const fresh = await freshFor(db, "estimate.header", id);
    await guardEdit(db, advisor(), form(fresh), (tx) => saveEstimateHeader(tx, advisor(), id, head("상담원 메모")));
    const [e2] = await db.select().from(estimate).where(eq(estimate.id, id));
    expect(e2.note).toBe("상담원 메모");
  });

  it("내가 다른 창에서 먼저 고쳤으면 그렇게 알린다", async () => {
    const id = await draftEstimate();
    const opened = await freshFor(db, "estimate.header", id, new Date(Date.now() - 1000));
    await guardEdit(db, advisor(), form(opened), (tx) => saveEstimateHeader(tx, advisor(), id, head("창1")));
    const err = await guardEdit(db, advisor(), form(opened), (tx) => saveEstimateHeader(tx, advisor(), id, head("창2"))).catch((e) => e);
    expect(String(err.message)).toMatch(/다른 창\(또는 다른 기기\)에서/);
  });

  it("다른 줄이나 합계만 바뀐 것은 막지 않는다(양식이 고치는 칸만 견준다)", async () => {
    const id = await draftEstimate();
    const g = await getEstimate(db, id);
    const [a, b] = g.lines;
    const head0 = await freshFor(db, "estimate.header", id);
    const lines0 = await freshForMany(db, "estimate.line", [a.id, b.id]);
    // 다른 사람이 b 줄을 고침 → 합계가 바뀜
    await guardEdit(db, owner(), form(lines0[b.id]), (tx) => saveLine(tx, owner(), id, { id: b.id, payer: b.payer, category: b.category, name: b.name, partCode: b.partCode ?? "", partNo: b.partNo ?? "", qty: b.qty, unitWon: b.unitWon, laborMinutes: b.laborMinutes, laborWon: b.laborWon, note: "대표가 고침" }));
    // a 줄과 머리는 그대로 저장된다
    await guardEdit(db, advisor(), form(lines0[a.id]), (tx) => saveLine(tx, advisor(), id, { id: a.id, payer: a.payer, category: a.category, name: a.name, partCode: a.partCode ?? "", partNo: a.partNo ?? "", qty: a.qty, unitWon: a.unitWon, laborMinutes: a.laborMinutes, laborWon: a.laborWon, note: "a 메모" }));
    await guardEdit(db, advisor(), form(head0), (tx) => saveEstimateHeader(tx, advisor(), id, head("머리")));
    const [la] = await db.select().from(estimateLine).where(eq(estimateLine.id, a.id));
    expect(la.note).toBe("a 메모");
    // 같은 b 줄을 옛 표로 고치면 막힌다
    await expect(guardEdit(db, advisor(), form(lines0[b.id]), (tx) => saveLine(tx, advisor(), id, { id: b.id, payer: b.payer, category: b.category, name: b.name, partCode: b.partCode ?? "", partNo: b.partNo ?? "", qty: b.qty, unitWon: b.unitWon, laborMinutes: b.laborMinutes, laborWon: b.laborWon, note: "" }))).rejects.toBeInstanceOf(ConflictError);
  });

  it("표가 없는 양식(새로 만들기)은 그대로 저장한다", async () => {
    const id = await draftEstimate();
    await guardEdit(db, advisor(), form(undefined), (tx) => saveEstimateHeader(tx, advisor(), id, head("표 없음")));
    const [e] = await db.select().from(estimate).where(eq(estimate.id, id));
    expect(e.note).toBe("표 없음");
  });

  it("지문은 고치는 칸만으로 만든다", () => {
    const row = { id: "x", kind: "general", paintGrade: "solid", dueDate: null, note: "a", totalWon: 1 };
    expect(fingerprint("estimate.header", row)).toBe(fingerprint("estimate.header", { ...row, totalWon: 999 }));
    expect(fingerprint("estimate.header", row)).not.toBe(fingerprint("estimate.header", { ...row, note: "b" }));
  });
});

describe("단계 단추 잠금", () => {
  it("검토 요청을 두 번 눌러도 한 번만 처리되고 늦은 쪽은 안내를 받는다", async () => {
    const id = await draftEstimate();
    const part = (await getEstimate(db, id)).lines.find((l) => l.category === "part")!;
    await saveLine(db, advisor(), id, { id: part.id, payer: "general", category: "part", name: part.name, partCode: "D", partNo: "", qty: 1, unitWon: 180_000, laborMinutes: null, laborWon: null, note: "" }, now);
    await saveEstimateHeader(db, advisor(), id, { ...head(""), registeredOn: "2021-03-15" }, now);
    await withLock(db, estimate, id, (tx) => submitEstimate(tx, advisor(), id, now));
    await expect(withLock(db, estimate, id, (tx) => submitEstimate(tx, advisor(), id, now))).rejects.toThrow();
    const [e] = await db.select().from(estimate).where(eq(estimate.id, id));
    expect(e.status).toBe("review");
  });

  it("오류가 나면 잠금 안에서 한 일은 모두 되돌린다", async () => {
    const id = await draftEstimate();
    await expect(
      withLock(db, estimate, id, async (tx) => {
        await tx.update(estimate).set({ note: "중간" }).where(eq(estimate.id, id));
        throw new Error("실패");
      }),
    ).rejects.toThrow("실패");
    const [e] = await db.select().from(estimate).where(eq(estimate.id, id));
    expect(e.note).not.toBe("중간");
  });
});

describe("고치는 중 표시", () => {
  it("같은 전표를 연 다른 사람과 고치는 중인지 보여 주고, 1분 넘게 소식이 없으면 뺀다", async () => {
    const doc = `estimate:${"0".repeat(8)}-0000-0000-0000-${"0".repeat(12)}`;
    const t0 = new Date("2026-11-20T01:00:10Z");
    expect(await heartbeat(db, ids.owner, doc, "tabOwner1", false, t0)).toEqual([]);
    const seen = await heartbeat(db, ids.advisor, doc, "tabAdv001", true, t0);
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ editing: false, self: false });
    const forOwner = await viewers(db, doc, "tabOwner1", ids.owner, t0);
    expect(forOwner[0]).toMatchObject({ editing: true, self: false });
    expect(forOwner[0].role).toBeTruthy();
    // 같은 사람의 다른 창은 '내 다른 창'
    const self = await heartbeat(db, ids.owner, doc, "tabOwner2", false, t0);
    expect(self.some((v) => v.self)).toBe(true);
    // 70초 뒤: 대표 창들만 다시 알렸으면 상담원은 빠진다
    const t1 = new Date(t0.getTime() + 70_000);
    await heartbeat(db, ids.owner, doc, "tabOwner2", false, t1);
    expect((await heartbeat(db, ids.owner, doc, "tabOwner1", false, t1)).map((v) => v.self)).toEqual([true]);
    await leave(db, doc, "tabOwner2");
    expect(await viewers(db, doc, "tabOwner1", ids.owner, t1)).toEqual([]);
  });

  it("이상한 열쇠는 받지 않는다", async () => {
    expect(await heartbeat(db, ids.owner, "아무거나", "tab000001", false)).toEqual([]);
  });
});
