// 안 쓰는 기능 끄기 3차(대표 2026-11-25 '가+나 전부, 다는 끌 수 있게만'): 빈틈 메우기와 새 기능 10가지.
// 대표 지시 "간소화나 기능 끄기 후 빈틈이나 오류가 생기지 않도록 철저히 검증", "간소화를 끌 때와 기능을 다시 켤 때도".
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { and, eq, isNull } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { appUser, notification, policySetting, repairOrder, userRole, workStep } from "@/db/schema";
import { MENU, TOP } from "@/app/_menu";
import { ALL_ENTRIES, SUB_ENTRIES } from "@/app/_menu-search";
import type { Role } from "@/modules/auth/roles";
import { ROLES } from "@/modules/auth/roles";
import { myTodos } from "@/modules/dashboard/todo";
import { saveKakao, sendNotice } from "@/modules/messaging/service";
import { applyFeatureMode, FEATURES, featuresOff, hiddenHrefs, RULES_DUTY_HEADCOUNT, setFeature, staffHeadcount } from "@/modules/platform/features";
import { linkHidden } from "@/modules/platform/features-link";
import { notifyRole } from "@/modules/platform/notify";
import { loadPolicy, type PolicyKey } from "@/modules/platform/policy";
import { applySimplifyMode, setSimple, SIMPLIFY_ITEMS } from "@/modules/platform/simplify";
import { goalDailyJob } from "@/modules/quality/goals";
import { sendDueSurveys } from "@/modules/cs/service";
import { canReport, REPORTS } from "@/modules/report/catalog";
import { monthlyPack } from "@/modules/report/monthly";
import { periodOf } from "@/modules/report/period";
import { BUILDERS, ReportAccessError, runReport } from "@/modules/report/run";
import { saveMonthSnapshots } from "@/modules/report/snapshot";
import { addStepPhoto, assignGroup, createWorkOrder, finishGroup, finishStep, getWorkOrder, startStep } from "@/modules/repair/work";
import { checkValue, groupSteps, PROCESSES, type Process } from "@/modules/repair/work-rules";
import { onboardingOf } from "@/modules/staff/onboarding";
import { approvedRepair, WEBP } from "./flow";
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
const now = new Date("2026-11-09T01:00:00Z"); // 서울 2026-11-09(월)
const owner = () => ({ id: ids.owner, roles: ["owner" as const] });
const NEW_SIMPLE = ["kakao", "goals", "tools", "fixture_check", "jd", "rules"];
const NEW_OPTIONAL = ["onboarding", "survey", "elearning", "bank"];
const turnOn = (key: PolicyKey) => db.insert(policySetting).values({ key, value: 1, effectiveFrom: "2000-01-02", reason: "시험: 간소화 켬", changedBy: ids.owner });
const allOff = async () => {
  for (const f of FEATURES) await setFeature(db, ids.owner, f.key, false);
};
const actors = () =>
  ROLES.map((r: Role) => ({
    id: ({ owner: ids.owner, plant_manager: ids.manager, advisor: ids.advisor, technician: ids.tech1, quality: ids.quality, safety: ids.safety, accounting: ids.account } as Record<string, string>)[r] ?? ids.owner,
    roles: [r],
  }));

