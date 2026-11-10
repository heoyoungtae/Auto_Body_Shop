// 퇴직 처리 점검표(F-11-07), STD-11 7절·취업규칙 제38~42조
// 반납·인계는 앱 기록(비품·치공구 보유, 담당 구역·설비·법규·업무지시)이 0건이어야 끝, 비밀유지 확인서(F-13-03)와 계정 잠금은 저절로 확인,
// 임금·퇴직금은 퇴직일부터 14일 안(근로기준법 제36조), 4대 보험 상실 신고, 경력증명서(요청 시).
import { and, desc, eq, inArray, ne, or } from "drizzle-orm";
import type { Db } from "@/db/client";
import {
  appUser,
  equipment,
  exitCheck,
  fiveSZone,
  fixture,
  instructionTask,
  legalItem,
  payrollRun,
  payslip,
  staffDocument,
  staffProfile,
  tool,
  type ExitItem,
} from "@/db/schema";
import { decrypt } from "@/modules/auth/crypto";
import { can } from "@/modules/auth/permissions";
import type { Role } from "@/modules/auth/roles";
import { writeAudit } from "@/modules/platform/audit";
import { nextDocNo } from "@/modules/platform/docno";
import { UserError } from "@/modules/platform/errors";
import { notifyRole } from "@/modules/platform/notify";
import { addDays, seoulDate } from "@/modules/platform/time";
import type { SlipData } from "./payroll-rules";

export class ExitError extends UserError {}
type Actor = { id: string; roles: Role[] };
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export const EXIT_REASONS = {
  resign: "본인 사직",
  contract_end: "계약 기간 끝",
  retire: "정년",
  dismiss: "해고",
  death: "사망",
  other: "기타",
} as const;
export const EXIT_ITEMS = {
  return_items: {
    label: "비품·치공구·열쇠 반납",
    who: "공장장",
    auto: "holdings",
  },
  handover: {
    label: "담당 구역·설비·업무 인계",
    who: "공장장",
    auto: "handover",
  },
  pledge: {
    label: "퇴직 비밀유지 확인서(F-13-03) 서명",
    who: "본인",
    auto: "pledge",
  },
  account: {
    label: "앱 계정 잠금(퇴직일부터)",
    who: "회계 담당",
    auto: "account",
  },
  settle: {
    label: "미지급 임금·퇴직금 정산(14일 안)",
    who: "회계 담당",
    auto: null,
  },
  insurance: { label: "4대 보험 상실 신고", who: "회계 담당", auto: null },
  career_cert: { label: "경력증명서(요청 시)", who: "회계 담당", auto: null },
} as const;
export type ExitKey = keyof typeof EXIT_ITEMS;
/** 임금·퇴직금 지급 기한(근로기준법 제36조, 퇴직급여법 제9조) */
export const SETTLE_DAYS = 14;

async function row(db: Db, id: string) {
  const [x] = await db.select().from(exitCheck).where(eq(exitCheck.id, id));
  if (!x) throw new ExitError("퇴직 점검표를 찾을 수 없습니다");
  return x;
}

/** 아직 들고 있는 것·맡은 것(앱 기록) */
export async function exitStatus(db: Db, userId: string) {
  const fixtures = await db
    .select({ id: fixture.id, no: fixture.no, name: fixture.name })
    .from(fixture)
    .where(and(eq(fixture.holderId, userId), ne(fixture.status, "disposed")));
  const tools = await db
    .select({ id: tool.id, no: tool.no, name: tool.name })
    .from(tool)
    .where(or(eq(tool.holderId, userId), eq(tool.outBy, userId)));
  const zones = await db
    .select({ code: fiveSZone.code, name: fiveSZone.name })
    .from(fiveSZone)
    .where(or(eq(fiveSZone.ownerId, userId), eq(fiveSZone.deputyId, userId)));
  const equips = await db
    .select({ id: equipment.id, name: equipment.name })
    .from(equipment)
    .where(eq(equipment.ownerId, userId));
  const legal = await db
    .select({ id: legalItem.id, name: legalItem.lawName })
    .from(legalItem)
    .where(eq(legalItem.ownerId, userId));
  const tasks = await db
    .select({ id: instructionTask.id })
    .from(instructionTask)
    .where(
      and(
        eq(instructionTask.assigneeId, userId),
        inArray(instructionTask.status, ["open", "forwarded"]),
      ),
    );
  const [pledge] = await db
    .select({ id: staffDocument.id, status: staffDocument.status })
    .from(staffDocument)
    .where(
      and(
        eq(staffDocument.userId, userId),
        eq(staffDocument.kind, "pledge_leave"),
        ne(staffDocument.status, "cancelled"),
      ),
    )
    .orderBy(desc(staffDocument.createdAt))
    .limit(1);
  const [u] = await db
    .select({ active: appUser.active })
    .from(appUser)
    .where(eq(appUser.id, userId));
  return {
    holdings: [
      ...fixtures.map((f) => `비품 ${f.no} ${f.name}`),
      ...tools.map((t) => `치공구 ${t.no} ${t.name}`),
    ],
    handover: [
      ...zones.map((z) => `5S ${z.code}구역 ${z.name}`),
      ...equips.map((e) => `설비 ${e.name}`),
      ...legal.map((l) => `법규 ${l.name}`),
      ...(tasks.length ? [`진행 중 업무지시 ${tasks.length}건`] : []),
    ],
    pledge: pledge
      ? { id: pledge.id, signed: pledge.status === "signed" }
      : null,
    active: !!u?.active,
  };
}

