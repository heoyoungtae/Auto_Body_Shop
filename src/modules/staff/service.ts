// 직원 명부(F-11-01)·역량 표(F-11-02), STD-11.
// 명부: 대표·회계 담당이 쓰고 본다(생년월일·주소는 암호화, 다른 직원에게는 이름·직무·입사일만).
// 역량: 공장장(또는 대표)이 매기고 대표가 확인해야 현재 단계가 된다(쌓기만, 이력 남음).
import { can } from "@/modules/auth/permissions";
import { and, desc, eq, isNotNull, isNull } from "drizzle-orm";
import type { Db } from "@/db/client";
import { appUser, competency, staffProfile, userRole, type License } from "@/db/schema";
import { decrypt, encrypt } from "@/modules/auth/crypto";
import { createUser } from "@/modules/auth/service";
import type { Role } from "@/modules/auth/roles";
import { writeAudit } from "@/modules/platform/audit";
import { UserError } from "@/modules/platform/errors";
import { notifyRole, notifyUser } from "@/modules/platform/notify";
import { loadPolicy } from "@/modules/platform/policy";
import { seoulDate } from "@/modules/platform/time";
import { assignmentIssue, CONTRACT_KIND, GENDER, INSPECTOR_LEVEL, isLevel, isSkill, SKILLS, type Levels } from "./rules";

export class StaffError extends UserError {}
type Actor = { id: string; roles: Role[] };
export const canSeeRoster = (a: Actor) => can(a, "staff.roster");
export const canAssess = (a: Actor) => can(a, "staff.assess");

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** 지금 단계: 사람·직무마다 대표가 확인한 마지막 평가 */
export async function currentLevels(db: Db): Promise<Map<string, Levels>> {
  const rows = await db.select().from(competency).where(isNotNull(competency.confirmedAt)).orderBy(competency.confirmedAt, competency.id);
  const out = new Map<string, Levels>();
  for (const r of rows) {
    if (!isSkill(r.skill)) continue;
    const m = out.get(r.userId) ?? {};
    m[r.skill] = r.level;
    out.set(r.userId, m);
  }
  return out;
}

export async function levelsOf(db: Db, userId: string): Promise<Levels> {
  return (await currentLevels(db)).get(userId) ?? {};
}

/** 대표 확인을 기다리는 평가 */
export async function pendingAssessments(db: Db) {
  return db
    .select({ c: competency, name: appUser.name })
    .from(competency)
    .innerJoin(appUser, eq(appUser.id, competency.userId))
    .where(and(isNull(competency.confirmedAt), isNull(competency.rejectedAt)))
    .orderBy(competency.createdAt);
}

export async function competencyHistory(db: Db, userId: string) {
  return db.select({ c: competency, by: appUser.name }).from(competency).leftJoin(appUser, eq(appUser.id, competency.assessedBy)).where(eq(competency.userId, userId)).orderBy(desc(competency.createdAt)).limit(50);
}

/** 역량 평가. 대표가 하면 바로 확정, 공장장이 하면 대표 확인 대기. 자기 평가는 대표만 확정할 수 있다 */
export async function assessCompetency(db: Db, actor: Actor, input: { userId: string; skill: string; level: number; note: string; assessedOn: string }, now = new Date()) {
  if (!canAssess(actor)) throw new StaffError("역량 평가는 공장장·대표가 합니다(STD-11 6절)");
  if (!isSkill(input.skill)) throw new StaffError("직무를 골라 주세요");
  if (!isLevel(input.level)) throw new StaffError("단계(1~4)를 골라 주세요");
  if (!ISO.test(input.assessedOn) || input.assessedOn > seoulDate(now)) throw new StaffError("평가일을 확인해 주세요(오늘이나 그 전)");
  const [u] = await db.select({ id: appUser.id, name: appUser.name }).from(appUser).where(eq(appUser.id, input.userId));
  if (!u) throw new StaffError("없는 직원입니다");
  if (!input.note.trim()) throw new StaffError("근거를 적어 주세요(예: 시편 작업 확인, 교육 이수, 재작업률)");
  const owner = can(actor, "staff.confirm");
  const [row] = await db
    .insert(competency)
    .values({ userId: u.id, skill: input.skill, level: input.level, note: input.note.trim(), assessedOn: input.assessedOn, assessedBy: actor.id, confirmedBy: owner ? actor.id : null, confirmedAt: owner ? now : null })
    .returning({ id: competency.id });
  await writeAudit(db, { actorId: actor.id, action: "competency.assess", entityType: "app_user", entityId: u.id, after: { skill: input.skill, level: input.level, confirmed: owner } });
  if (!owner) await notifyRole(db, "owner", `역량 평가 확인: ${u.name} ${SKILLS[input.skill]} ${input.level}단계`, `comp-${row.id}`, "/staff/competency");
  return { confirmed: owner };
}

