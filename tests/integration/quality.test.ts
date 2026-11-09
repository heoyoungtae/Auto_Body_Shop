// 부적합·시정 조치(F-Q-10)와 3정5S(F-08-05): 발행 → 계획 → 조치 → 효과 확인 → 종결, 5S 80점 미만 자동 발행
import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { planIssues, scoreIssues } from "@/modules/quality/rules";
import { addNcPhoto, closeNc, getNc, issueNc, listNc, ncDailyAlerts, openNc, planNc, recordNcAction, verifyNc } from "@/modules/quality/nc";
import { fiveSBoard, myZonesToday, rateMonthly, recordDaily, setZone } from "@/modules/quality/five-s";
import { seedShop, testDb } from "./db";

let db: Db;
let ids: Awaited<ReturnType<typeof seedShop>>;
beforeEach(async () => {
  db = await testDb();
  ids = await seedShop(db);
});
const now = new Date("2026-11-09T01:00:00Z");
const owner = () => ({ id: ids.owner, roles: ["owner" as const] });
const mgr = () => ({ id: ids.manager, roles: ["plant_manager" as const] });
const tech = () => ({ id: ids.tech1, roles: ["technician" as const] });
const tech2 = () => ({ id: ids.tech2, roles: ["technician" as const] });
const quality = () => ({ id: ids.quality, roles: ["quality" as const] });
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...new Array(300).fill(1)]);
const plan = { whys: ["도장 먼지", "부스 필터 막힘"], rootCause: "equipment", corrective: "필터 교체 주기를 차압 기준으로", assigneeId: "", dueOn: "2026-11-20", stdRevision: false, revisionRef: "" };

describe("부적합 규칙", () => {
  it("계획 검사와 점수 검사", () => {
    expect(planIssues({ ...plan, whys: ["하나"], assigneeId: "x" }, "2026-11-09").join()).toMatch(/두 단계/);
    expect(planIssues({ ...plan, assigneeId: "x", dueOn: "2026-11-01" }, "2026-11-09").join()).toMatch(/지난/);
    expect(planIssues({ ...plan, assigneeId: "x", stdRevision: true }, "2026-11-09").join()).toMatch(/F-Q-05/);
    expect(scoreIssues([20, 20, 15, 20, 20]).join()).toMatch(/20·10·0/);
  });
});

describe("부적합 흐름", () => {
  it("누구나 발행, 품질이 계획, 담당이 조치, 효과 확인 뒤 종결, 중대 건은 대표", async () => {
    const { id, docNo } = await openNc(db, tech(), { source: "other", content: "도료 보관함 문 열림", major: true }, now);
    expect(docNo).toMatch(/^NC-/);
    await expect(planNc(db, tech(), id, { ...plan, assigneeId: ids.tech1 }, now)).rejects.toThrow(/품질/);
    await expect(recordNcAction(db, tech(), id, "닫음", now)).rejects.toThrow(/먼저/);
    await planNc(db, quality(), id, { ...plan, assigneeId: ids.tech1 }, now);
    await expect(recordNcAction(db, tech2(), id, "닫음", now)).rejects.toThrow(/조치 담당/);
    await addNcPhoto(db, tech(), id, "action", PNG);
    await recordNcAction(db, tech(), id, "필터 교체, 주기 변경 요청", now);
    await expect(closeNc(db, quality(), id, now)).rejects.toThrow(/효과 확인/);
    await verifyNc(db, quality(), id, { effectOn: "2026-11-09", recurred: true, effectNote: "다시 먼지" }, now);
    expect((await getNc(db, id)).n.status).toBe("planned");
    await recordNcAction(db, tech(), id, "부스 실링 보수", now);
    await verifyNc(db, quality(), id, { effectOn: "2026-11-09", recurred: false, effectNote: "2주간 먼지 불량 없음" }, now);
    await expect(closeNc(db, quality(), id, now)).rejects.toThrow(/대표/);
    await closeNc(db, owner(), id, now);
    expect((await listNc(db, { status: "closed" })).length).toBe(1);
  });

  it("자동 발행은 같은 관련 건이면 겹치지 않고, 처리 결정이 늦으면 알린다", async () => {
    const a = await issueNc(db, ids.quality, { source: "inspect", refType: "repair_order", refId: "r1", refLabel: "RO-1", content: "불합격" }, now);
    const b = await issueNc(db, ids.quality, { source: "inspect", refType: "repair_order", refId: "r1", refLabel: "RO-1", content: "불합격 2" }, now);
    expect(b).toMatchObject({ id: a.id, existed: true });
    expect((await getNc(db, a.id)).n.dueOn).toBe("2026-11-16");
    expect(await ncDailyAlerts(db, new Date("2026-11-11T01:00:00Z"))).toMatch(/부적합 알림 1건/);
  });
});