/**
 * 퇴직금 어림(퇴직급여법 제8조): 1년 이상·주 15시간 이상. 평균임금 = 직전 3개월 임금 ÷ 그 기간 일수, × 30일 × 근속일 ÷ 365.
 * 상여·연차수당 가산은 빠짐 [확인 필요]. 지급된 임금명세서로 계산한다.
 */
export async function severanceEstimate(
  db: Db,
  userId: string,
  hiredOn: string | null,
  leftOn: string,
) {
  if (!hiredOn) return null;
  const days =
    Math.round((Date.parse(leftOn) - Date.parse(hiredOn)) / 864e5) + 1;
  if (days < 365) return { eligible: false as const, days };
  const rows = await db
    .select({ dataEnc: payslip.dataEnc, ym: payrollRun.ym })
    .from(payslip)
    .innerJoin(payrollRun, eq(payrollRun.id, payslip.runId))
    .where(eq(payslip.userId, userId))
    .orderBy(desc(payrollRun.ym))
    .limit(3);
  if (!rows.length)
    return {
      eligible: true as const,
      days,
      amount: null,
      basis: "임금명세서가 없어 계산할 수 없습니다",
    };
  const slips = rows.map((r) => JSON.parse(decrypt(r.dataEnc)) as SlipData);
  const wages = slips.reduce((s, d) => s + d.gross, 0);
  const span = slips.reduce((s, d) => s + d.period.days, 0);
  const avg = wages / span;
  const amount = Math.floor((avg * 30 * days) / 365);
  return {
    eligible: true as const,
    days,
    amount,
    basis: `직전 ${rows.length}개월(${rows
      .map((r) => r.ym)
      .reverse()
      .join(
        "·",
      )}) 임금 ${wages.toLocaleString("ko-KR")}원 ÷ ${span}일 = 평균임금 ${Math.round(avg).toLocaleString("ko-KR")}원 × 30일 × 근속 ${days}일 ÷ 365`,
  };
}

/** 시작: 퇴직일·사유를 명부에 적고 점검표를 연다. 공장장에게 반납·인계 알림 */
export async function startExit(
  db: Db,
  actor: Actor,
  input: { userId: string; leftOn: string; reason: string; noticeOn: string },
  now = new Date(),
) {
  if (!can(actor, "staff.roster"))
    throw new ExitError("퇴직 처리는 회계 담당·대표가 시작합니다");
  if (!DATE.test(input.leftOn)) throw new ExitError("퇴직일을 골라 주세요");
  if (!(input.reason in EXIT_REASONS))
    throw new ExitError("퇴직 사유를 골라 주세요");
  if (
    input.noticeOn &&
    (!DATE.test(input.noticeOn) || input.noticeOn > input.leftOn)
  )
    throw new ExitError("사직 통보일은 퇴직일보다 앞이어야 합니다");
  if (input.userId === actor.id)
    throw new ExitError("자기 퇴직 처리는 다른 사람이 합니다");
  const [u] = await db
    .select({ name: appUser.name })
    .from(appUser)
    .where(eq(appUser.id, input.userId));
  if (!u) throw new ExitError("직원을 찾을 수 없습니다");
  const [open] = await db
    .select({ id: exitCheck.id })
    .from(exitCheck)
    .where(
      and(eq(exitCheck.userId, input.userId), eq(exitCheck.status, "open")),
    );
  if (open) throw new ExitError("이미 진행 중인 퇴직 점검표가 있습니다");
  const docNo = await nextDocNo(db, "RT", now);
  const [r] = await db
    .insert(exitCheck)
    .values({
      docNo,
      userId: input.userId,
      leftOn: input.leftOn,
      reason: input.reason,
      noticeOn: input.noticeOn || null,
      settleDue: addDays(input.leftOn, SETTLE_DAYS),
      createdBy: actor.id,
      createdAt: now,
      updatedAt: now,
    })
    .returning({ id: exitCheck.id });
  const [p] = await db
    .select({ userId: staffProfile.userId })
    .from(staffProfile)
    .where(eq(staffProfile.userId, input.userId));
  const left = {
    leftOn: input.leftOn,
    leftReason: EXIT_REASONS[input.reason as keyof typeof EXIT_REASONS],
    updatedBy: actor.id,
    updatedAt: now,
  };
  if (p)
    await db
      .update(staffProfile)
      .set(left)
      .where(eq(staffProfile.userId, input.userId));
  else await db.insert(staffProfile).values({ userId: input.userId, ...left });
  await writeAudit(db, {
    actorId: actor.id,
    action: "exit.start",
    entityType: "exit_check",
    entityId: docNo,
    after: { leftOn: input.leftOn, reason: input.reason },
  });
  await notifyRole(
    db,
    "plant_manager",
    `${u.name} 퇴직(${input.leftOn}): 비품·치공구 반납과 담당 업무 인계를 확인하세요`,
    `exit-${r.id}`,
    `/staff/exit/${r.id}`,
  );
  return r.id;
}