/** 대표 확인·되돌림 */
export async function confirmAssessment(db: Db, actor: Actor, id: number, ok: boolean, now = new Date()) {
  if (!can(actor, "staff.confirm")) throw new StaffError("역량 평가 확인은 대표가 합니다");
  const [c] = await db.select().from(competency).where(eq(competency.id, id));
  if (!c || c.confirmedAt || c.rejectedAt) throw new StaffError("이미 처리했거나 없는 평가입니다");
  await db.update(competency).set(ok ? { confirmedBy: actor.id, confirmedAt: now } : { rejectedAt: now, confirmedBy: actor.id }).where(eq(competency.id, id));
  await writeAudit(db, { actorId: actor.id, action: ok ? "competency.confirm" : "competency.reject", entityType: "app_user", entityId: c.userId, after: { skill: c.skill, level: c.level } });
  if (c.assessedBy) await notifyUser(db, c.assessedBy, `역량 평가 ${ok ? "확인됨" : "되돌림"}: ${SKILLS[c.skill as keyof typeof SKILLS] ?? c.skill} ${c.level}단계`, `comp-done-${id}`, "/staff/competency");
}

/** 직원 목록(명부): 계정·역할·입사일·직무·지금 역량 */
export async function listStaff(db: Db, actor: Actor) {
  const [users, roles, profiles, levels] = await Promise.all([
    db.select({ id: appUser.id, loginId: appUser.loginId, name: appUser.name, active: appUser.active, retiredOn: appUser.retiredOn }).from(appUser).orderBy(appUser.createdAt),
    db.select().from(userRole),
    db.select().from(staffProfile),
    currentLevels(db),
  ]);
  const full = canSeeRoster(actor);
  return users.map((u) => {
    const p = profiles.find((x) => x.userId === u.id);
    return {
      ...u,
      roles: roles.filter((r) => r.userId === u.id).map((r) => r.role as Role),
      job: p?.job ?? null,
      hiredOn: p?.hiredOn ?? null,
      leftOn: p?.leftOn ?? null,
      contractKind: full ? (p?.contractKind ?? null) : null,
      licenses: p?.licenses ?? [],
      levels: levels.get(u.id) ?? {},
    };
  });
}

export type ProfileView = { job: string; gender: string; birth: string; phone: string; emName: string; emRelation: string; emPhone: string; zip: string; address: string; addressDetail: string; career: string; hiredOn: string; contractKind: string; contractEnd: string; licenses: License[]; leftOn: string; leftReason: string };

