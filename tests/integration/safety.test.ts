// 안전보건(STD-09): 사고·아차사고 F-09-03, 화학물질·MSDS F-09-02, 위험성평가 F-09-01
import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { auditLog, incident, nonconformance, notification } from "@/db/schema";
import { myTodos } from "@/modules/dashboard/todo";
import {
  createChemical,
  recordChemTraining,
  replaceMsds,
  type ChemicalInput,
} from "@/modules/safety/chemical";
import {
  addHazardRow,
  finishAssessment,
  finishMeasure,
  getAssessment,
  startAssessment,
} from "@/modules/safety/hazard";
import {
  closeIncident,
  getIncident,
  investigateIncident,
  reportIncident,
} from "@/modules/safety/incident";
import { INITIAL_HAZARDS } from "@/modules/safety/rules";
import { seedShop, testDb } from "./db";

let db: Db;
let ids: Awaited<ReturnType<typeof seedShop>>;
beforeEach(async () => {
  db = await testDb();
  ids = await seedShop(db);
});
const now = new Date("2026-11-10T03:00:00Z");
const safety = () => ({ id: ids.safety, roles: ["safety" as const] });
const manager = () => ({ id: ids.manager, roles: ["plant_manager" as const] });
const tech = () => ({ id: ids.tech1, roles: ["technician" as const] });
const tech2 = () => ({ id: ids.tech2, roles: ["technician" as const] });
const titles = async (u: string) =>
  (await db.select().from(notification).where(eq(notification.userId, u))).map(
    (n) => n.title,
  );
const inc = {
  kind: "accident",
  occurredAt: "2026-11-10T11:30",
  place: "A 판금",
  process: "리프트 작업",
  description: "리프트 패드 미끄러짐",
  severity: "first_aid",
  injured: "최기술",
  injury: "왼손 베임",
  damage: "",
  immediate: "소독",
};
const PDF = new TextEncoder().encode("%PDF-1.4\n%test\n");

