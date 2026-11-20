// TV 현황판(대표 결정 2026-11-18): 입고 중 차량 정비 현황과 입고·출고 예정. 모두 앞선 전표에서 모은다(따로 입력 없음).
// 고객 이름·연락처·금액은 넣지 않는다(공장 TV는 손님도 본다). 차량번호·차종·상태·공정·담당 기술자 이름·약속일만.
// 로그인 없이 TV(크롬캐스트·미니 PC 브라우저)에서 열 수 있게 비밀 열쇠(?k=) 링크를 둔다. 새로 만들면 예전 링크는 막힌다.
import { and, asc, desc, eq, gte, inArray, isNotNull, lt, ne, notInArray } from "drizzle-orm";
import type { Db } from "@/db/client";
import {
  appConfig,
  appUser,
  consultation,
  customer,
  estimate,
  inspection,
  insuranceClaim,
  outsourceJob,
  portalOrder,
  purchaseOrder,
  repairOrder,
  repairStatement,
  vehicle,
  workOrder,
  workplace,
  workStep,
  branch,
} from "@/db/schema";
import { decrypt, encrypt, randomToken, sha256 } from "@/modules/auth/crypto";
import { can } from "@/modules/auth/permissions";
import type { Role } from "@/modules/auth/roles";
import { seoulDateTime } from "@/modules/customer/rules";
import { writeAudit } from "@/modules/platform/audit";
import { UserError } from "@/modules/platform/errors";
import { loadShopInfo } from "@/modules/platform/shop";
import { addDays, seoulDate } from "@/modules/platform/time";
import { processLabel } from "@/modules/repair/work-rules";
import { classifyRo, dayWord, lateDays, sortBoard, stageOfProcess, TB_STAGE_KEYS, tbStageOf, type TbStage, type TvState } from "./tv-rules";

export type TvCar = {
  id: string;
  plate: string;
  model: string;
  state: TvState;
  sub: string;
  tags: string[];
  /** 공정 막대: 끝난 수, 전체, 지금 하는 공정 순번(0부터) */
  done: number;
  total: number;
  current: number | null;
  due: string | null;
  dueWord: string;
  late: number;
  inAt: string;
  /** 업체 주문번호(테크베이 등, 있으면) */
  orderNo: string | null;
  /** 테크베이용 현황판: 지금 서 있는 공정 단계·그 공정을 하고 있나·공정 막대 칸마다의 단계 */
  stage: TbStage;
  doing: boolean;
  stages: TbStage[];
};
/** 오늘 출고한 차(테크베이 현황판 목록 맨 아래) */
export type TvGone = { id: string; plate: string; model: string; at: string; orderNo: string | null };
export type TvIncoming = { key: string; when: string; sort: string; today: boolean; plate: string; model: string; tags: string[]; kind: "예약" | "업체 주문" };
export type TvOutgoing = { key: string; when: string; sort: string; late: number; plate: string; model: string; state: TvState };
export type TvData = {
  shop: string;
  /** 지점·작업장만 보는 TV면 그 이름(제목에 붙음) */
  scope: string | null;
  today: string;
  at: string;
  kpi: { todayIn: number; inShop: number; work: number; hold: number; ready: number; late: number };
  /** 흐름 요약(테크베이 현황판 상단): 오늘 실제 입고 → 공정 단계별 대수(작업 중·대기) → 오늘 출고 */
  flow: { inToday: number; outToday: number; stages: Record<TbStage, { n: number; doing: number }> };
  /** 오늘 출고한 차 */
  gone: TvGone[];
  cars: TvCar[];
  incoming: TvIncoming[];
  outgoing: TvOutgoing[];
};

const OPEN_PO = ["draft", "review", "approved", "sent", "partial"];
const hhmm = (d: Date) => new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hour12: false }).format(d);

function tagsOf(insurance: string, kind: string | null, portal: string | null): string[] {
  const t: string[] = [];
  if (insurance !== "self") t.push("보험");
  if (kind === "business") t.push(portal === "techbay" ? "테크베이" : "업체");
  return t;
}

/** 현황판 한 장에 들어갈 값 */
export type TvScope = { branchId?: string | null; workplaceId?: string | null; /** 이 업체 주문 앱 고객(테크베이) 차만 */ portal?: "techbay" | null };

