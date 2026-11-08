import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { auditLog, notification, proxyAssignment } from "@/db/schema";
import { act, ApprovalError, createDraft, getDoc, inbox, requestCancel, submit } from "@/modules/approval/service";
import { seedShop, testDb } from "./db";

let db: Db;
let ids: Awaited<ReturnType<typeof seedShop>>;
beforeEach(async () => {
  db = await testDb();
  ids = await seedShop(db);
});

const now = new Date("2026-11-08T01:00:00Z");
const draft = (drafterId: string) => createDraft(db, { formCode: "F-Q-05", title: "견적 유효기간 변경", data: { body: "14일 → 10일" }, drafterId }, now);

describe("전자결재: 문서 개정 요청서(F-Q-05)", () => {
  it("요청 → 품질 담당 검토 → 대표 승인으로 확정되고 내용 해시가 남는다", async () => {
    const d = await draft(ids.advisor);
    expect(d.docNo).toBe("R-2611-0001");
    await submit(db, d.id, ids.advisor, now);
    expect((await inbox(db, ids.quality, now)).map((x) => x.id)).toEqual([d.id]);
    await act(db, d.id, ids.quality, "approve", null, now);
    expect((await inbox(db, ids.owner, now)).map((x) => x.id)).toEqual([d.id]);
    const done = await act(db, d.id, ids.owner, "approve", null, now);
    expect(done.status).toBe("confirmed");
    expect(done.contentHash).toMatch(/^[0-9a-f]{64}$/);
    const notes = await db.select().from(notification).where(eq(notification.userId, ids.advisor));
    expect(notes.some((n) => n.title.startsWith("확정됨"))).toBe(true);
    expect((await db.select().from(auditLog)).some((a) => a.action === "approval.approve")).toBe(true);
  });

  it("기안자는 자기 문서를 검토하지 않는다: 품질 담당이 쓰면 검토가 대표에게 간다", async () => {
    const d = await draft(ids.quality);
    const s = await submit(db, d.id, ids.quality, now);
    expect((s.steps as { candidates: string[] }[])[1].candidates).toEqual([ids.owner]);
    expect(s.flags).toContain("escalated");
  });

  it("반려에는 사유가 필요하고, 담당자가 아니면 처리할 수 없다", async () => {
    const d = await draft(ids.advisor);
    await submit(db, d.id, ids.advisor, now);
    await expect(act(db, d.id, ids.tech1, "approve", null, now)).rejects.toThrow(ApprovalError);
    await expect(act(db, d.id, ids.quality, "reject", "", now)).rejects.toThrow(/사유/);
    const r = await act(db, d.id, ids.quality, "reject", "근거 부족", now);
    expect(r.status).toBe("rejected");
    const again = await submit(db, d.id, ids.advisor, now);
    expect(again.revision).toBe(2);
  });

  it("대표 부재 기간에는 지정한 공장장이 대리 승인하고 표시가 남는다", async () => {
    await db.insert(proxyAssignment).values({ principalId: ids.owner, proxyId: ids.manager, fromDate: "2026-11-07", toDate: "2026-11-09" });
    const d = await draft(ids.advisor);
    await submit(db, d.id, ids.advisor, now);
    await act(db, d.id, ids.quality, "approve", null, now);
    const done = await act(db, d.id, ids.manager, "approve", null, now);
    expect(done.status).toBe("confirmed");
    expect(done.flags).toContain("proxy_approved");
    const after = new Date("2026-11-10T01:00:00Z");
    const d2 = await draft(ids.advisor);
    await submit(db, d2.id, ids.advisor, after);
    await act(db, d2.id, ids.quality, "approve", null, after);
    await expect(act(db, d2.id, ids.manager, "approve", null, after)).rejects.toThrow(/담당자가 아닙니다/);
  });

  it("확정 문서는 취소 문서가 확정될 때 취소됨으로 바뀐다", async () => {
    const d = await draft(ids.advisor);
    await submit(db, d.id, ids.advisor, now);
    await act(db, d.id, ids.quality, "approve", null, now);
    await act(db, d.id, ids.owner, "approve", null, now);
    const c = await requestCancel(db, d.id, ids.advisor, "잘못 올림", now);
    expect(c.cancelsId).toBe(d.id);
    await act(db, c.id, ids.quality, "approve", null, now);
    await act(db, c.id, ids.owner, "approve", null, now);
    expect((await getDoc(db, d.id)).status).toBe("cancelled");
  });
});

describe("앞선 전표 불러오기: 확정된 개정 요청서", () => {
  it("확정된 요청서만 근거 번호로 쓸 수 있다", async () => {
    const { assertRevisionRequestNo, confirmedRevisionRequests } = await import("@/modules/approval/service");
    const d = await createDraft(db, { formCode: "F-Q-05", title: "견적 유효기간 14 → 10", data: { target: "부록 D", proposed: "10 일", reason: "x", policyKey: "estimate.valid_days", proposedValue: 10 }, drafterId: ids.advisor }, now);
    await submit(db, d.id, ids.advisor, now);
    await expect(assertRevisionRequestNo(db, d.docNo)).rejects.toThrow(/확정된/);
    await act(db, d.id, ids.quality, "approve", null, now);
    await act(db, d.id, ids.owner, "approve", null, now);
    await expect(assertRevisionRequestNo(db, d.docNo)).resolves.toBeUndefined();
    await expect(assertRevisionRequestNo(db, null)).resolves.toBeUndefined();
    await expect(assertRevisionRequestNo(db, "R-2611-9999")).rejects.toThrow(/목록/);
    const list = await confirmedRevisionRequests(db);
    expect(list.map((x) => x.docNo)).toEqual([d.docNo]);
    expect((list[0].data as { proposedValue: number }).proposedValue).toBe(10);
  });
});
