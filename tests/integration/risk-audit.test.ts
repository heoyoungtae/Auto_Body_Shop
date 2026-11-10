// 리스크·기회 대장(F-Q-03, Q.4)과 내부심사(F-Q-08, Q.7)
import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { nonconformance, notification } from "@/db/schema";
import { myTodos } from "@/modules/dashboard/todo";
import {
  addFinding,
  approveAudit,
  planAudit,
  removeFinding,
  reportAudit,
  returnAudit,
  uncovered,
} from "@/modules/quality/audit";
import {
  createRisk,
  finishRisk,
  importInitialRisks,
  listRisks,
  planRisk,
  reviewRisks,
  riskStats,
  updateRisk,
} from "@/modules/quality/risk";
import { INITIAL_RISKS, STD_CHAPTERS } from "@/modules/quality/risk-rules";
import { auditFinding } from "@/db/schema";
import { seedShop, testDb } from "./db";

let db: Db;
let ids: Awaited<ReturnType<typeof seedShop>>;
beforeEach(async () => {
  db = await testDb();
  ids = await seedShop(db);
});
const now = new Date("2026-11-10T00:00:00Z");
const quality = () => ({ id: ids.quality, roles: ["quality" as const] });
const owner = () => ({ id: ids.owner, roles: ["owner" as const] });
const tech = () => ({ id: ids.tech1, roles: ["technician" as const] });
const ownerNotes = async () =>
  (
    await db
      .select()
      .from(notification)
      .where(eq(notification.userId, ids.owner))
  ).map((n) => n.title);

describe("리스크·기회 대장", () => {
  it("누구나 등록, 6점 이상 대표 알림, 계획·대응 끝·분기 검토", async () => {
    await expect(
      createRisk(
        db,
        tech(),
        {
          kind: "risk",
          content: "부스 센서 고장",
          chapter: "",
          likelihood: 4,
          impact: 1,
          control: "",
        },
        now,
      ),
    ).rejects.toThrow(/1~3/);
    const low = await createRisk(
      db,
      tech(),
      {
        kind: "risk",
        content: "공구 분실",
        chapter: "8장 설비·현장 관리",
        likelihood: 2,
        impact: 1,
        control: "",
      },
      now,
    );
    expect(low.docNo).toMatch(/^RK-2611-/);
    expect((await ownerNotes()).some((t) => t.includes("공구 분실"))).toBe(
      false,
    );
    const hi = await createRisk(
      db,
      tech(),
      {
        kind: "risk",
        content: "부스 센서 고장",
        chapter: "",
        likelihood: 2,
        impact: 3,
        control: "",
      },
      now,
    );
    expect(
      (await ownerNotes()).some(
        (t) => t.includes("6점") && t.includes("부스 센서"),
      ),
    ).toBe(true);
    // 계획 없는 고점수 → 품질 담당 할 일
    expect(
      (await myTodos(db, quality(), now)).some((t) => t.key === "risk-plan"),
    ).toBe(true);
    await expect(
      planRisk(
        db,
        tech(),
        hi.id,
        { plan: "x", ownerId: ids.tech1, due: "2026-11-20" },
        now,
      ),
    ).rejects.toThrow(/품질/);
    await planRisk(
      db,
      quality(),
      hi.id,
      { plan: "온도 기록계 설치", ownerId: ids.tech1, due: "2026-11-15" },
      now,
    );
    // 대응 중이면 올린 사람은 못 고침
    await expect(
      updateRisk(
        db,
        tech(),
        hi.id,
        {
          kind: "risk",
          content: "x",
          chapter: "",
          likelihood: 1,
          impact: 1,
          control: "",
        },
        now,
      ),
    ).rejects.toThrow(/올린 사람/);
    expect(
      (await myTodos(db, tech(), now)).find(
        (t) => t.key === `risk-act-${hi.id}`,
      )?.when,
    ).toBe("soon");
    expect(
      await finishRisk(
        db,
        tech(),
        hi.id,
        { result: "설치함", likelihood: 1, impact: 3 },
        now,
      ),
    ).toBe(3);
    const s = await riskStats(db, now);
    expect(s).toMatchObject({ open: 1, acting: 0, done: 1, high: 0 });

    await expect(reviewRisks(db, quality(), "", now)).rejects.toThrow(/대표/);
    const dec = new Date("2026-12-05T00:00:00Z");
    expect(
      (await myTodos(db, owner(), dec)).some(
        (t) => t.key === "risk-review-2026-Q4",
      ),
    ).toBe(true);
    const r = await reviewRisks(db, owner(), "이상 없음", dec);
    expect(r.quarter).toBe("2026-Q4");
    expect(
      (await myTodos(db, owner(), dec)).some(
        (t) => t.key === "risk-review-2026-Q4",
      ),
    ).toBe(false);
  });

  it("초기 항목", async () => {
    await expect(importInitialRisks(db, tech(), now)).rejects.toThrow(/품질/);
    expect(await importInitialRisks(db, quality(), now)).toBe(
      INITIAL_RISKS.length,
    );
    expect(await importInitialRisks(db, quality(), now)).toBe(0);
    expect((await listRisks(db, quality(), "high", now)).list.length).toBe(
      INITIAL_RISKS.filter((x) => x.likelihood * x.impact >= 6).length,
    );
  });
});

