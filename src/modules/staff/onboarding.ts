// 신입 오리엔테이션 점검표(F-11-09, STD-11). 항목은 따로 적지 않고 이미 있는 기록(명부·서류·교육·역량표)에서 자동으로 판정한다.
// 사용자 결정 2026-11-14 '제안대로 진행': 입사 전 직무 정하기 → 첫날 서명 → 1주 직무기술서 확인 → 입사일+14일 채용 시 교육
// → 첫 역량 등록(지도자 배정) → 3개월 안 독립 작업(2단계) 확인.
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import type { Db } from "@/db/client";
import { appUser, competency, staffDocument, staffProfile, training, trainingAttendee, userRole } from "@/db/schema";
import { can } from "@/modules/auth/permissions";
import type { Role } from "@/modules/auth/roles";
import { addDays } from "@/modules/platform/time";
import { jdAckStatus, myJobTitles, rulesAckStatus } from "./documents";
import { JOBS, jobByTitle } from "./job-rules";
import { SKILLS } from "./rules";

type Actor = { id: string; roles: Role[] };

/** 신입으로 보고 점검표를 보여 주는 기간(입사일부터) */
export const ONBOARD_WINDOW_DAYS = 120;

export const ONBOARD_ITEMS = {
  job: { label: "근로자 명부에 직무 정하기(직무기술서에서 고르기)", day: 0, who: "회계 담당·대표" },
  role: { label: "로그인 계정에 직무의 앱 역할 주기", day: 0, who: "대표" },
  contract: { label: "근로계약서 서명", day: 0, who: "회계 담당·대표 → 본인" },
  pledge: { label: "정보보호·비밀유지 서약서 서명", day: 0, who: "회계 담당·대표 → 본인" },
  rules: { label: "취업규칙 읽고 확인 서명", day: 1, who: "본인" },
  jd: { label: "직무기술서 읽고 확인 서명", day: 7, who: "본인" },
  hire_training: { label: "채용 시 교육(안전보건·직무 입문) 이수", day: 14, who: "본인(교육은 공장장·안전환경 담당이 배정)" },
  first_level: { label: "역량표 첫 등록과 지도자(3단계 이상) 정하기", day: 7, who: "공장장 → 대표 확인" },
  solo: { label: "주 직무 2단계(독립 작업) 평가·확인 — 수습을 두면 종료 면담", day: 90, who: "공장장 → 대표 확인" },
} as const;
export type OnboardKey = keyof typeof ONBOARD_ITEMS;

export type OnboardItem = { key: OnboardKey; label: string; who: string; due: string; done: boolean; href: string; detail?: string };
export type Onboarding = { userId: string; name: string; hiredOn: string; job: string; items: OnboardItem[]; done: number; total: number; late: OnboardItem[] };

