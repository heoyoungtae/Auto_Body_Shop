// 보증·불만·만족도(STD-06): 접수 → 안내 → 판정 → 동의 → 보상 승인 → 종결, 설문 자동 발송·낮은 점수 자동 접수, 월간 집계
import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import * as schema from "@/db/schema";
import { ackComplaint, agreeComplaint, answerSurvey, approveCompensation, closeComplaint, csDailyAlerts, csMonthly, getComplaint, judgeComplaint, listComplaints, receiveComplaint, sendDueSurveys, surveyView } from "@/modules/cs/service";
import { judgeIssues, lowItems, warrantyState } from "@/modules/cs/rules";
import { myTodos } from "@/modules/dashboard/todo";
import { seedShop, testDb } from "./db";
import { approvedRepair } from "./flow";

let db: Db;
let ids: Awaited<ReturnType<typeof seedShop>>;
beforeEach(async () => {
  db = await testDb();
  ids = await seedShop(db);
});
const now = new Date("2026-11-09T01:00:00Z");
const advisor = () => ({ id: ids.advisor, roles: ["advisor" as const] });
const tech = () => ({ id: ids.tech1, roles: ["technician" as const] });
const quality = () => ({ id: ids.quality, roles: ["quality" as const] });
const owner = () => ({ id: ids.owner, roles: ["owner" as const] });
const noFetch = (async () => new Response("{}")) as unknown as typeof fetch;

/** 출고까지 끝난 수리 건(명세서·보증 포함)을 바로 만든다 */
async function deliveredRo(deliveredAt: Date) {
  const { roId, estimateId } = await approvedRepair(db, ids, new Date("2026-10-01T01:00:00Z"));
  await db.update(schema.repairOrder).set({ status: "delivered" }).where(eq(schema.repairOrder.id, roId));
  await db.insert(schema.repairStatement).values({ docNo: `IV-T-${roId.slice(0, 4)}`, repairOrderId: roId, estimateId, issuedOn: "2026-10-25", deliveredAt, snapshot: { warranty: [{ kind: "도장·판금", until: "2027-10-25" }, { kind: "광택", until: "2026-11-25" }] } });
  return roId;
}

describe("불만 규칙", () => {
  it("보증·설문·판정 검사", () => {
    expect(warrantyState([{ kind: "광택", until: "2026-11-01" }], "2026-11-09").inWarranty).toBe(false);
    expect(lowItems([5, 3, 4, 2, 5, 5], 3).map((x) => x.i)).toEqual([1, 3]);
    expect(judgeIssues({ verdict: "x", reason: "", inspectNote: "" })).toHaveLength(3);
  });
});