describe("내부심사", () => {
  const base = () => ({
    plannedOn: "2026-11-12",
    scope: ["4장 작업 표준", "5장 품질 검사·출고"],
    auditorId: ids.quality,
    externalAuditor: "",
    auditeeIds: [ids.manager, ids.tech1],
    criteria: "사내 표준서",
  });

  it("계획 → 기록(부적합 자동 발행) → 보고 → 보완 → 승인", async () => {
    await expect(planAudit(db, tech(), base(), now)).rejects.toThrow(/품질/);
    await expect(
      planAudit(db, quality(), { ...base(), auditeeIds: [ids.quality] }, now),
    ).rejects.toThrow(/자기 업무/);
    await expect(
      planAudit(db, quality(), { ...base(), externalAuditor: "외부" }, now),
    ).rejects.toThrow(/하나만/);
    const { id, docNo } = await planAudit(db, owner(), base(), now);
    expect(docNo).toMatch(/^IA-2611-/);
    expect(
      (
        await db
          .select()
          .from(notification)
          .where(eq(notification.userId, ids.tech1))
      ).some((n) => n.title.includes("내부심사 예정")),
    ).toBe(true);
    expect((await uncovered(db, 2026)).length).toBe(STD_CHAPTERS.length - 2);
    // 심사자 할 일(7일 전부터)
    expect(
      (await myTodos(db, quality(), now)).some(
        (t) => t.key === `audit-do-${id}`,
      ),
    ).toBe(true);

    const f = {
      chapter: "4장 작업 표준",
      target: "4.3",
      evidence: "작업 지시서 9건",
      finding: "",
      verdict: "ok",
    };
    await expect(addFinding(db, quality(), id, f, now)).rejects.toThrow(
      /심사일/,
    );
    const day = new Date("2026-11-12T02:00:00Z");
    await expect(addFinding(db, owner(), id, f, day)).rejects.toThrow(
      /지정된 심사자/,
    );
    await expect(
      addFinding(db, quality(), id, { ...f, chapter: "9장 안전보건" }, day),
    ).rejects.toThrow(/범위/);
    await expect(
      addFinding(db, quality(), id, { ...f, verdict: "nc" }, day),
    ).rejects.toThrow(/발견 사항/);
    expect(await addFinding(db, quality(), id, f, day)).toBeNull();
    await expect(reportAudit(db, quality(), id, "좋음", day)).rejects.toThrow(
      /5장/,
    );
    const nc = await addFinding(
      db,
      quality(),
      id,
      {
        ...f,
        chapter: "5장 품질 검사·출고",
        finding: "검사 사진 누락",
        verdict: "nc",
      },
      day,
    );
    const [n] = await db
      .select()
      .from(nonconformance)
      .where(eq(nonconformance.id, nc!));
    expect(n.source).toBe("audit");
    const [ncRow] = await db
      .select()
      .from(auditFinding)
      .where(eq(auditFinding.ncId, nc!));
    await expect(removeFinding(db, quality(), ncRow.id)).rejects.toThrow(
      /지울 수 없/,
    );

    await reportAudit(db, quality(), id, "기록 관리 양호", day);
    expect((await ownerNotes()).some((t) => t.includes(docNo))).toBe(true);
    expect(
      (await myTodos(db, owner(), day)).some(
        (t) => t.key === `audit-approve-${id}`,
      ),
    ).toBe(true);
    await expect(addFinding(db, quality(), id, f, day)).rejects.toThrow(
      /보고한/,
    );
    await returnAudit(db, owner(), id, "9장 추가 확인", day);
    await reportAudit(db, quality(), id, "기록 관리 양호", day);
    await expect(approveAudit(db, quality(), id, day)).rejects.toThrow(/대표/);
    await approveAudit(db, owner(), id, day);
  });

  it("외부 심사원이면 품질 담당이 대신 기록, 10월부터 계획 할 일", async () => {
    const oct = new Date("2026-10-05T00:00:00Z");
    expect(
      (await myTodos(db, quality(), oct)).find(
        (t) => t.key === "audit-plan-2026",
      )?.when,
    ).toBe("soon");
    const { id } = await planAudit(
      db,
      quality(),
      { ...base(), auditorId: "", externalAuditor: "외부 심사원" },
      oct,
    );
    const day = new Date("2026-11-12T02:00:00Z");
    expect(
      await addFinding(
        db,
        quality(),
        id,
        {
          chapter: "4장 작업 표준",
          target: "",
          evidence: "현장",
          finding: "",
          verdict: "ok",
        },
        day,
      ),
    ).toBeNull();
    await expect(
      addFinding(
        db,
        tech(),
        id,
        {
          chapter: "4장 작업 표준",
          target: "",
          evidence: "현장",
          finding: "",
          verdict: "ok",
        },
        day,
      ),
    ).rejects.toThrow(/심사자/);
  });
});