/** 한 사람의 점검표 */
export async function onboardingOf(db: Db, userId: string): Promise<Onboarding | null> {
  const [u] = await db
    .select({ id: appUser.id, name: appUser.name, hiredOn: staffProfile.hiredOn, job: staffProfile.job })
    .from(appUser)
    .leftJoin(staffProfile, eq(staffProfile.userId, appUser.id))
    .where(eq(appUser.id, userId));
  if (!u?.hiredOn) return null;
  const [roles, docs, rules, jd, titles, hire, comp] = await Promise.all([
    db.select({ role: userRole.role }).from(userRole).where(eq(userRole.userId, userId)),
    db.select({ kind: staffDocument.kind }).from(staffDocument).where(and(eq(staffDocument.userId, userId), eq(staffDocument.status, "signed"))),
    rulesAckStatus(db),
    jdAckStatus(db),
    myJobTitles(db, userId),
    db
      .select({ id: trainingAttendee.id })
      .from(trainingAttendee)
      .innerJoin(training, eq(training.id, trainingAttendee.trainingId))
      .where(and(eq(trainingAttendee.userId, userId), eq(training.kind, "safety_hire"), isNotNull(trainingAttendee.signedAt))),
    db.select({ skill: competency.skill, level: competency.level }).from(competency).where(and(eq(competency.userId, userId), isNotNull(competency.confirmedAt))),
  ]);
  const key = jobByTitle(u.job);
  const job = key ? JOBS[key] : null;
  const roleList = roles.map((r) => r.role);
  const signed = (k: string) => docs.some((d) => d.kind === k);
  const myJd = jd.get(userId);
  const best = (skills: readonly string[]) => Math.max(0, ...comp.filter((c) => skills.includes(c.skill)).map((c) => c.level));
  const due = (k: OnboardKey) => addDays(u.hiredOn!, ONBOARD_ITEMS[k].day);
  const it = (k: OnboardKey, done: boolean, href: string, detail?: string): OnboardItem => ({ key: k, label: ONBOARD_ITEMS[k].label, who: ONBOARD_ITEMS[k].who, due: due(k), done, href, detail });

  const items: OnboardItem[] = [
    it("job", !!job, `/staff/${userId}`, job ? job.title : u.job ? `'${u.job}'는 직무기술서에 없는 이름입니다` : undefined),
    it("role", !!job && roleList.includes(job.role), "/settings/users", job && !roleList.includes(job.role) ? `'${job.title}' 역할이 계정에 없습니다` : undefined),
    it("contract", signed("contract"), `/staff/${userId}/docs/new?kind=contract`),
    it("pledge", signed("pledge_join"), `/staff/${userId}/docs/new?kind=pledge_join`),
    it("rules", rules.has(userId), "/rules"),
    it("jd", !!myJd && titles.length > 0 && myJd.job.join("|") === titles.join("|"), "/jobs", myJd && myJd.job.join("|") !== titles.join("|") ? "직무가 바뀌어 다시 확인해야 합니다" : undefined),
    it("hire_training", hire.length > 0, "/training"),
  ];
  // 역량 단계로 일을 받는 직무(상담원·기술자)만 역량 항목을 본다
  if (job?.skills?.length && job.entryLevel && job.entryLevel.newbie <= 2) {
    const names = job.skills.map((s) => SKILLS[s]).join("·");
    const lv = best(job.skills);
    items.push(it("first_level", lv >= 1, `/staff/competency?u=${userId}`, `${names} 현재 ${lv ? `${lv}단계` : "없음"}`));
    items.push(it("solo", lv >= 2, `/staff/competency?u=${userId}`, `${names} 2단계가 되면 혼자 배정됩니다`));
  }
  const done = items.filter((i) => i.done).length;
  return { userId, name: u.name, hiredOn: u.hiredOn, job: job?.title ?? u.job ?? "", items, done, total: items.length, late: [] };
}

/** 입사 ONBOARD_WINDOW_DAYS 안이거나 아직 끝나지 않은 신입들 */
export async function onboardingList(db: Db, today: string): Promise<Onboarding[]> {
  const rows = await db
    .select({ id: appUser.id, hiredOn: staffProfile.hiredOn, leftOn: staffProfile.leftOn })
    .from(appUser)
    .innerJoin(staffProfile, eq(staffProfile.userId, appUser.id))
    .where(eq(appUser.active, true));
  const owners = new Set((await db.select({ userId: userRole.userId }).from(userRole).where(inArray(userRole.role, ["owner"]))).map((r) => r.userId));
  const from = addDays(today, -ONBOARD_WINDOW_DAYS);
  const out: Onboarding[] = [];
  for (const r of rows) {
    if (!r.hiredOn || r.leftOn || owners.has(r.id) || r.hiredOn < from) continue;
    const o = await onboardingOf(db, r.id);
    if (!o) continue;
    o.late = o.items.filter((i) => !i.done && i.due < today);
    out.push(o);
  }
  return out.sort((a, b) => b.hiredOn.localeCompare(a.hiredOn));
}

export const canSeeOnboarding = (a: Actor) => can(a, "staff.roster") || can(a, "staff.assess");

/** 내 할 일: 신입 오리엔테이션 기한이 지난 항목(채용 시 교육은 교육 쪽 할 일이 따로 있어 뺀다) */
export async function onboardingTodos(db: Db, actor: Actor, today: string) {
  const out: { key: string; when: "late" | "today" | "soon"; what: string; detail?: string; href: string; action: string }[] = [];
  if (!canSeeOnboarding(actor)) return out;
  for (const o of await onboardingList(db, today)) {
    const late = o.late.filter((i) => i.key !== "hire_training");
    if (!late.length) continue;
    out.push({
      key: `onboard-${o.userId}`,
      when: "late",
      what: `신입 오리엔테이션: ${o.name}`,
      detail: `${late.length}개 늦음 — ${late.map((i) => ONBOARD_ITEMS[i.key].label.split("(")[0]).join(", ")}`,
      href: "/staff/onboarding",
      action: "점검표 보기",
    });
  }
  return out;
}