describe("목록 자체 점검", () => {
  it("새 10가지가 들어 있고, 나묶음 6가지만 간편 모드 표시가 붙는다", () => {
    const keys = FEATURES.map((f) => f.key);
    for (const k of [...NEW_SIMPLE, ...NEW_OPTIONAL]) expect(keys).toContain(k);
    expect(new Set(keys).size).toBe(keys.length);
    expect(FEATURES.filter((f) => f.simple).map((f) => f.key)).toEqual(NEW_SIMPLE);
  });

  it("끄는 주소는 모두 실제 화면(또는 보고서)이다", () => {
    for (const f of FEATURES)
      for (const h of f.hrefs) {
        const path = h.split("?")[0];
        const dir = path.startsWith("/reports/") ? "src/app/reports/[id]" : join("src/app", path);
        expect(existsSync(dir), `${f.key} ${h}`).toBe(true);
      }
  });

  it("기능 하나를 끄면 숨는 메뉴는 그 기능 것뿐이다(수리 흐름·법정 메뉴는 어떤 기능을 꺼도 남는다)", () => {
    const items = [...TOP, ...MENU.flatMap((g) => g.items)];
    const hiddenBy = (key: string) => items.filter((i) => i.href && linkHidden(i.href, FEATURES.find((f) => f.key === key)!.hrefs)).map((i) => i.label);
    expect(hiddenBy("kakao")).toEqual(["카카오 알림톡"]);
    expect(hiddenBy("goals")).toEqual(["품질목표"]);
    expect(hiddenBy("tools")).toEqual(["치공구"]);
    expect(hiddenBy("fixture_check")).toEqual([]);
    expect(hiddenBy("jd")).toEqual(["직무기술서"]);
    expect(hiddenBy("rules")).toEqual(["취업규칙"]);
    expect(hiddenBy("onboarding")).toEqual(["신입 오리엔테이션"]);
    expect(hiddenBy("survey")).toEqual([]);
    expect(hiddenBy("elearning")).toEqual(["사내 교재"]);
    expect(hiddenBy("bank")).toEqual(["통장·카드 내역"]);
    const all = FEATURES.flatMap((f) => f.hrefs);
    const must = ["/home", "/todo", "/consults", "/repairs", "/estimates", "/work", "/repairs?f=qc", "/money", "/claims", "/customers", "/complaints?f=warranty", "/complaints", "/messages/log", "/messages/templates", "/equipment", "/equipment/checks", "/nc", "/std", "/records", "/qms/docs", "/legal", "/suppliers", "/purchases", "/stock", "/fixtures", "/incidents", "/chemicals", "/hazards", "/environment", "/staff", "/staff/docs", "/attendance", "/training", "/staff/exit", "/payroll", "/money/cash", "/money/expenses", "/money/payables", "/money/books", "/money/close", "/money/tax", "/settings/simplify", "/settings/shop", "/settings/messaging", "/settings/insurers", "/approvals", "/journal"];
    for (const h of must) expect(linkHidden(h, all), h).toBe(false);
  });

  it("메뉴 찾기의 하위 화면(새로 쓰기 등)도 기능 주소 아래면 함께 숨는다", () => {
    const hidden = FEATURES.flatMap((f) => f.hrefs);
    const subs = SUB_ENTRIES.filter((e) => e.href && linkHidden(e.href, hidden)).map((e) => e.href);
    for (const h of ["/schedule/new", "/corr/new", "/risks/new", "/audits/new", "/outsource/new"]) if (SUB_ENTRIES.some((e) => e.href === h)) expect(subs).toContain(h);
    // 원래 메뉴가 아닌 것(수리 건 등)은 그대로
    expect(ALL_ENTRIES.filter((e) => e.href === "/repairs").every((e) => !linkHidden(e.href, hidden))).toBe(true);
  });
});

describe("모두 끄고·모두 켜도 오류 없음", () => {
  it("모든 기능을 끄면 어느 역할의 할 일에도 꺼 둔 화면이 없고, 켜면 다시 계산된다", async () => {
    await allOff();
    const hidden = await hiddenHrefs(db);
    for (const a of actors()) {
      const t = await myTodos(db, a, now);
      expect(t.filter((x) => linkHidden(x.href, hidden)), a.roles[0]).toEqual([]);
    }
    for (const f of FEATURES) await setFeature(db, ids.owner, f.key, true);
    expect(await featuresOff(db)).toEqual([]);
    const t = await myTodos(db, owner(), now);
    expect(t.some((x) => x.key === "set-kakao")).toBe(true);
  });

  it("모든 기능을 꺼도 모든 보고서가 오류 없이 계산되거나(꺼 둔 보고서는) 막힌다", async () => {
    await allOff();
    const p = periodOf("month", "2026-11-01");
    for (const def of REPORTS.filter((r) => !r.phase && BUILDERS[r.id])) {
      if (def.feature) await expect(runReport(db, owner(), def.id, p, "prev", now)).rejects.toThrow(ReportAccessError);
      else await runReport(db, owner(), def.id, p, "prev", now);
    }
  });
});