describe("사고·아차사고", () => {
  it("보고 → 알림·부적합 → 조사 → 종결, 부상 정보 암호화·열람 제한", async () => {
    await expect(
      reportIncident(db, tech(), { ...inc, kind: "near" }, now),
    ).rejects.toThrow(/아차사고가 아니라/);
    await expect(
      reportIncident(db, tech(), { ...inc, injured: "" }, now),
    ).rejects.toThrow(/다친 사람/);
    await expect(
      reportIncident(
        db,
        tech(),
        { ...inc, occurredAt: "2026-11-10T13:00" },
        now,
      ),
    ).rejects.toThrow(/지금보다/);
    const r = await reportIncident(db, tech(), inc, now);
    expect(r.docNo).toMatch(/^AC-2611-/);
    expect(r.ncId).toBeTruthy();
    const [nc] = await db
      .select()
      .from(nonconformance)
      .where(eq(nonconformance.id, r.ncId!));
    expect(nc.source).toBe("accident");
    expect((await titles(ids.safety)).some((t) => t.includes(r.docNo))).toBe(
      true,
    );
    expect((await titles(ids.owner)).some((t) => t.includes(r.docNo))).toBe(
      true,
    );
    // 암호화 저장, 감사 로그에 부상 내용 없음
    const [raw] = await db.select().from(incident).where(eq(incident.id, r.id));
    expect(raw.injuryEnc).not.toContain("베임");
    expect(JSON.stringify(await db.select().from(auditLog))).not.toContain(
      "베임",
    );
    expect((await getIncident(db, tech2(), r.id)).hidden).toBe(true);
    expect((await getIncident(db, tech(), r.id)).injury).toBe("왼손 베임");
    expect((await getIncident(db, manager(), r.id)).injured).toBe("최기술");

    // 24시간 지나면 늦음
    expect(
      (await myTodos(db, manager(), new Date("2026-11-11T04:00:00Z"))).find(
        (t) => t.key === `inc-inv-${r.id}`,
      )?.when,
    ).toBe("late");
    await expect(
      investigateIncident(
        db,
        tech(),
        r.id,
        { cause: "x", prevention: "y", damage: "", immediate: "" },
        now,
      ),
    ).rejects.toThrow(/공장장/);
    await expect(
      closeIncident(
        db,
        safety(),
        r.id,
        {
          legalNeeded: "0",
          legalReportedOn: "",
          legalNote: "",
          hazardReview: "x",
        },
        now,
      ),
    ).rejects.toThrow(/원인/);
    await investigateIncident(
      db,
      manager(),
      r.id,
      {
        cause: "패드 마모",
        prevention: "패드 교체",
        damage: "",
        immediate: "",
      },
      now,
    );
    await expect(
      closeIncident(
        db,
        manager(),
        r.id,
        {
          legalNeeded: "0",
          legalReportedOn: "",
          legalNote: "",
          hazardReview: "x",
        },
        now,
      ),
    ).rejects.toThrow(/안전환경/);
    await expect(
      closeIncident(
        db,
        safety(),
        r.id,
        {
          legalNeeded: "1",
          legalReportedOn: "",
          legalNote: "",
          hazardReview: "x",
        },
        now,
      ),
    ).rejects.toThrow(/신고한 날/);
    await expect(
      closeIncident(
        db,
        safety(),
        r.id,
        {
          legalNeeded: "0",
          legalReportedOn: "",
          legalNote: "",
          hazardReview: "",
        },
        now,
      ),
    ).rejects.toThrow(/위험성평가/);
    await closeIncident(
      db,
      safety(),
      r.id,
      {
        legalNeeded: "0",
        legalReportedOn: "",
        legalNote: "",
        hazardReview: "기존 평가에 있음",
      },
      now,
    );
    expect((await getIncident(db, safety(), r.id)).x.status).toBe("closed");
  });

  it("아차사고는 부적합 없이, 휴업 사고는 신고 판단 근거 필요", async () => {
    const n = await reportIncident(
      db,
      tech(),
      { ...inc, kind: "near", severity: "none", injured: "", injury: "" },
      now,
    );
    expect(n.ncId).toBeNull();
    const a = await reportIncident(
      db,
      tech(),
      { ...inc, severity: "lost_time" },
      now,
    );
    await investigateIncident(
      db,
      safety(),
      a.id,
      { cause: "c", prevention: "p", damage: "", immediate: "" },
      now,
    );
    await expect(
      closeIncident(
        db,
        safety(),
        a.id,
        {
          legalNeeded: "0",
          legalReportedOn: "",
          legalNote: "",
          hazardReview: "x",
        },
        now,
      ),
    ).rejects.toThrow(/근거/);
    await closeIncident(
      db,
      safety(),
      a.id,
      {
        legalNeeded: "1",
        legalReportedOn: "2026-11-12",
        legalNote: "",
        hazardReview: "HA 수시",
      },
      now,
    );
  });
});

describe("화학물질·MSDS", () => {
  const chem: ChemicalInput = {
    name: "2K 클리어",
    maker: "",
    category: "도료",
    hazards: "이소시아네이트",
    monthlyUse: "4L",
    location: "위험물 보관함 2칸",
    ppe: ["방독 마스크(유기가스용)", "없는 보호구"],
    flammable: true,
    msdsRevisedOn: "2026-01-02",
    trainedOn: "",
    note: "",
  };
  it("등록·인화성 보관·MSDS·교육 할 일", async () => {
    await expect(createChemical(db, tech(), chem, null, now)).rejects.toThrow(
      /안전환경/,
    );
    await expect(
      createChemical(
        db,
        safety(),
        { ...chem, location: "조색실 선반" },
        null,
        now,
      ),
    ).rejects.toThrow(/위험물 보관함/);
    await expect(
      createChemical(
        db,
        safety(),
        chem,
        { name: "a.txt", bytes: new TextEncoder().encode("hello") },
        now,
      ),
    ).rejects.toThrow(/PDF/);
    const id = await createChemical(db, safety(), chem, null, now);
    expect(
      (await titles(ids.manager)).some((t) => t.includes("MSDS 교육")),
    ).toBe(true);
    expect(
      (await myTodos(db, safety(), now)).some((t) => t.key === "chem-msds"),
    ).toBe(true);
    await replaceMsds(
      db,
      safety(),
      id,
      { name: "msds.pdf", bytes: PDF },
      "2026-03-01",
      now,
    );
    expect(
      (await myTodos(db, safety(), now)).some((t) => t.key === "chem-msds"),
    ).toBe(false);
    expect(
      (await myTodos(db, manager(), now)).some((t) => t.key === "chem-train"),
    ).toBe(true);
    await expect(
      recordChemTraining(db, tech(), id, "2026-11-10", now),
    ).rejects.toThrow(/공장장/);
    await recordChemTraining(db, manager(), id, "2026-11-10", now);
    expect(
      (await myTodos(db, manager(), now)).some((t) => t.key === "chem-train"),
    ).toBe(false);
  });
});