describe("불만 처리 흐름", () => {
  it("누구나 접수, 상담원 안내, 품질 판정(부적합 발행), 동의·보상 승인, 보증 수리 출고 뒤 종결", async () => {
    const roId = await deliveredRo(new Date("2026-10-25T05:00:00Z"));
    const { id, docNo } = await receiveComplaint(db, tech(), { channel: "phone", category: "quality", repairOrderId: roId, content: "보닛 기포", wish: "무상 재도장", urgent: false }, now);
    expect(docNo).toMatch(/^CP-/);
    let r = await getComplaint(db, id, "2026-11-09");
    expect(r.ro?.warranty.inWarranty).toBe(true);
    expect(r.c.ackDue).toBe("2026-11-10");
    await expect(judgeComplaint(db, quality(), id, { inspectNote: "기포 3곳", verdict: "covered", reason: "시공 결함", needNc: true }, now)).rejects.toThrow(/접수 안내/);
    await expect(ackComplaint(db, tech(), id, "전화", now)).rejects.toThrow(/상담원/);
    await ackComplaint(db, advisor(), id, "전화로 접수 확인, 11/11 확인", now);
    await expect(judgeComplaint(db, advisor(), id, { inspectNote: "a", verdict: "covered", reason: "b", needNc: false }, now)).rejects.toThrow(/품질/);
    await judgeComplaint(db, quality(), id, { inspectNote: "기포 3곳, 출고 사진에 없음", verdict: "covered", reason: "보증 기간 안 시공 결함", needNc: true }, now);
    r = await getComplaint(db, id);
    expect(r.nc?.docNo).toMatch(/^NC-/);
    // 보증 수리 건은 같은 차의 새 수리 건이어야 한다
    await expect(agreeComplaint(db, advisor(), id, { plan: "재도장", resolution: "warranty_repair", warrantyRoId: roId }, now)).rejects.toThrow(/새 수리 건/);
    await agreeComplaint(db, advisor(), id, { plan: "11/15 입고 재도장", resolution: "warranty_repair", compWon: 50_000, compNote: "대차비" }, now);
    await expect(closeComplaint(db, advisor(), id, { satisfied: true, note: "" }, now)).rejects.toThrow(/대표 승인/);
    await expect(approveCompensation(db, advisor(), id, now)).rejects.toThrow(/대표/);
    expect((await myTodos(db, owner(), now)).some((t) => t.key === `cpo-${id}`)).toBe(true);
    await approveCompensation(db, owner(), id, now);
    await expect(closeComplaint(db, advisor(), id, { satisfied: true, note: "" }, now)).rejects.toThrow(/연결/);
    const wr = await deliveredRo(new Date("2026-11-16T05:00:00Z"));
    await db.update(schema.repairOrder).set({ createdAt: new Date("2026-11-10T00:00:00Z"), vehicleId: r.c.vehicleId! }).where(eq(schema.repairOrder.id, wr));
    await agreeComplaint(db, advisor(), id, { plan: "11/15 입고 재도장", resolution: "warranty_repair", warrantyRoId: wr, compWon: 50_000, compNote: "대차비" }, now);
    expect((await getComplaint(db, id)).c.compApprovedAt).not.toBeNull();
    // 불만족이면 종결하지 않는다
    expect(await closeComplaint(db, advisor(), id, { satisfied: false, note: "색 차이" }, now)).toEqual({ closed: false });
    expect(await closeComplaint(db, advisor(), id, { satisfied: true, note: "재방문 확인, 만족" }, now)).toEqual({ closed: true });
    expect((await listComplaints(db, "warranty")).length).toBe(1);
    expect((await listComplaints(db, "open")).length).toBe(0);
  });

  it("비해당 판정은 보증 수리로 처리할 수 없고, 기한이 지나면 알린다", async () => {
    const { id } = await receiveComplaint(db, tech(), { channel: "resident", category: "environment", who: "옆 상가", content: "도장 냄새" }, now);
    await expect(receiveComplaint(db, tech(), { channel: "visit", category: "other", content: "x" }, now)).rejects.toThrow(/이름/);
    expect(await csDailyAlerts(db, new Date("2026-11-13T01:00:00Z"), noFetch)).toMatch(/불만 알림 2건/);
    await ackComplaint(db, advisor(), id, "방문 사과", now);
    await judgeComplaint(db, quality(), id, { inspectNote: "부스 배기 확인", verdict: "none", reason: "보증과 무관", needNc: false }, now);
    await expect(agreeComplaint(db, advisor(), id, { plan: "x", resolution: "warranty_repair" }, now)).rejects.toThrow(/보증 수리/);
  });
});

describe("만족도 설문", () => {
  it("출고 7일 뒤 한 번만 보내고, 낮은 점수면 불만을 연다. 월간 집계", async () => {
    const roId = await deliveredRo(new Date("2026-11-01T05:00:00Z"));
    expect(await sendDueSurveys(db, new Date("2026-11-05T01:00:00Z"), noFetch)).toMatch(/0\/0/);
    expect(await sendDueSurveys(db, now, noFetch)).toMatch(/1\/1|0\/1/);
    expect(await sendDueSurveys(db, now, noFetch)).toMatch(/0\/0/);
    const [s] = await db.select().from(schema.survey).where(eq(schema.survey.repairOrderId, roId));
    expect(s).toBeTruthy();
    // 토큰은 해시만 저장하므로 테스트에서 새 토큰을 심는다
    const { sha256 } = await import("@/modules/auth/crypto");
    const token = "t".repeat(32);
    await db.update(schema.survey).set({ tokenHash: sha256(token) }).where(eq(schema.survey.id, s.id));
    expect((await surveyView(db, token, now)).state).toBe("open");
    await expect(answerSurvey(db, token, { scores: [5, 5], comment: "" }, now)).rejects.toThrow(/모든 질문/);
    const r = await answerSurvey(db, token, { scores: [2, 5, 4, 4, 5, 3], comment: "색이 조금 달라요" }, now);
    expect(r.complaint?.docNo).toMatch(/^CP-/);
    expect((await surveyView(db, token, now)).state).toBe("done");
    await expect(answerSurvey(db, token, { scores: [5, 5, 5, 5, 5, 5], comment: "" }, now)).rejects.toThrow(/이미/);
    const cp = await getComplaint(db, r.complaint!.id);
    expect(cp.c).toMatchObject({ channel: "survey", category: "quality", receivedBy: null });
    const m = await csMonthly(db, "2026-11");
    expect(m).toMatchObject({ sent: 1, answered: 1, responseRate: 100, complaints: 1, delivered: 1 });
    expect(m.perQ[0]).toBe(2);
  });
});