describe("빈틈 메우기(가묶음)", () => {
  it("보고서: 꺼 둔 기능의 숫자·줄·보고서가 빠지고, 다시 켜면 돌아온다", async () => {
    const p = periodOf("month", "2026-11-01");
    const kpi = async (id: string) => (await runReport(db, owner(), id, p, "prev", now)).body.kpis.map((k) => k.key);
    expect(await kpi("summary")).toContain("goalMiss");
    expect(await kpi("purchase")).toContain("os");
    expect(await kpi("equipment")).toContain("pm");
    expect(await kpi("budget")).toContain("salesAch");
    const reviewRows = async () => (await runReport(db, owner(), "review", p, "prev", now)).body.tables[0].rows.map((r) => r.cells[1]);
    expect(await reviewRows()).toEqual(expect.arrayContaining(["품질목표 미달 지표", "리스크·기회 조치 중", "개선 제안·채택"]));

    for (const k of ["goals", "outsource", "lube_pm", "budget", "risks", "suggestions"]) await setFeature(db, ids.owner, k, false);
    expect(await kpi("summary")).not.toContain("goalMiss");
    expect(await kpi("purchase")).not.toContain("os");
    expect(await kpi("equipment")).not.toContain("pm");
    const b = (await runReport(db, owner(), "budget", p, "prev", now)).body;
    expect(b.kpis.map((k) => k.key)).not.toContain("salesAch");
    expect(b.tables.map((t) => t.key)).toEqual(["bepMonths"]);
    expect(b.tables[0].cols).toHaveLength(4);
    expect(b.tables[0].rows.every((r) => r.cells.length === 4)).toBe(true);
    expect(b.notes?.join(" ")).not.toContain("연간 예산에서 적으면");
    const rows = await reviewRows();
    expect(rows).not.toContain("품질목표 미달 지표");
    expect(rows).not.toContain("리스크·기회 조치 중");
    expect(rows).not.toContain("개선 제안·채택");
    expect(rows).toContain("부적합 발행·종결");
    await expect(runReport(db, owner(), "quality", p, "prev", now)).rejects.toThrow(/꺼 둔/);
    const off = await featuresOff(db);
    expect(canReport({ roles: ["owner"], off }, REPORTS.find((r) => r.id === "quality")!)).toBe(false);
    expect(canReport({ roles: ["owner"], off }, REPORTS.find((r) => r.id === "rework")!)).toBe(true);
    // 월 마감 저장본·월 경영보고서에서도 빠진다
    expect(await saveMonthSnapshots(db, ids.owner, "2026-10", now)).not.toContain("quality");
    expect((await monthlyPack(db, ids.owner, "2026-10", now)).map((s) => s.id)).not.toContain("quality");

    for (const k of ["goals", "outsource", "lube_pm", "budget", "risks", "suggestions"]) await setFeature(db, ids.owner, k, true);
    expect(await kpi("summary")).toContain("goalMiss");
    expect(await kpi("budget")).toContain("salesAch");
    expect(await reviewRows()).toContain("품질목표 미달 지표");
    expect(await saveMonthSnapshots(db, ids.owner, "2026-10", now)).toContain("quality");
  });

  it("알림: 끄는 순간 그 기능의 읽지 않은 알림은 읽음으로, 다른 알림은 그대로, 다시 켜면 새 알림이 온다", async () => {
    await notifyRole(db, "plant_manager", "제안", "s-1", "/suggestions/abc");
    await notifyRole(db, "plant_manager", "수리", "r-1", "/repairs/abc");
    await setFeature(db, ids.owner, "suggestions", false);
    const rows = await db.select().from(notification).where(and(eq(notification.userId, ids.manager), isNull(notification.readAt)));
    expect(rows.map((r) => r.title)).toEqual(["수리"]);
    expect((await db.select().from(notification).where(eq(notification.userId, ids.manager))).length).toBe(2);
    await setFeature(db, ids.owner, "suggestions", true);
    await notifyRole(db, "plant_manager", "제안 2", "s-2", "/suggestions/def");
    expect((await db.select().from(notification).where(and(eq(notification.userId, ids.manager), isNull(notification.readAt)))).map((r) => r.title).sort()).toEqual(["수리", "제안 2"]);
  });
});

