// 인사평가(F-11-06): 근거 모으기, 제안 점수, 작성 규칙, 면담 확인, 대표 확정 → 내년 교육 계획
import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { competency } from "@/db/schema";
import { submitSuggestion } from "@/modules/equipment/suggestion";
import { getTraining } from "@/modules/staff/training";
import {
  ackReview,
  collectEvidence,
  confirmReview,
  getReview,
  gradeOf,
  listReviews,
  returnReview,
  reviewTodos,
  saveReview,
  startReview,
  suggestScores,
} from "@/modules/staff/review";
import { seedShop, testDb } from "./db";

let db: Db;
let ids: Awaited<ReturnType<typeof seedShop>>;
beforeEach(async () => {
  db = await testDb();
  ids = await seedShop(db);
});
const owner = () => ({ id: ids.owner, roles: ["owner" as const] });
const pm = () => ({ id: ids.manager, roles: ["plant_manager" as const] });
const tech = () => ({ id: ids.tech1, roles: ["technician" as const] });
const dec = new Date("2026-12-10T01:00:00Z");
const input = (o: Partial<Parameters<typeof saveReview>[3]> = {}) => ({
  scores: {
    competency: 4,
    quality: 4,
    safety: 3,
    attendance: 4,
    suggestion: 3,
  },
  comments: {} as Record<string, string>,
  strengths: "꼼꼼함",
  improve: "",
  trainingNeeds: "알루미늄 판금 OJT",
  wageNote: "3% 인상",
  ...o,
});

describe("인사평가", () => {
  it("근거·제안 점수·등급", async () => {
    await db
      .insert(competency)
      .values({
        userId: ids.tech1,
        skill: "sheet",
        level: 3,
        assessedOn: "2026-06-01",
        confirmedAt: dec,
      });
    await submitSuggestion(
      db,
      tech(),
      {
        title: "공구 벽걸이",
        area: "",
        problem: "찾기 어려움",
        proposal: "벽걸이",
        effect: "",
      },
      dec,
    );
    const e = await collectEvidence(db, ids.tech1, 2026);
    expect(e.skills).toContainEqual({ skill: "sheet", level: 3 });
    expect(e.suggestions).toBe(1);
    const s = suggestScores(e);
    expect(s).toMatchObject({ suggestion: 3, attendance: 5, quality: 3 });
    expect(gradeOf(4.5)).toBe("S");
    expect(gradeOf(3.4)).toBe("B");
  });

  it("작성 → 면담 → 확정, 권한", async () => {
    expect(
      (await reviewTodos(db, pm(), "2026-12-10")).some(
        (t) => t.key === "pe-write-2026",
      ),
    ).toBe(true);
    await expect(startReview(db, tech(), ids.tech2, 2026, dec)).rejects.toThrow(
      /공장장/,
    );
    await expect(startReview(db, pm(), ids.manager, 2026, dec)).rejects.toThrow(
      /자기 평가/,
    );
    const id = await startReview(db, pm(), ids.tech1, 2026, dec);
    expect(await startReview(db, pm(), ids.tech1, 2026, dec)).toBe(id);
    await expect(getReview(db, tech(), id)).rejects.toThrow(/볼 수 없/);
    await expect(
      saveReview(
        db,
        pm(),
        id,
        input({
          scores: {
            competency: 5,
            quality: 4,
            safety: 3,
            attendance: 4,
            suggestion: 3,
          },
        }),
        false,
        dec,
      ),
    ).rejects.toThrow(/근거/);
    await expect(
      saveReview(
        db,
        pm(),
        id,
        input({
          scores: {
            competency: 2,
            quality: 2,
            safety: 3,
            attendance: 3,
            suggestion: 3,
          },
          comments: { competency: "x", quality: "y" },
        }),
        true,
        dec,
      ),
    ).rejects.toThrow(/보완할 점/);
    await saveReview(db, pm(), id, input(), true, dec);
    const { r } = await getReview(db, tech(), id);
    expect(r).toMatchObject({ status: "interview", grade: "A", total: 3.6 });
    await expect(saveReview(db, pm(), id, input(), false, dec)).rejects.toThrow(
      /면담으로 넘긴/,
    );
    await expect(confirmReview(db, owner(), id, dec)).rejects.toThrow(
      /본인 면담/,
    );
    expect(
      (await reviewTodos(db, tech(), "2026-12-10")).some(
        (t) => t.key === `pe-ack-${id}`,
      ),
    ).toBe(true);
    await expect(
      ackReview(
        db,
        pm(),
        id,
        { interviewedOn: "2026-12-10", comment: "" },
        dec,
      ),
    ).rejects.toThrow(/본인/);
    await ackReview(
      db,
      tech(),
      id,
      { interviewedOn: "2026-12-10", comment: "동의합니다" },
      dec,
    );
    await expect(confirmReview(db, pm(), id, dec)).rejects.toThrow(/대표/);
    await confirmReview(db, owner(), id, dec);
    const done = (await getReview(db, owner(), id)).r;
    expect(done.status).toBe("confirmed");
    const t = await getTraining(db, done.trainingId!);
    expect(t.t).toMatchObject({ year: 2027, kind: "ojt", status: "planned" });
    expect((await listReviews(db, tech(), 2026)).rows).toHaveLength(1);
  });

  it("돌려보내기는 작성 중으로", async () => {
    const id = await startReview(db, pm(), ids.tech2, 2026, dec);
    await saveReview(db, pm(), id, input({ trainingNeeds: "" }), true, dec);
    await returnReview(db, owner(), id, dec);
    expect((await getReview(db, pm(), id)).r.status).toBe("draft");
  });
});