/** 010-1234-5678 꼴로 */
function fmtPhone(x: string) {
  const d = x.replace(/[^\d]/g, "");
  if (d.length === 11) return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
  if (d.length === 10) return d.startsWith("02") ? `02-${d.slice(2, 6)}-${d.slice(6)}` : `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  if (d.length === 9) return `02-${d.slice(2, 5)}-${d.slice(5)}`;
  return d;
}

/** 주소는 {우편번호, 주소, 상세} JSON 으로 암호화해 둔다(예전 값은 주소 한 줄) */
function parseAddress(raw: string) {
  if (!raw) return { zip: "", address: "", addressDetail: "" };
  try {
    const o = JSON.parse(raw) as { zip?: string; address?: string; addressDetail?: string };
    return { zip: o.zip ?? "", address: o.address ?? "", addressDetail: o.addressDetail ?? "" };
  } catch {
    return { zip: "", address: raw, addressDetail: "" };
  }
}

/** 명부 한 사람(대표·회계만, 본인은 자기 것) */
export async function getProfile(db: Db, actor: Actor, userId: string): Promise<ProfileView | null> {
  if (!canSeeRoster(actor) && actor.id !== userId) throw new StaffError("근로자 명부는 대표·회계 담당만 봅니다");
  const [p] = await db.select().from(staffProfile).where(eq(staffProfile.userId, userId));
  if (!p) return null;
  const dec = (v: string | null) => (v ? decrypt(v) : "");
  const addr = parseAddress(dec(p.addressEnc));
  let em = { name: "", relation: "", phone: "" };
  try {
    if (p.emergencyEnc) em = { ...em, ...(JSON.parse(dec(p.emergencyEnc)) as typeof em) };
  } catch {
    /* 깨진 값은 비움 */
  }
  return { job: p.job ?? "", gender: p.gender ?? "", birth: dec(p.birthEnc), phone: dec(p.phoneEnc), emName: em.name, emRelation: em.relation, emPhone: em.phone, ...addr, career: p.career ?? "", hiredOn: p.hiredOn ?? "", contractKind: p.contractKind ?? "", contractEnd: p.contractEnd ?? "", licenses: p.licenses, leftOn: p.leftOn ?? "", leftReason: p.leftReason ?? "" };
}

/** 근로자 명부 저장(STD-11 4.5: 회계 담당, 대표) */
export async function saveProfile(db: Db, actor: Actor, userId: string, input: ProfileView, now = new Date()) {
  if (!canSeeRoster(actor)) throw new StaffError("근로자 명부는 대표·회계 담당이 적습니다");
  const [u] = await db.select({ id: appUser.id }).from(appUser).where(eq(appUser.id, userId));
  if (!u) throw new StaffError("없는 직원입니다");
  if (!input.job.trim()) throw new StaffError("종사 업무(직무)를 적어 주세요");
  if (!ISO.test(input.hiredOn)) throw new StaffError("입사일을 골라 주세요");
  if (input.gender && !(input.gender in GENDER)) throw new StaffError("성별을 다시 골라 주세요");
  if (input.birth && (!ISO.test(input.birth) || input.birth > seoulDate(now))) throw new StaffError("생년월일을 확인해 주세요");
  const PHONE = /^0\d{8,10}$/;
  const digits = (x: string) => x.replace(/[^\d]/g, "");
  if (!input.phone.trim()) throw new StaffError("휴대폰 번호를 적어 주세요(급한 연락·근태 알림용)");
  if (!PHONE.test(digits(input.phone))) throw new StaffError("휴대폰 번호를 확인해 주세요. 예: 010-1234-5678");
  if (input.emPhone.trim() && !PHONE.test(digits(input.emPhone))) throw new StaffError("비상연락처 번호를 확인해 주세요");
  if (input.emPhone.trim() && !input.emName.trim()) throw new StaffError("비상연락처의 이름을 적어 주세요");
  if (input.zip && !/^\d{5}$/.test(input.zip.trim())) throw new StaffError("우편번호는 숫자 5자리입니다");
  if (!(input.contractKind in CONTRACT_KIND)) throw new StaffError("계약 형태를 골라 주세요");
  if (input.contractKind === "fixed" && !ISO.test(input.contractEnd)) throw new StaffError("기간제는 계약 끝나는 날을 적어 주세요");
  if (input.contractEnd && input.contractEnd < input.hiredOn) throw new StaffError("계약 끝나는 날이 입사일보다 앞섭니다");
  if (input.leftOn && (!ISO.test(input.leftOn) || input.leftOn < input.hiredOn)) throw new StaffError("퇴직일을 확인해 주세요");
  if (input.leftOn && !input.leftReason.trim()) throw new StaffError("퇴직 사유를 적어 주세요(근로자 명부 기재 사항)");
  const licenses = input.licenses.filter((l) => l.name.trim()).map((l) => ({ name: l.name.trim(), no: l.no.trim(), on: l.on }));
  const values = {
    job: input.job.trim(),
    gender: input.gender || null,
    birthEnc: input.birth ? encrypt(input.birth, "sensitive") : null,
    addressEnc: input.address.trim() ? encrypt(JSON.stringify({ zip: input.zip.trim(), address: input.address.trim(), addressDetail: input.addressDetail.trim() }), "sensitive") : null,
    phoneEnc: encrypt(fmtPhone(input.phone), "sensitive"),
    emergencyEnc: input.emName.trim() || input.emPhone.trim() ? encrypt(JSON.stringify({ name: input.emName.trim(), relation: input.emRelation.trim(), phone: input.emPhone.trim() ? fmtPhone(input.emPhone) : "" }), "sensitive") : null,
    career: input.career.trim() || null,
    hiredOn: input.hiredOn,
    contractKind: input.contractKind,
    contractEnd: input.contractEnd || null,
    licenses,
    leftOn: input.leftOn || null,
    leftReason: input.leftOn ? input.leftReason.trim() : null,
    updatedBy: actor.id,
    updatedAt: now,
  };
  await db.insert(staffProfile).values({ userId, ...values }).onConflictDoUpdate({ target: staffProfile.userId, set: values });
  // 개인정보는 감사 기록에 남기지 않는다(무엇을 바꿨는지만)
  await writeAudit(db, { actorId: actor.id, action: "staff.profile", entityType: "app_user", entityId: userId, after: { job: values.job, hiredOn: values.hiredOn, contractKind: values.contractKind, leftOn: values.leftOn, licenses: licenses.length } });
}

/**
 * 직원 등록: 계정과 근로자 명부를 한 번에 만든다.
 * 역할은 대표(계정 관리 권한)만 준다. 회계 담당이 등록하면 계정은 잠긴 채 생기고 대표에게 역할 지정을 알린다.
 */
export async function registerStaff(db: Db, actor: Actor, input: { name: string; loginId: string; password: string; roles: string[]; profile: ProfileView }, now = new Date()) {
  if (!canSeeRoster(actor)) throw new StaffError("직원 등록은 대표·회계 담당이 합니다");
  const manage = can(actor, "account.manage");
  const roles = manage ? input.roles : [];
  if (manage && !roles.length) throw new StaffError("역할을 하나 이상 고르세요");
  const id = await db.transaction(async (tx) => {
    const uid = await createUser(tx as unknown as Db, actor.id, { loginId: input.loginId, name: input.name, password: input.password, roles, pendingRoles: !manage });
    await saveProfile(tx as unknown as Db, actor, uid, input.profile, now);
    return uid;
  });
  if (!manage) await notifyRole(db, "owner", `직원 등록됨: ${input.name.trim()} — 역할을 정하면 로그인할 수 있습니다`, `staff-new-${id}`, "/settings/users");
  return { id, pendingRoles: !manage };
}

/** 작업 배정 점검(work.ts 가 부른다): 단독 기준 미만이면 지도자 필요 */
export async function checkAssignment(db: Db, process: string, assignee: string, mentor: string | null, on = seoulDate()) {
  const levels = await currentLevels(db);
  const p = await loadPolicy(db, on);
  return assignmentIssue(process, levels.get(assignee) ?? {}, mentor ? (levels.get(mentor) ?? {}) : null, p["competency.min_solo_level"]);
}

/** 최종 검사자 자격: '검사' 숙련(3단계) 이상 */
export async function inspectorIssue(db: Db, userId: string) {
  const lv = (await levelsOf(db, userId)).inspect ?? 0;
  return lv >= INSPECTOR_LEVEL ? null : `역량 표에서 '검사'가 ${lv ? `${lv}단계` : "없음"}입니다. 최종 검사는 숙련(${INSPECTOR_LEVEL}단계) 이상만 합니다(STD-11 6절). 공장장에게 역량 평가를 요청하세요`;
}