/** 주소의 b(지점)·w(작업장) 값을 확인한다. 없는 값이면 무시(전체) */
export async function tvScope(db: Db, q: { b?: string | null; w?: string | null }): Promise<TvScope & { label: string | null }> {
  const uuid = /^[0-9a-f-]{36}$/i;
  if (q.w && uuid.test(q.w)) {
    const [x] = await db.select({ id: workplace.id, name: workplace.name, branchId: workplace.branchId }).from(workplace).where(eq(workplace.id, q.w));
    if (x) return { branchId: x.branchId, workplaceId: x.id, label: x.name };
  }
  if (q.b && uuid.test(q.b)) {
    const [x] = await db.select({ id: branch.id, name: branch.name }).from(branch).where(eq(branch.id, q.b));
    if (x) return { branchId: x.id, workplaceId: null, label: x.name };
  }
  return { label: null };
}

export async function tvBoard(db: Db, now = new Date(), scope: TvScope & { label?: string | null } = {}): Promise<TvData> {
  const today = seoulDate(now);
  const dayStart = seoulDateTime(today, "00:00");
  const dayEnd = seoulDateTime(addDays(today, 1), "00:00");
  const byBranch = scope.branchId ? eq(repairOrder.branchId, scope.branchId) : undefined;
  const byPortal = scope.portal ? eq(customer.portal, scope.portal) : undefined;
  const roWhere = and(notInArray(repairOrder.status, ["delivered", "cancelled"]), byBranch, byPortal);
  const [shop, ros, outToday, inTodayRows] = await Promise.all([
    loadShopInfo(db),
    db
      .select({
        id: repairOrder.id,
        status: repairOrder.status,
        inAt: repairOrder.inAt,
        consultationId: repairOrder.consultationId,
        insurance: repairOrder.insurance,
        diagnosedAt: repairOrder.diagnosedAt,
        readyNoticeAt: repairOrder.readyNoticeAt,
        plate: vehicle.plateNo,
        model: vehicle.model,
        kind: customer.kind,
        portal: customer.portal,
      })
      .from(repairOrder)
      .innerJoin(vehicle, eq(vehicle.id, repairOrder.vehicleId))
      .innerJoin(customer, eq(customer.id, repairOrder.customerId))
      .where(roWhere),
    db
      .select({ id: repairOrder.id, at: repairStatement.deliveredAt, plate: vehicle.plateNo, model: vehicle.model, consultationId: repairOrder.consultationId })
      .from(repairStatement)
      .innerJoin(repairOrder, eq(repairOrder.id, repairStatement.repairOrderId))
      .innerJoin(vehicle, eq(vehicle.id, repairOrder.vehicleId))
      .innerJoin(customer, eq(customer.id, repairOrder.customerId))
      .where(and(isNotNull(repairStatement.deliveredAt), gte(repairStatement.deliveredAt, dayStart), lt(repairStatement.deliveredAt, dayEnd), byBranch, byPortal))
      .orderBy(asc(repairStatement.deliveredAt)),
    // 오늘 실제로 들어온 차(지금 상태와 상관없이, 취소 건 빼고)
    db
      .select({ id: repairOrder.id })
      .from(repairOrder)
      .innerJoin(customer, eq(customer.id, repairOrder.customerId))
      .where(and(gte(repairOrder.inAt, dayStart), lt(repairOrder.inAt, dayEnd), ne(repairOrder.status, "cancelled"), byBranch, byPortal)),
  ]);
  // 업체 주문번호(테크베이 주문 → 상담 → 수리 건)
  const csIds = [...new Set([...ros, ...outToday].map((r) => r.consultationId).filter((x): x is string => !!x))];
  const orders = new Map(
    (csIds.length ? await db.select({ cs: portalOrder.consultationId, no: portalOrder.extNo, ext: portalOrder.extId, platform: portalOrder.platform }).from(portalOrder).where(inArray(portalOrder.consultationId, csIds)) : []).map((o) => [
      o.cs!,
      o.no ?? (o.platform === "techbay" ? null : o.ext),
    ]),
  );
  const orderOf = (cs: string | null) => (cs ? (orders.get(cs) ?? null) : null);
  const ids = ros.map((r) => r.id);
  const none = Promise.resolve([] as never[]);
  const [ests, claims, wos, pos, oss, insps] = await Promise.all([
    ids.length ? db.select({ ro: estimate.repairOrderId, status: estimate.status, dueDate: estimate.dueDate }).from(estimate).where(and(inArray(estimate.repairOrderId, ids), ne(estimate.status, "void"))).orderBy(desc(estimate.rev), desc(estimate.createdAt)) : none,
    ids.length ? db.select({ ro: insuranceClaim.repairOrderId, status: insuranceClaim.status }).from(insuranceClaim).where(inArray(insuranceClaim.repairOrderId, ids)) : none,
    ids.length ? db.select({ id: workOrder.id, ro: workOrder.repairOrderId, dueDate: workOrder.dueDate }).from(workOrder).where(inArray(workOrder.repairOrderId, ids)).orderBy(desc(workOrder.createdAt)) : none,
    ids.length
      ? db.select({ ro: purchaseOrder.repairOrderId, dueOn: purchaseOrder.dueOn, replyDueOn: purchaseOrder.replyDueOn }).from(purchaseOrder).where(and(inArray(purchaseOrder.repairOrderId, ids), inArray(purchaseOrder.status, OPEN_PO)))
      : none,
    ids.length ? db.select({ ro: outsourceJob.repairOrderId, status: outsourceJob.status }).from(outsourceJob).where(and(inArray(outsourceJob.repairOrderId, ids), inArray(outsourceJob.status, ["requested", "out"]))) : none,
    ids.length ? db.select({ ro: inspection.repairOrderId, round: inspection.round }).from(inspection).where(inArray(inspection.repairOrderId, ids)) : none,
  ]);
  // 수리 건마다 가장 최근 작업 지시서 하나
  const woOf = new Map<string, { id: string; dueDate: string | null }>();
  for (const w of wos) if (!woOf.has(w.ro)) woOf.set(w.ro, w);
  const woIds = [...woOf.values()].map((w) => w.id);
  const steps = woIds.length ? await db.select({ wo: workStep.workOrderId, seq: workStep.seq, process: workStep.process, startedAt: workStep.startedAt, endedAt: workStep.endedAt, assignee: workStep.assignee, wp: workStep.workplaceId }).from(workStep).where(inArray(workStep.workOrderId, woIds)).orderBy(asc(workStep.seq)) : [];
  const userIds = [...new Set(steps.map((s) => s.assignee).filter((x): x is string => !!x))];
  const users = new Map((userIds.length ? await db.select({ id: appUser.id, name: appUser.name }).from(appUser).where(inArray(appUser.id, userIds)) : []).map((u) => [u.id, u.name]));

  const cars: TvCar[] = ros.map((r) => {
    const est = ests.find((e) => e.ro === r.id) ?? null;
    const wo = woOf.get(r.id) ?? null;
    const mySteps = wo ? steps.filter((s) => s.wo === wo.id).map((s) => ({ process: s.process, label: processLabel(s.process), started: !!s.startedAt, ended: !!s.endedAt, assignee: s.assignee ? (users.get(s.assignee) ?? null) : null })) : [];
    const c = classifyRo({
      status: r.status,
      diagnosed: !!r.diagnosedAt,
      readyNoticed: !!r.readyNoticeAt,
      estimate: est?.status ?? null,
      claim: claims.find((x) => x.ro === r.id)?.status ?? null,
      hasWorkOrder: !!wo,
      steps: mySteps,
      partsPending: pos.filter((p) => p.ro === r.id).map((p) => ({ dueOn: p.replyDueOn ?? p.dueOn })),
      outsource: oss.filter((o) => o.ro === r.id).map((o) => o.status as "requested" | "out"),
      inspectRound: Math.max(0, ...insps.filter((i) => i.ro === r.id).map((i) => i.round)),
    });
    const due = wo?.dueDate ?? est?.dueDate ?? null;
    const tags = tagsOf(r.insurance, r.kind, r.portal);
    if (c.rework) tags.push("재작업");
    return { id: r.id, plate: r.plate, model: r.model ?? "", state: c.state, sub: c.sub, tags, done: c.done, total: c.total, current: c.current, due, dueWord: due ? dayWord(due, today) : "미정", late: lateDays(due, today), inAt: r.inAt.toISOString(), orderNo: orderOf(r.consultationId), ...tbStageOf(c.state, mySteps), stages: mySteps.map((s) => stageOfProcess(s.process)) };
  });
  // 작업장 TV: 그 작업장에 아직 안 끝난 공정이 있는 차만(지금 하는 공정·앞으로 올 공정)
  const inWp = (roId: string) => {
    const wo = woOf.get(roId);
    return !!wo && steps.some((st) => st.wo === wo.id && !st.endedAt && st.wp === scope.workplaceId);
  };
  const board = sortBoard(scope.workplaceId ? cars.filter((c) => inWp(c.id)) : cars);

  // 입고 예정: 오늘~모레 예약 + 아직 수리 건이 안 된 업체 주문(테크베이 등)
  const until = seoulDateTime(addDays(today, 3), "00:00");
  const [reserved, partner] = await Promise.all([
    db
      .select({ id: consultation.id, at: consultation.reservedAt, insurance: consultation.insurance, plate: vehicle.plateNo, model: vehicle.model, kind: customer.kind, portal: customer.portal })
      .from(consultation)
      .innerJoin(customer, eq(customer.id, consultation.customerId))
      .leftJoin(vehicle, eq(vehicle.id, consultation.vehicleId))
      .where(and(eq(consultation.result, "reserved"), gte(consultation.reservedAt, seoulDateTime(today, "00:00")), lt(consultation.reservedAt, until), scope.branchId ? eq(consultation.branchId, scope.branchId) : undefined)),
    db
      .select({ id: consultation.id, at: consultation.reservedAt, req: portalOrder.requestedAt, plate: vehicle.plateNo, platePo: portalOrder.plateNo, model: vehicle.model, portal: portalOrder.platform })
      .from(portalOrder)
      .innerJoin(consultation, eq(consultation.id, portalOrder.consultationId))
      .leftJoin(vehicle, eq(vehicle.id, consultation.vehicleId))
      .where(and(inArray(consultation.result, ["open", "recontact"]), scope.branchId ? eq(consultation.branchId, scope.branchId) : undefined)),
  ]);
  const partnerIds = new Set(partner.map((p) => p.id));
  const incoming: TvIncoming[] = [
    ...reserved.map((r) => {
      const d = seoulDate(r.at!);
      const viaPortal = partnerIds.has(r.id);
      return { key: r.id, sort: r.at!.toISOString(), today: d === today, when: `${dayWord(d, today)} ${hhmm(r.at!)}`, plate: r.plate ?? "차량 미정", model: r.model ?? "", tags: tagsOf(r.insurance, r.kind, r.portal), kind: viaPortal ? ("업체 주문" as const) : ("예약" as const) };
    }),
    ...partner.map((p) => ({
      key: p.id,
      sort: `~${p.req ?? ""}`,
      today: false,
      when: "도착 대기",
      plate: p.plate ?? p.platePo ?? "차량 미정",
      model: p.model ?? "",
      tags: [p.portal === "techbay" ? "테크베이" : "업체"],
      kind: "업체 주문" as const,
    })),
  ].sort((a, b) => a.sort.localeCompare(b.sort));

  // 출고 예정: 지연 · 오늘 · 내일 · 모레, 그리고 오늘 출고한 차
  const lastDue = addDays(today, 2);
  const outgoing: TvOutgoing[] = [
    ...board.filter((c) => c.due && c.due <= lastDue).map((c) => ({ key: c.id, when: c.late ? `${c.late}일 지연` : c.dueWord, sort: `${c.due}|1`, late: c.late, plate: c.plate, model: c.model, state: c.state })),
    ...(scope.workplaceId ? [] : outToday).map((o) => ({ key: `out-${o.id}`, when: `오늘 ${hhmm(o.at!)}`, sort: `${today}|0`, late: 0, plate: o.plate, model: o.model ?? "", state: "out" as const })),
  ].sort((a, b) => b.late - a.late || a.sort.localeCompare(b.sort));

  // 흐름 요약: 공정 단계별 대수(그중 지금 작업 중인 차)
  const stageCount = Object.fromEntries(TB_STAGE_KEYS.map((k) => [k, { n: 0, doing: 0 }])) as Record<TbStage, { n: number; doing: number }>;
  for (const c of board) {
    stageCount[c.stage].n++;
    if (c.doing) stageCount[c.stage].doing++;
  }
  const gone: TvGone[] = (scope.workplaceId ? [] : outToday).map((o) => ({ id: o.id, plate: o.plate, model: o.model ?? "", at: hhmm(o.at!), orderNo: orderOf(o.consultationId) }));

  return {
    shop: shop.name,
    scope: scope.label ?? null,
    today,
    at: now.toISOString(),
    kpi: {
      todayIn: incoming.filter((i) => i.today).length,
      inShop: board.length,
      work: board.filter((c) => c.state === "work").length,
      hold: board.filter((c) => c.state === "hold").length,
      ready: board.filter((c) => c.state === "ready").length,
      late: board.filter((c) => c.late > 0).length,
    },
    flow: { inToday: inTodayRows.length, outToday: gone.length, stages: stageCount },
    gone,
    cars: board,
    incoming,
    outgoing,
  };
}