const MAY: Record<ExitKey, (a: Actor) => boolean> = {
  return_items: (a) => can(a, "staff.assess") || can(a, "staff.roster"),
  handover: (a) => can(a, "staff.assess") || can(a, "staff.roster"),
  pledge: (a) => can(a, "staff.roster"),
  account: (a) => can(a, "staff.roster"),
  settle: (a) => can(a, "staff.roster"),
  insurance: (a) => can(a, "staff.roster"),
  career_cert: (a) => can(a, "staff.roster"),
};

/** 항목 확인. 반납·인계는 남은 것이 없어야, 비밀유지 확인서는 서명돼야, 정산은 지급일·금액 메모가 있어야 */
export async function checkExitItem(
  db: Db,
  actor: Actor,
  id: string,
  key: string,
  note: string,
  now = new Date(),
) {
  const x = await row(db, id);
  if (x.status !== "open") throw new ExitError("닫은 점검표입니다");
  if (!(key in EXIT_ITEMS)) throw new ExitError("없는 항목입니다");
  const k = key as ExitKey;
  if (!MAY[k](actor))
    throw new ExitError(
      `${EXIT_ITEMS[k].label}은(는) ${EXIT_ITEMS[k].who}이(가) 확인합니다`,
    );
  const st = await exitStatus(db, x.userId);
  if (k === "return_items" && st.holdings.length)
    throw new ExitError(
      `아직 반납하지 않은 것이 있습니다: ${st.holdings.slice(0, 3).join(", ")}. 비품·치공구 화면에서 반납 처리하세요`,
    );
  if (k === "handover" && st.handover.length)
    throw new ExitError(
      `아직 넘기지 않은 담당이 있습니다: ${st.handover.slice(0, 3).join(", ")}`,
    );
  if (k === "pledge" && !st.pledge?.signed)
    throw new ExitError(
      "퇴직 비밀유지 확인서(F-13-03)를 먼저 받아 서명시켜 주세요",
    );
  if (k === "account" && st.active)
    throw new ExitError("계정이 아직 열려 있습니다. '계정 잠금'을 누르세요");
  if ((k === "settle" || k === "insurance") && !note.trim())
    throw new ExitError(
      k === "settle"
        ? "지급한 날과 금액(임금·퇴직금)을 적어 주세요"
        : "신고한 날을 적어 주세요",
    );
  const items = {
    ...x.items,
    [k]: {
      done: true,
      by: actor.id,
      at: now.toISOString(),
      note: note.trim() || undefined,
    } satisfies ExitItem,
  };
  await db
    .update(exitCheck)
    .set({ items, updatedAt: now })
    .where(eq(exitCheck.id, id));
}