describe("3정5S", () => {
  it("구역 담당이 일일 점검, 공장장 월간 평가, 80점 미만은 부적합(사진 있어야 조치 끝)", async () => {
    await expect(setZone(db, tech(), "A", { ownerId: ids.tech1, deputyId: "" })).rejects.toThrow(/공장장/);
    await setZone(db, mgr(), "A", { ownerId: ids.tech1, deputyId: ids.tech2 }, now);
    expect((await myZonesToday(db, ids.tech1, "2026-11-09")).map((z) => z.code)).toEqual(["A"]);
    await expect(recordDaily(db, quality(), "A", { results: Array(7).fill(true) }, now)).rejects.toThrow(/구역 담당/);
    await expect(recordDaily(db, tech(), "A", { results: [false, ...Array(6).fill(true)] }, now)).rejects.toThrow(/×/);
    await recordDaily(db, tech(), "A", { results: Array(7).fill(true) }, now);
    await recordDaily(db, tech2(), "A", { results: [false, ...Array(6).fill(true)], note: "통로에 범퍼 적치 → 치움" }, now); // 같은 날 고쳐 씀
    expect(await myZonesToday(db, ids.tech1, "2026-11-09")).toEqual([]);

    await expect(rateMonthly(db, tech(), { ym: "2026-11", zone: "A", scores: [20, 20, 20, 20, 20] }, now)).rejects.toThrow(/공장장/);
    await expect(rateMonthly(db, mgr(), { ym: "2026-11", zone: "A", scores: [20, 10, 10, 20, 10] }, now)).rejects.toThrow(/지적 사항/);
    const r = await rateMonthly(db, mgr(), { ym: "2026-11", zone: "A", scores: [20, 10, 10, 20, 10], remarks: "쉐도우 보드 빈칸 3" }, now);
    expect(r.total).toBe(70);
    expect(r.nc).toBeTruthy();
    const nc = (await getNc(db, r.nc!.id)).n;
    expect(nc).toMatchObject({ source: "five_s", dueOn: "2026-11-23" });
    await expect(rateMonthly(db, mgr(), { ym: "2026-11", zone: "A", scores: [20, 20, 20, 20, 20] }, now)).rejects.toThrow(/이미/);
    expect((await rateMonthly(db, mgr(), { ym: "2026-11", zone: "B", scores: [20, 20, 20, 20, 20] }, now)).nc).toBeNull();
    await planNc(db, quality(), r.nc!.id, { ...plan, assigneeId: ids.tech1 }, now);
    await expect(recordNcAction(db, tech(), r.nc!.id, "정위치", now)).rejects.toThrow(/사진/);

    const b = await fiveSBoard(db, "2026-11-09");
    const A = b.zones.find((z) => z.code === "A")!;
    expect(A.today?.results[0]).toBe(false);
    expect(A.scores["2026-11"].total).toBe(70);
    expect(A.rate).toBe(17); // 11월 영업일 2~6·9일 6일 중 1일
  });
});
