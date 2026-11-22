// 사내 표준서 본문(2026-11-19): 첫 데이터·열람 제한·찾기·개정 요청서 승인으로 본문 바꾸기·개정 교육 할 일
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { approvalDoc, docRegister, stdSection } from "@/db/schema";
import { act, createDraft, submit } from "@/modules/approval/service";
import { seedDocs } from "@/modules/quality/qms";
import { bodyMark, DRAFT_PATCHES, getStdChapter, patchDraftStd, revisionPrefill, revisionsNeedingTraining, searchStd, seedStd, setSectionRoles } from "@/modules/quality/std";
import { seedShop, testDb } from "./db";

let db: Db;
let ids: Awaited<ReturnType<typeof seedShop>>;
beforeEach(async () => {
  db = await testDb();
  ids = await seedShop(db);
});
const quality = () => ({ id: ids.quality, roles: ["quality" as const] });
const tech = () => ({ id: ids.tech1, roles: ["technician" as const] });
const acct = () => ({ id: ids.account, roles: ["accounting" as const] });

async function approveAll(id: string, now: Date) {
  for (let i = 0; i < 4; i++) {
    const [cur] = await db.select().from(approvalDoc).where(eq(approvalDoc.id, id));
    if (cur.status === "confirmed") return;
    const step = (cur.steps as { status: string; candidates: string[] }[]).find((s) => s.status === "active")!;
    await act(db, id, step.candidates[0], "approve", null, now);
  }
}

describe("사내 표준서", () => {
  it("처음 열 때 본문이 들어가고 두 번 넣지 않는다", async () => {
    const n = (await db.select().from(stdSection)).length;
    expect(n).toBeGreaterThan(300);
    expect(await seedStd(db)).toBe(0);
  });

  it("회계 상세 절차는 회계·공장장·대표만 본문을 보고, 품질 담당이 풀 수 있다", async () => {
    const t = await getStdChapter(db, tech(), "12");
    const p = t.procedure.find((s) => s.key === "p:STD-12:4")!;
    expect(p.hidden).toBe(true);
    expect(p.body).toBe("");
    expect((await getStdChapter(db, acct(), "12")).procedure.find((s) => s.key === "p:STD-12:4")!.hidden).toBe(false);
    await expect(setSectionRoles(db, tech(), "p:STD-12:4", [])).rejects.toThrow(/품질 담당/);
    await setSectionRoles(db, quality(), "p:STD-12:4", []);
    expect((await getStdChapter(db, tech(), "12")).procedure.find((s) => s.key === "p:STD-12:4")!.hidden).toBe(false);
  });

  it("찾기: 본문 낱말과 제목 초성", async () => {
    const hits = await searchStd(db, tech(), "마스킹");
    expect(hits.length).toBeGreaterThan(0);
    const cho = await searchStd(db, tech(), "ㅂㅈㄱㄱ");
    expect(cho.some((h) => h.key === "o:6.1")).toBe(true);
  });

  it("절 개정 요청서가 승인되면 본문이 바뀌고 판·이전 판·개정 교육 할 일이 생긴다", async () => {
    const now = new Date("2026-11-20T01:00:00Z");
    await seedDocs(db, quality(), now);
    const p = await revisionPrefill(db, tech(), "o:2.1");
    expect(p.docId).toBeTruthy();
    const body = `${p.s.body}\n\n- 전기차는 입고 때 고전압 차단 여부를 확인한다.`;
    const d = await createDraft(db, { formCode: "F-Q-05", title: "2.1 개정", data: { target: p.label, current: p.s.body, proposed: body, reason: "전기차 입고 증가", docId: p.docId, secKey: "o:2.1" }, drafterId: ids.tech1 }, now);
    await submit(db, d.id, ids.tech1, now);
    expect(await revisionsNeedingTraining(db)).toHaveLength(0);
    await approveAll(d.id, now);
    const [s] = await db.select().from(stdSection).where(eq(stdSection.key, "o:2.1"));
    expect(s.body).toContain("고전압 차단");
    expect(s.rev).toBe("v0.3");
    expect(s.revisedOn).toBe("2026-11-20");
    expect(s.history[0]).toMatchObject({ rev: null, body: p.s.body });
    const [reg] = await db.select().from(docRegister).where(eq(docRegister.no, "STD-02"));
    expect(reg.rev).toBe("v0.3");
    const need = await revisionsNeedingTraining(db);
    expect(need).toMatchObject([{ docNo: "STD-02", rev: "v0.3" }]);
  });

  it("확정판 전 초안 바로 고치기: 예전 초안 그대로인 절만 새 본문으로, 앱에서 고친 절은 그대로", async () => {
    await seedStd(db);
    expect(await patchDraftStd(db)).toBe(0);
    const [seeded] = await db.select().from(stdSection).where(eq(stdSection.key, "f:F-13-01"));
    expect(seeded.body).toMatch(/내 차 수첩 '내 기록'/);
    // 예전 초안을 흉내: 표시값만 맞으면 되므로 표시값 목록에 지금 본문 표시값을 잠깐 더해 본다
    DRAFT_PATCHES["o:13.1"].push(bodyMark("예전 초안"));
    try {
      await db.update(stdSection).set({ body: "예전 초안" }).where(eq(stdSection.key, "o:13.1"));
      await db.update(stdSection).set({ body: "앱에서 고친 본문" }).where(eq(stdSection.key, "o:13.2"));
      expect(await patchDraftStd(db)).toBe(1);
      const rows = await db.select().from(stdSection);
      expect(rows.find((r) => r.key === "o:13.1")!.body).toMatch(/내 차 수첩/);
      expect(rows.find((r) => r.key === "o:13.2")!.body).toBe("앱에서 고친 본문");
      expect(rows.find((r) => r.key === "o:13.1")!.history).toEqual([]);
    } finally {
      DRAFT_PATCHES["o:13.1"].pop();
    }    // 바뀐 절 제목도 예전 제목 그대로일 때만 새 제목으로(덴트·광택 뺌, 2026-11-22)
    await db.update(stdSection).set({ title: "작업 표준 절차서(판금·덴트·도장·광택)" }).where(eq(stdSection.key, "p:STD-04"));
    expect(await patchDraftStd(db)).toBe(1);
    const [std04] = await db.select().from(stdSection).where(eq(stdSection.key, "p:STD-04"));
    expect(std04.title).toBe("작업 표준 절차서(판금·도장)");
  });
});
