// 품질경영(Q장): 조직 상황(F-Q-01)·품질목표(F-Q-02) 자동 집계·연속 미달 부적합·문서 목록(F-Q-04)·개정 승인 시 판 올림·경영검토(F-Q-09)
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import {
  approvalDoc,
  docRegister,
  fiveSMonthly,
  instruction,
  nonconformance,
  riskItem,
} from "@/db/schema";
import { act, createDraft, submit } from "@/modules/approval/service";
import {
  goalYear,
  monthGoals,
  setTarget,
  signQuarter,
  snapshotMonth,
} from "@/modules/quality/goals";
import {
  contextFor,
  contextToRisk,
  listDocs,
  reviewFor,
  retireDoc,
  saveContext,
  saveDoc,
  saveReview,
  seedDocs,
} from "@/modules/quality/qms";
import { goalOk, nextRev } from "@/modules/quality/qms-rules";
import { seedShop, testDb } from "./db";

let db: Db;
let ids: Awaited<ReturnType<typeof seedShop>>;
beforeEach(async () => {
  db = await testDb();
  ids = await seedShop(db);
});
const now = new Date("2026-12-10T01:00:00Z");
const owner = () => ({ id: ids.owner, roles: ["owner" as const] });
const quality = () => ({ id: ids.quality, roles: ["quality" as const] });
const tech = () => ({ id: ids.tech1, roles: ["technician" as const] });

describe("규칙", () => {
  it("판 올리기·목표 판정", () => {
    expect(nextRev("v0.2")).toBe("v0.3");
    expect(nextRev("v1.9")).toBe("v1.10");
    expect(goalOk("rework", 5, 5)).toBe(true);
    expect(goalOk("fiveS", 84, 85)).toBe(false);
    expect(goalOk("pm", null, 95)).toBeNull();
  });
});

describe("조직 상황", () => {
  it("기본 칸으로 시작, 승인 조건, 리스크 대장 연결, 다음 해는 불러옴", async () => {
    const c = await contextFor(db, 2026);
    expect(c.draft.issues).toHaveLength(5);
    expect(c.draft.parties[0].check).toBe("만족도·불만");
    const issues = c.draft.issues.map((i, n) =>
      n === 0
        ? { ...i, issue: "도장 기술자 1명뿐", impact: "", action: "교육" }
        : i,
    );
    await expect(
      saveContext(db, quality(), 2026, { ...c.draft, issues }, false, now),
    ).rejects.toThrow(/대표/);
    await saveContext(db, owner(), 2026, { ...c.draft, issues }, false, now);
    await expect(
      saveContext(db, owner(), 2026, { ...c.draft, issues }, true, now),
    ).rejects.toThrow(/영향/);
    const r = await contextToRisk(
      db,
      owner(),
      2026,
      0,
      { kind: "risk", likelihood: 2, impact: 3 },
      now,
    );
    expect(r).toMatch(/^RK-/);
    expect((await db.select().from(riskItem)).length).toBe(1);
    const saved = (await contextFor(db, 2026)).draft;
    const done = {
      ...saved,
      issues: saved.issues.map((i) => ({ ...i, impact: "출고 지연" })),
      parties: saved.parties.map((p) => ({ ...p, needs: "약속 지킴" })),
    };
    await saveContext(db, owner(), 2026, done, true, now);
    await expect(
      saveContext(db, owner(), 2026, done, false, now),
    ).rejects.toThrow(/승인한/);
    const next = await contextFor(db, 2027);
    expect(next.from).toBe("2026년 검토표");
    expect(next.draft.issues[0].riskNo).toBe(r);
  });
});

describe("품질목표", () => {
  it("5S 점수를 기록에서 계산하고, 2개월 연속 미달이면 부적합을 발행한다", async () => {
    for (const [ym, t] of [
      ["2026-10", 80],
      ["2026-11", 70],
    ] as const)
      await db.insert(fiveSMonthly).values({
        ym,
        zone: "A",
        scores: [16, 16, 16, 16, 16],
        total: t,
        ratedBy: ids.manager,
      });
    const oct = await monthGoals(db, "2026-10", now);
    expect(oct.fiveS).toMatchObject({ value: 80, ok: false, fixed: false });
    expect(oct.accident).toMatchObject({ value: 0, ok: true });
    expect(oct.rework.value).toBeNull();
    await snapshotMonth(db, "2026-10", now);
    expect((await db.select().from(nonconformance)).length).toBe(0);
    const r = await snapshotMonth(db, "2026-11", now);
    expect(r.nc).toHaveLength(1);
    const [nc] = await db.select().from(nonconformance);
    expect(nc.source).toBe("goal");
    expect(nc.content).toMatch(/3정5S/);
    // 다시 돌려도 겹치지 않음
    expect((await snapshotMonth(db, "2026-11", now)).fixed).toBe(0);

    await expect(
      setTarget(db, quality(), 2026, "fiveS", 75, "실적", now),
    ).rejects.toThrow(/대표/);
    await setTarget(db, owner(), 2027, "fiveS", 75, "개업 후 6개월 실적", now);
    const y = await goalYear(db, 2026, now);
    expect(y.rows.find((x) => x.key === "fiveS")).toMatchObject({
      okMonths: 0,
      judgedMonths: 2,
      target: 85,
    });
    await expect(signQuarter(db, owner(), 2026, 4, "", now)).rejects.toThrow(
      /끝나지/,
    );
    await expect(
      signQuarter(db, owner(), 2026, 3, "", now),
    ).resolves.toBeUndefined();
  });
});