describe("새로 끌 수 있는 기능(나·다묶음)", () => {
  it("카카오 알림톡: 끄면 설정 할 일이 사라지고, 알림톡을 켜 두었어도 문자로 간다. 다시 켜면 알림톡", async () => {
    await saveKakao(db, ids.owner, { enabled: true, pfId: "@jm", codes: {}, reviewed: [] });
    const send = () => sendNotice(db, { key: "ready_notice", to: "01012345678", vars: { 고객명: "홍길동", 차량번호: "12가3456" }, purpose: "시험", sentBy: null });
    expect((await send()).channel).toBe("알림톡");
    expect((await myTodos(db, owner(), now)).some((t) => t.key === "kakao-review")).toBe(true);
    await setFeature(db, ids.owner, "kakao", false);
    expect((await send()).channel).not.toBe("알림톡");
    expect((await myTodos(db, owner(), now)).some((t) => t.href === "/settings/kakao")).toBe(false);
    await setFeature(db, ids.owner, "kakao", true);
    expect((await send()).channel).toBe("알림톡");
  });

  it("품질목표: 끄면 매달 고정·부적합 자동 생성을 하지 않고, 다시 켜면 그 뒤부터 한다", async () => {
    const d = new Date("2026-11-06T01:00:00Z");
    await setFeature(db, ids.owner, "goals", false);
    expect(await goalDailyJob(db, d)).toBe("품질목표: 꺼 둠");
    expect((await myTodos(db, { id: ids.quality, roles: ["quality"] }, d)).some((t) => t.href.startsWith("/qms/goals"))).toBe(false);
    await setFeature(db, ids.owner, "goals", true);
    expect(await goalDailyJob(db, d)).not.toBe("품질목표: 꺼 둠");
  });

  it("만족도 설문: 끄면 보내지 않고, 다시 켜면 보낸다", async () => {
    await setFeature(db, ids.owner, "survey", false);
    expect(await sendDueSurveys(db, now)).toBe("만족도 설문: 꺼 둠");
    await setFeature(db, ids.owner, "survey", true);
    expect(await sendDueSurveys(db, now)).toMatch(/^만족도 설문 \d/);
  });

  it("취업규칙·직무기술서: 끄면 신입 점검표에서 항목이 빠지고, 켜면 돌아온다", async () => {
    await db.execute(`insert into staff_profile (user_id, hired_on) values ('${ids.tech1}', '2026-11-02') on conflict (user_id) do update set hired_on = excluded.hired_on`);
    const keys = async () => (await onboardingOf(db, ids.tech1))!.items.map((i) => i.key);
    expect(await keys()).toEqual(expect.arrayContaining(["rules", "jd"]));
    await setFeature(db, ids.owner, "rules", false);
    await setFeature(db, ids.owner, "jd", false);
    expect(await keys()).not.toContain("rules");
    expect(await keys()).not.toContain("jd");
    expect(await keys()).toContain("contract");
    await setFeature(db, ids.owner, "rules", true);
    await setFeature(db, ids.owner, "jd", true);
    expect(await keys()).toEqual(expect.arrayContaining(["rules", "jd"]));
  });

  it("취업규칙: 직원 10명부터는 끌 수 없고, 꺼 둔 채 10명이 되면 대표 할 일", async () => {
    const before = await staffHeadcount(db);
    expect(before).toBeLessThan(RULES_DUTY_HEADCOUNT);
    await setFeature(db, ids.owner, "rules", false);
    expect((await myTodos(db, owner(), now)).some((t) => t.key === "rules-duty")).toBe(false);
    for (let i = 0; i < RULES_DUTY_HEADCOUNT - before; i++) {
      const [u] = await db.insert(appUser).values({ loginId: `extra${i}`, name: `직원${i}`, passwordHash: "x" }).returning();
      await db.insert(userRole).values({ userId: u.id, role: "technician" });
    }
    expect(await staffHeadcount(db)).toBe(RULES_DUTY_HEADCOUNT);
    const t = (await myTodos(db, owner(), now)).find((x) => x.key === "rules-duty");
    expect(t?.href).toBe("/settings/simplify");
    await setFeature(db, ids.owner, "rules", true);
    await expect(setFeature(db, ids.owner, "rules", false)).rejects.toThrow(/10명/);
    // 간편 모드도 취업규칙은 끄지 않는다
    await applyFeatureMode(db, ids.owner, "simple");
    expect(await featuresOff(db)).not.toContain("rules");
    expect(await featuresOff(db)).toContain("kakao");
  });

  it("치공구·비품 점검·사내 교재·통장 연동: 끄면 그 할 일만 빠지고 수리 흐름 할 일은 그대로", async () => {
    for (const k of ["tools", "fixture_check", "elearning", "bank", "onboarding"]) await setFeature(db, ids.owner, k, false);
    const hidden = await hiddenHrefs(db);
    expect(linkHidden("/money/expenses/new?tool=%EB%A0%8C%EC%B9%98&qty=1", hidden)).toBe(true);
    expect(linkHidden("/money/expenses/new?tx=abc", hidden)).toBe(true);
    expect(linkHidden("/money/expenses/new", hidden)).toBe(false);
    expect(linkHidden("/fixtures/check", hidden)).toBe(true);
    expect(linkHidden("/fixtures/abc", hidden)).toBe(false);
    expect(linkHidden("/training/new?kind=std_rev", hidden)).toBe(true);
    expect(linkHidden("/training/learn/abc", hidden)).toBe(false); // 이미 배정한 학습(법정 교육 포함)은 그대로
    expect(linkHidden("/training/new?kind=safety_hire&who=x", hidden)).toBe(false);
    for (const a of actors()) expect((await myTodos(db, a, now)).filter((x) => linkHidden(x.href, hidden))).toEqual([]);
  });
});