describe("위험성평가", () => {
  const row = {
    process: "조색",
    hazard: "용제 흡입",
    current: "",
    likelihood: 2,
    severity: 2,
    measureType: "",
    measure: "",
    ownerId: "",
    due: "",
  };
  it("최초 초안 → 4점 이상 대책 필수 → 확정·공유 → 대책 끝 → 다음 평가에 잔류 점수", async () => {
    expect(
      (await myTodos(db, safety(), now)).some((t) => t.key === "haz-initial"),
    ).toBe(true);
    await expect(
      startAssessment(
        db,
        safety(),
        { kind: "initial", reason: "", participants: [], copy: true },
        now,
      ),
    ).rejects.toThrow(/참여/);
    const a = await startAssessment(
      db,
      safety(),
      {
        kind: "initial",
        reason: "",
        participants: [ids.tech1, ids.tech2],
        copy: true,
      },
      now,
    );
    expect(a.rows).toBe(INITIAL_HAZARDS.length);
    await expect(
      addHazardRow(db, safety(), a.id, { ...row, measure: "후드" }, now),
    ).rejects.toThrow(/담당/);
    await expect(finishAssessment(db, safety(), a.id, now)).rejects.toThrow(
      /대책이 없는/,
    );
    const { rows } = await getAssessment(db, a.id);
    const { updateHazardRow } = await import("@/modules/safety/hazard");
    for (const r of rows.filter((x) => x.score >= 4))
      await updateHazardRow(db, safety(), r.id, {
        process: r.process,
        hazard: r.hazard,
        current: r.current ?? "",
        likelihood: r.likelihood,
        severity: r.severity,
        measureType: "engineering",
        measure: "배기 보강",
        ownerId: ids.tech1,
        due: "2026-11-15",
      });
    await finishAssessment(db, safety(), a.id, now);
    expect((await titles(ids.tech2)).some((t) => t.includes("결과 공유"))).toBe(
      true,
    );
    await expect(addHazardRow(db, safety(), a.id, row, now)).rejects.toThrow(
      /확정한/,
    );
    const todo = (await myTodos(db, tech(), now)).filter((t) =>
      t.key.startsWith("haz-m-"),
    );
    expect(todo.length).toBeGreaterThan(0);
    const target = rows.find((x) => x.score >= 4)!;
    await expect(
      finishMeasure(
        db,
        tech2(),
        target.id,
        { result: "x", residualL: 1, residualS: 3 },
        now,
      ),
    ).rejects.toThrow(/담당/);
    expect(
      await finishMeasure(
        db,
        tech(),
        target.id,
        { result: "배기 보강", residualL: 1, residualS: target.severity },
        now,
      ),
    ).toBe(target.severity);
    // 다음 정기 평가는 잔류 점수와 한 대책을 불러옴
    const b = await startAssessment(
      db,
      safety(),
      { kind: "regular", reason: "", participants: [ids.tech1], copy: true },
      new Date("2027-01-05T00:00:00Z"),
    );
    const nb = (await getAssessment(db, b.id)).rows.find(
      (x) => x.hazard === target.hazard,
    )!;
    expect(nb.likelihood).toBe(1);
    expect(nb.current).toContain("배기 보강");
  });
});