describe("문서 목록", () => {
  it("첫 등록, 판은 개정 요청 승인으로만 오르고, 폐지는 보관", async () => {
    await expect(seedDocs(db, tech(), now)).rejects.toThrow(/품질/);
    const n = await seedDocs(db, quality(), now);
    expect(n).toBeGreaterThan(40);
    expect(await seedDocs(db, quality(), now)).toBe(0);
    const [std] = await db
      .select()
      .from(docRegister)
      .where(eq(docRegister.no, "STD-05"));
    await expect(
      saveDoc(
        db,
        quality(),
        std.id,
        {
          no: "STD-05",
          name: std.name,
          kind: "std",
          rev: "v0.3",
          effectiveOn: "",
          owner: "",
          location: "",
          source: "",
          receivedOn: "",
          note: "",
        },
        now,
      ),
    ).rejects.toThrow(/개정 요청서/);
    // 개정 요청서(F-Q-05)에 문서를 연결해 승인 → 판이 오른다
    await import("@/modules/quality/qms");
    const d = await createDraft(
      db,
      {
        formCode: "F-Q-05",
        title: "STD-05 개정",
        data: { target: "STD-05", proposed: "x", reason: "y", docId: std.id },
        drafterId: ids.tech1,
      },
      now,
    );
    await submit(db, d.id, ids.tech1, now);
    for (let i = 0; i < 3; i++) {
      const [cur] = await db
        .select()
        .from(approvalDoc)
        .where(eq(approvalDoc.id, d.id));
      if (cur.status === "confirmed") break;
      const step = (
        cur.steps as { status: string; candidates: string[] }[]
      ).find((s) => s.status === "active")!;
      await act(db, d.id, step.candidates[0], "approve", null, now);
    }
    const [after] = await db
      .select()
      .from(docRegister)
      .where(eq(docRegister.id, std.id));
    expect(after.rev).toBe("v0.3");
    expect(after.history[0]).toMatchObject({ rev: "v0.2" });
    // 외부 문서는 판을 직접 바꾼다
    const ext = await saveDoc(
      db,
      quality(),
      null,
      {
        no: "ext-paint-tds",
        name: "도료 TDS",
        kind: "external",
        rev: "2025",
        effectiveOn: "",
        owner: "도장",
        location: "도장실",
        source: "도료 제조사",
        receivedOn: "2026-12-01",
        note: "",
      },
      now,
    );
    await saveDoc(
      db,
      quality(),
      ext,
      {
        no: "EXT-PAINT-TDS",
        name: "도료 TDS",
        kind: "external",
        rev: "2026",
        effectiveOn: "",
        owner: "도장",
        location: "도장실",
        source: "도료 제조사",
        receivedOn: "2026-12-05",
        note: "",
      },
      now,
    );
    await retireDoc(db, quality(), ext, "제품 단종", now);
    expect((await listDocs(db, "retired")).map((x) => x.no)).toEqual([
      "EXT-PAINT-TDS",
    ]);
  });
});

describe("경영검토", () => {
  it("자료를 모으고, 모든 항목 의견·다음 해 목표가 있어야 확정하며, 개선 과제는 업무지시로", async () => {
    const v = await reviewFor(db, 2026, now);
    expect(v.inputs.goals.lines.length).toBe(11);
    expect(v.inputs.prev.lines[0]).toMatch(/첫해/);
    const base = {
      heldOn: "2026-12-10",
      attendees: "대표, 공장장",
      comments: {} as Record<string, string>,
      nextGoals: "",
      resources: "",
      actions: [
        {
          task: "도장 기술자 1명 더 채용 검토",
          assigneeId: ids.manager,
          dueOn: "2027-01-31",
        },
      ],
    };
    await saveReview(db, owner(), 2026, base, false, now);
    await expect(
      saveReview(db, owner(), 2026, base, true, now),
    ).rejects.toThrow(/검토 의견/);
    const comments = Object.fromEntries(
      Object.keys(v.inputs).map((k) => [k, "확인함"]),
    );
    await expect(
      saveReview(db, owner(), 2026, { ...base, comments }, true, now),
    ).rejects.toThrow(/다음 해 목표/);
    const saved = await saveReview(
      db,
      owner(),
      2026,
      { ...base, comments, nextGoals: "그대로" },
      true,
      now,
    );
    expect(saved[0].instructionNo).toMatch(/^WI-/);
    expect((await db.select().from(instruction)).length).toBe(1);
    await expect(
      saveReview(db, owner(), 2026, base, false, now),
    ).rejects.toThrow(/확정한/);
    const next = await reviewFor(db, 2027, new Date("2027-12-10T01:00:00Z"));
    expect(next.inputs.prev.lines[0]).toMatch(/도장 기술자/);
  });
});