describe("간편 모드 ↔ 표준 왕복", () => {
  it("간편 모드는 나묶음 6가지를 끄고 다묶음은 켜 둔다. 표준은 6가지를 다시 켜고, 대표가 따로 끈 기능은 건드리지 않는다", async () => {
    await setFeature(db, ids.owner, "schedule", false);
    await applySimplifyMode(db, ids.owner, "simple", now);
    expect(await applyFeatureMode(db, ids.owner, "simple")).toBe(6);
    let off = await featuresOff(db);
    for (const k of NEW_SIMPLE) expect(off).toContain(k);
    for (const k of NEW_OPTIONAL) expect(off).not.toContain(k);
    expect(off).toContain("schedule");
    const pol = await loadPolicy(db, "2026-11-09");
    for (const i of SIMPLIFY_ITEMS) expect(pol[i.key], i.key).toBe(i.simple);
    // 두 번 눌러도 그대로
    expect(await applyFeatureMode(db, ids.owner, "simple")).toBe(0);
    await applySimplifyMode(db, ids.owner, "standard", now);
    expect(await applyFeatureMode(db, ids.owner, "standard")).toBe(6);
    off = await featuresOff(db);
    expect(off).toEqual(["schedule"]);
    const pol2 = await loadPolicy(db, "2026-11-09");
    for (const i of SIMPLIFY_ITEMS) expect(pol2[i.key], i.key).toBe(0);
    // 다시 간편 → 표준을 반복해도 할 일 계산이 깨지지 않는다
    await applyFeatureMode(db, ids.owner, "simple");
    await applyFeatureMode(db, ids.owner, "standard");
    for (const a of actors()) await myTodos(db, a, now);
  });

  it("공정 3묶음을 일하는 중에 끄면 남은 공정은 하나씩 끝내고, 다시 켜면 남은 묶음만 끝낸다", async () => {
    await turnOn("simple.step_groups");
    const boss = { id: ids.manager, roles: ["plant_manager" as const] };
    const tech = { id: ids.tech1, roles: ["technician" as const] };
    const allChecks = (ps: string[]) => ps.flatMap((p) => PROCESSES[p as Process].checks.map((c) => checkValue(p, c)));
    const DETAIL = { colorCode: "NKA", mixNo: "M-1", tempC: "60", minutes: "30" };
    const { roId } = await approvedRepair(db, ids, now, (names) => names.some((n) => n.includes("범퍼")));
    const { id } = await createWorkOrder(db, boss, roId, now);
    const groups = groupSteps((await getWorkOrder(db, id)).steps);
    for (const g of groups) await assignGroup(db, boss, id, g.key, { assignee: ids.tech1, planDate: "2026-11-10" }, now);
    // 묶음 모드로 판금 준비 시작(첫 사진) → 간소화 끔
    await addStepPhoto(db, tech, groups[0].steps[0].id, WEBP, now);
    await setSimple(db, ids.owner, "simple.step_groups", false, now);
    await expect(finishGroup(db, tech, id, "prep", { checks: allChecks(groups[0].steps.map((s) => s.process)), detail: {}, note: "" }, now)).rejects.toThrow(/꺼져/);
    // 이미 시작된 공정은 시작을 다시 누르지 않고 사진·검사만 채워 하나씩 끝낸다
    for (const s of groups[0].steps) {
      const cur = (await db.select().from(workStep).where(eq(workStep.id, s.id)))[0];
      expect(cur.startedAt).not.toBeNull();
      if (PROCESSES[s.process as Process].photo && !(cur.photos as unknown[]).length) await addStepPhoto(db, tech, s.id, WEBP, now);
      await finishStep(db, tech, s.id, { checks: [...PROCESSES[s.process as Process].checks], detail: DETAIL, note: "" }, now);
    }
    // 도장 묶음의 첫 공정만 하나 끝낸 뒤 다시 켠다
    const paint = groupSteps((await getWorkOrder(db, id)).steps)[1];
    const first = paint.steps[0];
    await startStep(db, tech, first.id, now);
    if (PROCESSES[first.process as Process].photo) await addStepPhoto(db, tech, first.id, WEBP, now);
    await finishStep(db, tech, first.id, { checks: [...PROCESSES[first.process as Process].checks], detail: DETAIL, note: "" }, now);
    await setSimple(db, ids.owner, "simple.step_groups", true, now);
    const rest = groupSteps((await getWorkOrder(db, id)).steps)[1].steps.filter((s) => !s.endedAt);
    // 묶음당 사진 1장은 꺼져 있어(표준) 사진이 필요한 공정마다 1장
    await addStepPhoto(db, tech, rest[0].id, WEBP, now);
    for (const s of rest.slice(1).filter((x) => PROCESSES[x.process as Process].photo)) await addStepPhoto(db, tech, s.id, WEBP, now);
    await finishGroup(db, tech, id, "paint", { checks: allChecks(rest.map((s) => s.process)), detail: { colorCode: "NKA", mixNo: "M-1", tempC: "60", minutes: "30" }, note: "" }, now);
    const w = await getWorkOrder(db, id);
    expect(w.steps.find((s) => s.id === first.id)!.endedAt).not.toBeNull();
    const fin = groupSteps(w.steps)[2];
    await addStepPhoto(db, tech, fin.steps[0].id, WEBP, now);
    for (const s of fin.steps.slice(1).filter((x) => PROCESSES[x.process as Process].photo)) await addStepPhoto(db, tech, s.id, WEBP, now);
    expect((await finishGroup(db, tech, id, "finish", { checks: allChecks(fin.steps.map((s) => s.process)), detail: {}, note: "" }, now)).done).toBe(true);
    const [r] = await db.select({ status: repairOrder.status }).from(repairOrder).where(eq(repairOrder.id, roId));
    expect(r.status).toBe("inspecting");
  });
});