// ── TV 링크(로그인 없이 읽기 전용)
// 전체 현황판(tv)과 테크베이용 현황판(tv-techbay)은 열쇠가 따로다. 테크베이 쪽에 링크를 건네도 전체 현황판은 못 본다.
export type TvBoardKind = "all" | "techbay";
const KEYS: Record<TvBoardKind, string> = { all: "tv", techbay: "tv-techbay" };
type TvConfig = { tokenEnc: string | null; tokenHash: string | null; tokenAt: string | null };
const EMPTY: TvConfig = { tokenEnc: null, tokenHash: null, tokenAt: null };

async function loadCfg(db: Db, kind: TvBoardKind): Promise<TvConfig> {
  const [row] = await db.select().from(appConfig).where(eq(appConfig.key, KEYS[kind]));
  return { ...EMPTY, ...((row?.data ?? {}) as Partial<TvConfig>) };
}

/** 대표(설정 변경 권한)에게만 지금 링크의 열쇠를 보여 준다 */
export async function tvLinkView(db: Db, actor: { roles: Role[] }, kind: TvBoardKind = "all") {
  const cfg = await loadCfg(db, kind);
  const owner = can(actor, "settings.edit");
  return { token: owner && cfg.tokenEnc ? decrypt(cfg.tokenEnc) : null, made: !!cfg.tokenHash, at: cfg.tokenAt, canEdit: owner };
}