/** 계정 잠금: 퇴직일부터 */
export async function lockExitAccount(
  db: Db,
  actor: Actor,
  id: string,
  now = new Date(),
) {
  if (!can(actor, "staff.roster"))
    throw new ExitError("계정 잠금은 회계 담당·대표가 합니다");
  const x = await row(db, id);
  if (seoulDate(now) < x.leftOn)
    throw new ExitError(`퇴직일(${x.leftOn})부터 잠급니다`);
  await db
    .update(appUser)
    .set({ active: false })
    .where(eq(appUser.id, x.userId));
  const items = {
    ...x.items,
    account: { done: true, by: actor.id, at: now.toISOString() },
  };
  await db
    .update(exitCheck)
    .set({ items, updatedAt: now })
    .where(eq(exitCheck.id, id));
  await writeAudit(db, {
    actorId: actor.id,
    action: "exit.lock",
    entityType: "exit_check",
    entityId: x.docNo,
  });
}

export async function closeExit(
  db: Db,
  actor: Actor,
  id: string,
  now = new Date(),
) {
  if (!can(actor, "staff.roster"))
    throw new ExitError("점검표는 회계 담당·대표가 닫습니다");
  const x = await row(db, id);
  if (x.status !== "open") throw new ExitError("이미 닫았습니다");
  const left = (Object.keys(EXIT_ITEMS) as ExitKey[]).filter(
    (k) => !x.items[k]?.done && k !== "career_cert",
  );
  if (left.length)
    throw new ExitError(
      `남은 항목: ${left.map((k) => EXIT_ITEMS[k].label).join(", ")}`,
    );
  await db
    .update(exitCheck)
    .set({
      status: "closed",
      closedBy: actor.id,
      closedAt: now,
      updatedAt: now,
    })
    .where(eq(exitCheck.id, id));
  await writeAudit(db, {
    actorId: actor.id,
    action: "exit.close",
    entityType: "exit_check",
    entityId: x.docNo,
  });
}

export async function getExit(db: Db, actor: Actor, id: string) {
  if (!can(actor, "staff.roster") && !can(actor, "staff.assess"))
    throw new ExitError("퇴직 점검표는 대표·공장장·회계 담당이 봅니다");
  const x = await row(db, id);
  const [u] = await db
    .select({ name: appUser.name, hiredOn: staffProfile.hiredOn })
    .from(appUser)
    .leftJoin(staffProfile, eq(staffProfile.userId, appUser.id))
    .where(eq(appUser.id, x.userId));
  const status = await exitStatus(db, x.userId);
  const sev = can(actor, "staff.roster")
    ? await severanceEstimate(db, x.userId, u?.hiredOn ?? null, x.leftOn)
    : null;
  const ids = Object.values(x.items)
    .map((i) => i.by)
    .filter((v): v is string => !!v);
  const names = new Map(
    ids.length
      ? (
          await db
            .select({ id: appUser.id, name: appUser.name })
            .from(appUser)
            .where(inArray(appUser.id, ids))
        ).map((n) => [n.id, n.name])
      : [],
  );
  return {
    x,
    name: u?.name ?? "",
    hiredOn: u?.hiredOn ?? null,
    status,
    sev,
    names,
  };
}

export async function listExits(db: Db) {
  return db
    .select({ x: exitCheck, name: appUser.name })
    .from(exitCheck)
    .innerJoin(appUser, eq(appUser.id, exitCheck.userId))
    .orderBy(desc(exitCheck.createdAt));
}

/** 내 할 일: 반납·인계(공장장), 정산 기한·계정 잠금(회계) */
export async function exitTodos(db: Db, actor: Actor, today: string) {
  const out: {
    key: string;
    when: "late" | "today" | "soon";
    what: string;
    detail?: string;
    href: string;
    action: string;
  }[] = [];
  if (!can(actor, "staff.roster") && !can(actor, "staff.assess")) return out;
  const rows = await db
    .select({ x: exitCheck, name: appUser.name })
    .from(exitCheck)
    .innerJoin(appUser, eq(appUser.id, exitCheck.userId))
    .where(eq(exitCheck.status, "open"));
  for (const { x, name } of rows) {
    const left = (Object.keys(EXIT_ITEMS) as ExitKey[]).filter(
      (k) =>
        !x.items[k]?.done &&
        k !== "career_cert" &&
        MAY[k](actor) &&
        !(actor.roles.includes("owner") && k !== "settle"),
    );
    if (!left.length) continue;
    const when =
      left.includes("settle") && x.settleDue < today
        ? "late"
        : x.leftOn <= today
          ? "today"
          : "soon";
    out.push({
      key: `exit-${x.id}`,
      when,
      what: `퇴직 처리: ${name}(${x.leftOn})`,
      detail: `${left.map((k) => EXIT_ITEMS[k].label).join(" · ")}${left.includes("settle") ? ` · 정산 기한 ${x.settleDue}` : ""}`,
      href: `/staff/exit/${x.id}`,
      action: "점검하기",
    });
  }
  return out;
}