/** TV 링크 열쇠 새로 만들기(예전 링크는 바로 막힘) */
export async function issueTvToken(db: Db, actor: { id: string; roles: Role[] }, now = new Date(), kind: TvBoardKind = "all") {
  if (!can(actor, "settings.edit")) throw new UserError("TV 링크는 대표만 만듭니다");
  const token = randomToken(24);
  const data: TvConfig = { tokenEnc: encrypt(token), tokenHash: sha256(token), tokenAt: now.toISOString() };
  const key = KEYS[kind];
  await db
    .insert(appConfig)
    .values({ key, data, updatedBy: actor.id, updatedAt: now })
    .onConflictDoUpdate({ target: appConfig.key, set: { data, updatedBy: actor.id, updatedAt: now } });
  await writeAudit(db, { actorId: actor.id, action: "tv.token_issue", entityType: "app_config", entityId: key });
  return token;
}

/** TV 링크 끊기(링크로는 더 못 봄. 로그인한 기기는 그대로 볼 수 있음) */
export async function revokeTvToken(db: Db, actor: { id: string; roles: Role[] }, now = new Date(), kind: TvBoardKind = "all") {
  if (!can(actor, "settings.edit")) throw new UserError("TV 링크는 대표만 끊습니다");
  const key = KEYS[kind];
  await db
    .insert(appConfig)
    .values({ key, data: EMPTY, updatedBy: actor.id, updatedAt: now })
    .onConflictDoUpdate({ target: appConfig.key, set: { data: EMPTY, updatedBy: actor.id, updatedAt: now } });
  await writeAudit(db, { actorId: actor.id, action: "tv.token_revoke", entityType: "app_config", entityId: key });
}

/** 열쇠 확인. 테크베이용 현황판은 전체 TV 열쇠로도 열린다(반대는 안 됨) */
export async function tvTokenOk(db: Db, token: string | null | undefined, kind: TvBoardKind = "all") {
  if (!token || token.length < 20) return false;
  const h = sha256(token);
  const kinds: TvBoardKind[] = kind === "techbay" ? ["techbay", "all"] : ["all"];
  for (const k of kinds) {
    const cfg = await loadCfg(db, k);
    if (cfg.tokenHash && cfg.tokenHash === h) return true;
  }
  return false;
}

/** 이 열쇠가 테크베이용 열쇠인가(그 TV는 정비소 밖에 있을 수 있어 출퇴근 장소 기억에 쓰지 않는다) */
export async function isTechbayToken(db: Db, token: string) {
  const cfg = await loadCfg(db, "techbay");
  return !!cfg.tokenHash && cfg.tokenHash === sha256(token);
}
