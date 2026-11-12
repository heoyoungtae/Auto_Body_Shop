// 비품·설비 공통 처리(대표 지시 2026-11-12)
// - 지출 결의 때 대장 등록(입고 대기) → 들어옴 확인(설비는 시운전)으로 사용 시작
// - 관리자 정/부: 정이 휴가면 알림은 부에게
// - 정비·수리 이력(첨부·자본적 지출), 감가상각, 소유 구분·사용계약(사용료 결의·만료 알림)
import { and, desc, eq, gte, inArray, isNull, ne } from "drizzle-orm";
import type { Db } from "@/db/client";
import { approvalDoc, appUser, assetRepair, equipment, expense, fixture, fixtureEvent, tool, toolEvent, type AssetContract } from "@/db/schema";
import { can } from "@/modules/auth/permissions";
import type { Role } from "@/modules/auth/roles";
import { EQ_KINDS, isEqKind, nextEqNo, nextToolNo, TOOL_KEEP } from "@/modules/equipment/rules";
import { writeAudit } from "@/modules/platform/audit";
import { UserError } from "@/modules/platform/errors";
import { notifyRole, notifyUser } from "@/modules/platform/notify";
import { loadPolicy } from "@/modules/platform/policy";
import { DOC_TYPES, MAX_DOC_BYTES, sniffDoc, storeFile } from "@/modules/platform/storage";
import { seoulDate } from "@/modules/platform/time";
import { isFxCategory, nextFxNo } from "@/modules/purchase/rules";
import { LEAVE_FORM } from "@/modules/staff/attendance";
import { daysLeft, depNow, depOfMonth, isDepMethod, isOwnership, OWNERSHIP, type DepInput } from "./rules";

export class AssetError extends UserError {}
type Actor = { id: string; roles: Role[] };
export type AssetKind = "fixture" | "equipment";
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const clean = (s: string | null | undefined) => (s ?? "").trim() || null;
const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;

export const canManage = (a: Actor, kind: AssetKind) => can(a, kind === "fixture" ? "fixture.manage" : "equip.manage");

/** 비품·설비를 같은 모양으로 */
export async function assetView(db: Db, kind: AssetKind, id: string) {
  if (kind === "fixture") {
    const [f] = await db.select().from(fixture).where(eq(fixture.id, id));
    if (!f) throw new AssetError("비품을 찾을 수 없습니다");
    return { kind, id: f.id, no: f.no, name: f.name, status: f.status, cost: f.priceWon, boughtOn: f.purchasedOn, managerId: f.managerId, subManagerId: f.subManagerId, ownership: f.ownership, contract: f.contract, depMethod: f.depMethod, usefulYears: f.usefulYears, depStartOn: f.depStartOn, disposedOn: f.disposedOn, disposeWon: f.disposeWon, expenseId: f.expenseId, feeBilledYm: f.feeBilledYm, createdBy: f.createdBy };
  }
  const [e] = await db.select().from(equipment).where(eq(equipment.id, id));
  if (!e) throw new AssetError("설비를 찾을 수 없습니다");
  return { kind, id: e.id, no: e.no, name: e.name, status: e.status, cost: e.price ?? 0, boughtOn: e.boughtOn, managerId: e.ownerId, subManagerId: e.subManagerId, ownership: e.ownership, contract: e.contract, depMethod: e.depMethod, usefulYears: e.usefulYears, depStartOn: e.depStartOn, disposedOn: e.disposedOn, disposeWon: e.disposeWon, expenseId: e.expenseId, feeBilledYm: e.feeBilledYm, createdBy: e.createdBy };
}
export type AssetView = Awaited<ReturnType<typeof assetView>>;
const href = (kind: AssetKind, id: string) => (kind === "fixture" ? `/fixtures/${id}` : `/equipment/${id}`);

// ── 관리자 정/부 ──

/** 그날 승인된 휴가(근태 신청서)로 자리에 없는가 */
export async function awayOn(db: Db, userId: string, day: string) {
  const rows = await db
    .select({ data: approvalDoc.data })
    .from(approvalDoc)
    .where(and(eq(approvalDoc.formCode, LEAVE_FORM), eq(approvalDoc.drafterId, userId), inArray(approvalDoc.status, ["confirmed", "checked"]), isNull(approvalDoc.cancelsId)));
  return rows.some((r) => {
    const d = r.data as { fromDate?: string; toDate?: string };
    return !!d.fromDate && !!d.toDate && d.fromDate <= day && day <= d.toDate;
  });
}

/** 알림 받을 관리자: 정이 있고 자리에 있으면 정, 아니면 부. 둘 다 없으면 null */
export async function managerToNotify(db: Db, a: { managerId: string | null; subManagerId: string | null }, day = seoulDate()) {
  if (a.managerId && !(await awayOn(db, a.managerId, day))) return a.managerId;
  return a.subManagerId ?? a.managerId ?? null;
}

export async function notifyManager(db: Db, kind: AssetKind, a: { id: string; managerId: string | null; subManagerId: string | null }, title: string, key: string) {
  const to = await managerToNotify(db, a);
  if (to) await notifyUser(db, to, title, key, href(kind, a.id));
  else await notifyRole(db, kind === "fixture" ? "accounting" : "plant_manager", title, key, href(kind, a.id));
}

export async function setManagers(db: Db, actor: Actor, kind: AssetKind, id: string, managerId: string, subManagerId: string, now = new Date()) {
  if (!canManage(actor, kind)) throw new AssetError(kind === "fixture" ? "비품 관리자는 회계 담당·대표가 정합니다" : "설비 관리자는 공장장·대표가 정합니다");
  const a = await assetView(db, kind, id);
  if (subManagerId && subManagerId === managerId) throw new AssetError("관리자(정)과 (부)는 다른 사람으로 정해 주세요");
  if (kind === "equipment" && !managerId) {
    const [e] = await db.select({ grade: equipment.grade }).from(equipment).where(eq(equipment.id, id));
    if (e?.grade === "A") throw new AssetError("A등급 설비는 관리자(정)을 꼭 정합니다");
  }
  const set = { subManagerId: subManagerId || null, updatedAt: now };
  if (kind === "fixture") await db.update(fixture).set({ ...set, managerId: managerId || null }).where(eq(fixture.id, id));
  else await db.update(equipment).set({ ...set, ownerId: managerId || null }).where(eq(equipment.id, id));
  await writeAudit(db, { actorId: actor.id, action: `${kind}.managers`, entityType: kind, entityId: a.no, after: { managerId, subManagerId } });
  for (const u of [managerId, subManagerId].filter((x) => x && x !== a.managerId && x !== a.subManagerId))
    await notifyUser(db, u, `${a.no} ${a.name}의 관리자(${u === managerId ? "정" : "부"})가 되었습니다. 라벨을 다시 붙여 주세요`, `asset-mgr-${id}-${u}-${now.getTime()}`, href(kind, id));
  // 관리자가 바뀌면 라벨을 다시 붙여야 한다
  if (kind === "equipment" && (managerId !== (a.managerId ?? "") || subManagerId !== (a.subManagerId ?? ""))) await db.update(equipment).set({ labeledAt: null }).where(eq(equipment.id, id));
  if (kind === "fixture" && (managerId !== (a.managerId ?? "") || subManagerId !== (a.subManagerId ?? ""))) await db.update(fixture).set({ labeledAt: null }).where(eq(fixture.id, id));
}

/** 설비 라벨(번호·이름·관리자 정/부·점검 주기·QR)을 붙였다 */
export async function markEquipmentLabeled(db: Db, actor: Actor, ids: string[], now = new Date()) {
  if (!canManage(actor, "equipment")) throw new AssetError("설비 라벨은 공장장·대표가 관리합니다");
  if (!ids.length) throw new AssetError("붙인 라벨을 골라 주세요");
  const rows = await db.select({ id: equipment.id, no: equipment.no }).from(equipment).where(inArray(equipment.id, ids));
  await db.update(equipment).set({ labeledAt: now }).where(inArray(equipment.id, rows.map((r) => r.id)));
  for (const r of rows) await writeAudit(db, { actorId: actor.id, action: "equipment.labeled", entityType: "equipment", entityId: r.no });
  return rows.length;
}

// ── 지출 결의에서 대장 등록 ──

export type AssetPlan = {
  /** tool 치공구(STD-08 8.7 대장, TL- 번호). 감가상각 없이 입고 대기 → 들어옴 확인만 */
  kind: AssetKind | "tool";
  name: string;
  qty: number;
  /** 한 개 공급가 */
  unitWon: number;
  /** 비품 구분, 설비 종류, 치공구는 보관(board 공용·personal 개인) */
  cat: string;
  location?: string;
  holderId?: string;
  managerId?: string;
  subManagerId?: string;
  spec?: string;
};

export function checkPlans(plans: AssetPlan[], supplyWon: number) {
  const rows = plans.filter((p) => p.name.trim());
  for (const [i, p] of rows.entries()) {
    const at = `대장 등록 ${i + 1}번째 줄(${p.name.trim()})`;
    if (!Number.isInteger(p.qty) || p.qty < 1 || p.qty > 50) throw new AssetError(`${at}: 수량은 1~50입니다`);
    if (!Number.isInteger(p.unitWon) || p.unitWon < 0) throw new AssetError(`${at}: 한 개 값을 확인해 주세요`);
    if (p.kind === "fixture" && !isFxCategory(p.cat)) throw new AssetError(`${at}: 비품 구분을 골라 주세요`);
    if (p.kind === "equipment" && !isEqKind(p.cat)) throw new AssetError(`${at}: 설비 종류를 골라 주세요`);
    if (p.kind === "tool" && !(p.cat in TOOL_KEEP)) throw new AssetError(`${at}: 치공구 보관(공용·개인)을 골라 주세요`);
    if (p.kind === "equipment" && p.qty > 1) throw new AssetError(`${at}: 설비는 한 줄에 한 대씩 적습니다(점검표가 설비마다 따로)`);
  }
  const total = rows.reduce((t, p) => t + p.qty * p.unitWon, 0);
  if (rows.length && total > supplyWon + 10) throw new AssetError(`대장 등록 금액 합계 ${won(total)}이 결의 공급가 ${won(supplyWon)}보다 큽니다`);
  return rows;
}

/** 결의서를 올릴 때 함께: 비품·설비를 '입고 대기'로 대장에 올린다(번호 자동). 결의 번호·업체·날짜는 결의서 값을 쓴다 */
export async function registerFromExpense(db: Db, actor: Actor, e: { id: string; docNo: string; supplierId: string | null; payeeName: string; evidenceOn: string | null }, plans: AssetPlan[], now = new Date()) {
  const p = await loadPolicy(db, seoulDate(now));
  const method = p["asset.dep_declining"] ? "db" : "sl";
  const on = e.evidenceOn || seoulDate(now);
  const made: { kind: AssetKind | "tool"; id: string; no: string }[] = [];
  for (const plan of plans) {
    // 산 날 비용 처리 가능 금액 이하이면 즉시 비용, 아니면 기본 상각 방법(정책값)
    const depFor = (cost: number) => (cost <= p["asset.immediate_max"] ? "expense" : method) as string;
    if (plan.kind === "fixture") {
      for (let i = 0; i < plan.qty; i++) {
        const nos = await db.select({ no: fixture.no }).from(fixture);
        const no = nextFxNo(nos.map((r) => r.no));
        const [row] = await db
          .insert(fixture)
          .values({ no, name: plan.name.trim(), category: plan.cat, spec: clean(plan.spec), purchasedOn: on, priceWon: plan.unitWon, asset: plan.unitWon >= p["asset.register_min"], location: clean(plan.location), holderId: plan.holderId || null, managerId: plan.managerId || null, subManagerId: plan.subManagerId || null, supplierId: e.supplierId, expenseRef: e.docNo, expenseId: e.id, status: "pending", depMethod: depFor(plan.unitWon), usefulYears: p["asset.fixture_years"], createdBy: actor.id, createdAt: now, updatedAt: now })
          .returning({ id: fixture.id });
        await db.insert(fixtureEvent).values({ fixtureId: row.id, kind: "register", detail: `지출 결의 ${e.docNo}에서 등록(입고 대기) ${won(plan.unitWon)}`, by: actor.id, at: now });
        made.push({ kind: "fixture", id: row.id, no });
      }
    } else if (plan.kind === "tool") {
      // 치공구: 한 개마다 TL- 번호. 보관 위치·쓰는 사람은 들어옴 확인 때 채워도 된다
      for (let i = 0; i < plan.qty; i++) {
        const no = nextToolNo((await db.select({ no: tool.no }).from(tool)).map((r) => r.no));
        const [row] = await db
          .insert(tool)
          .values({ no, name: plan.name.trim(), spec: clean(plan.spec), purchasedOn: on, location: clean(plan.location), keep: plan.cat, holderId: plan.cat === "personal" ? plan.holderId || null : null, managerId: plan.managerId || null, status: "pending", expenseId: e.id, priceWon: plan.unitWon, note: `지출 결의 ${e.docNo}(${e.payeeName})에서 등록`, createdBy: actor.id, createdAt: now, updatedAt: now })
          .returning({ id: tool.id });
        await db.insert(toolEvent).values({ toolId: row.id, kind: "register", detail: `지출 결의 ${e.docNo}에서 등록(입고 대기) ${won(plan.unitWon)}`, by: actor.id, at: now });
        made.push({ kind: "tool", id: row.id, no });
      }
    } else {
      const k = EQ_KINDS[plan.cat as keyof typeof EQ_KINDS];
      const nos = await db.select({ no: equipment.no }).from(equipment);
      const no = nextEqNo(nos.map((r) => r.no));
      const [row] = await db
        .insert(equipment)
        .values({ no, name: plan.name.trim(), kind: plan.cat, grade: k.grade, model: clean(plan.spec), boughtOn: on, price: plan.unitWon, zone: clean(plan.location), ownerId: plan.managerId || null, subManagerId: plan.subManagerId || null, dailyItems: [...k.daily], monthlyItems: [], checkMonthly: false, processes: [...k.processes], legalKind: k.legal || null, status: "pending", expenseId: e.id, depMethod: depFor(plan.unitWon), usefulYears: p["asset.equipment_years"], note: `지출 결의 ${e.docNo}(${e.payeeName})에서 등록`, createdBy: actor.id, createdAt: now, updatedAt: now })
        .returning({ id: equipment.id });
      made.push({ kind: "equipment", id: row.id, no });
    }
  }
  if (made.length) await writeAudit(db, { actorId: actor.id, action: "asset.from_expense", entityType: "expense", entityId: e.docNo, after: { assets: made.map((m) => m.no) } });
  return made;
}

/** 결의를 취소하면 아직 들어오지 않은(입고 대기) 대장 줄도 지운다. 이미 들어온 것은 남기고 결의 연결만 끊는다 */
export async function dropForExpense(db: Db, expenseId: string) {
  const fx = await db.select({ id: fixture.id }).from(fixture).where(and(eq(fixture.expenseId, expenseId), eq(fixture.status, "pending")));
  if (fx.length) {
    await db.delete(fixtureEvent).where(inArray(fixtureEvent.fixtureId, fx.map((r) => r.id)));
    await db.delete(fixture).where(inArray(fixture.id, fx.map((r) => r.id)));
  }
  await db.delete(equipment).where(and(eq(equipment.expenseId, expenseId), eq(equipment.status, "pending")));
  const tl = await db.select({ id: tool.id }).from(tool).where(and(eq(tool.expenseId, expenseId), eq(tool.status, "pending")));
  if (tl.length) {
    await db.delete(toolEvent).where(inArray(toolEvent.toolId, tl.map((r) => r.id)));
    await db.delete(tool).where(inArray(tool.id, tl.map((r) => r.id)));
  }
  await db.update(fixture).set({ expenseId: null }).where(eq(fixture.expenseId, expenseId));
  await db.update(equipment).set({ expenseId: null }).where(eq(equipment.expenseId, expenseId));
  await db.update(tool).set({ expenseId: null }).where(eq(tool.expenseId, expenseId));
  return fx.length;
}

/** 결의에 묶인 대장 줄 */
export async function assetsOfExpense(db: Db, expenseId: string) {
  const fx = await db.select({ id: fixture.id, no: fixture.no, name: fixture.name, status: fixture.status }).from(fixture).where(eq(fixture.expenseId, expenseId));
  const eq_ = await db.select({ id: equipment.id, no: equipment.no, name: equipment.name, status: equipment.status }).from(equipment).where(eq(equipment.expenseId, expenseId));
  const tl = await db.select({ id: tool.id, no: tool.no, name: tool.name, status: tool.status }).from(tool).where(eq(tool.expenseId, expenseId));
  return [...fx.map((r) => ({ ...r, kind: "fixture" as const })), ...eq_.map((r) => ({ ...r, kind: "equipment" as const })), ...tl.map((r) => ({ ...r, kind: "tool" as const }))];
}

/** 들어옴 확인: 비품은 받은 날, 설비는 시운전 확인일. 이날부터 감가상각 */
export async function confirmArrival(db: Db, actor: Actor, kind: AssetKind, id: string, on: string, now = new Date()) {
  const a = await assetView(db, kind, id);
  if (a.status !== "pending") throw new AssetError("입고 대기 상태가 아닙니다");
  if (!canManage(actor, kind) && actor.id !== a.managerId && actor.id !== a.subManagerId) throw new AssetError("관리자나 담당이 확인합니다");
  if (!DATE.test(on) || on > seoulDate(now)) throw new AssetError("날짜는 오늘이나 그 전입니다");
  if (kind === "fixture") {
    await db.update(fixture).set({ status: "in_use", depStartOn: a.depStartOn ?? on, updatedAt: now }).where(eq(fixture.id, id));
    await db.insert(fixtureEvent).values({ fixtureId: id, kind: "arrive", detail: `들어옴 ${on}`, by: actor.id, at: now });
  } else {
    await db.update(equipment).set({ status: "in_use", trialOn: on, depStartOn: a.depStartOn ?? on, updatedAt: now }).where(eq(equipment.id, id));
  }
  await writeAudit(db, { actorId: actor.id, action: `${kind}.arrive`, entityType: kind, entityId: a.no, after: { on } });
}

// ── 소유 구분·감가상각 ──

export type FinanceInput = { ownership: string; depMethod: string; usefulYears: number | null; depStartOn: string; contract: AssetContract | null };

export async function saveFinance(db: Db, actor: Actor, kind: AssetKind, id: string, input: FinanceInput, now = new Date()) {
  if (!can(actor, "fixture.manage") && !can(actor, "equip.manage")) throw new AssetError("회계 담당·공장장·대표가 정합니다");
  const a = await assetView(db, kind, id);
  if (!isOwnership(input.ownership)) throw new AssetError("소유 구분을 골라 주세요");
  if (!isDepMethod(input.depMethod)) throw new AssetError("상각 방법을 골라 주세요");
  const own = input.ownership === "own";
  // 빌린 것·남의 물건은 상각하지 않는다(금융리스는 세무사 확인 뒤 자사 소유로 바꿔 상각)
  const depMethod = own ? input.depMethod : "none";
  if (own && (depMethod === "sl" || depMethod === "db")) {
    if (!input.usefulYears || input.usefulYears < 2 || input.usefulYears > 20) throw new AssetError("내용연수는 2~20년입니다");
    if (!DATE.test(input.depStartOn)) throw new AssetError("상각 시작일(사용 시작일)을 적어 주세요");
  }
  let contract: AssetContract | null = null;
  if (!own) {
    const c = input.contract;
    if (!c || !c.party.trim()) throw new AssetError(`${OWNERSHIP[input.ownership]}이면 빌려준 곳(업체·사람)을 적어 주세요`);
    if (input.ownership !== "customer" && !DATE.test(c.start)) throw new AssetError("계약 시작일을 적어 주세요");
    if (c.end && (!DATE.test(c.end) || (c.start && c.end < c.start))) throw new AssetError("계약 끝나는 날을 확인해 주세요");
    if (input.ownership === "lease" && !(c.feeWon > 0)) throw new AssetError("유상 임차면 월 사용료를 적어 주세요");
    if (c.payDay != null && (c.payDay < 1 || c.payDay > 31)) throw new AssetError("사용료 내는 날은 1~31일입니다");
    contract = { ...a.contract, party: c.party.trim(), phone: clean(c.phone) ?? undefined, start: c.start, end: c.end || undefined, feeWon: input.ownership === "lease" ? c.feeWon : 0, payDay: c.payDay ?? undefined, repairBy: c.repairBy === "us" ? "us" : "owner", terms: clean(c.terms) ?? undefined, file: c.file ?? a.contract?.file };
  }
  const set = { ownership: input.ownership, depMethod, usefulYears: own ? input.usefulYears : null, depStartOn: own ? input.depStartOn || null : null, contract, updatedAt: now };
  if (kind === "fixture") await db.update(fixture).set({ ...set, asset: own && a.cost >= (await loadPolicy(db))["asset.register_min"] }).where(eq(fixture.id, id));
  else await db.update(equipment).set(set).where(eq(equipment.id, id));
  if (kind === "fixture" && input.ownership !== a.ownership) await db.insert(fixtureEvent).values({ fixtureId: id, kind: "contract", detail: `소유 구분 ${OWNERSHIP[input.ownership]}${contract ? ` · ${contract.party}` : ""}`, by: actor.id, at: now });
  await writeAudit(db, { actorId: actor.id, action: `${kind}.finance`, entityType: kind, entityId: a.no, after: { ownership: input.ownership, depMethod, years: input.usefulYears } });
}

export async function attachContractFile(db: Db, actor: Actor, kind: AssetKind, id: string, file: { name: string; bytes: Uint8Array }) {
  if (!can(actor, "fixture.manage") && !can(actor, "equip.manage")) throw new AssetError("회계 담당·공장장·대표가 올립니다");
  const a = await assetView(db, kind, id);
  if (!a.contract) throw new AssetError("먼저 소유 구분과 계약 내용을 저장해 주세요");
  if (file.bytes.length > MAX_DOC_BYTES) throw new AssetError("파일이 8MB를 넘습니다");
  const t = sniffDoc(file.bytes);
  if (!t) throw new AssetError("PDF나 사진만 올립니다");
  const path = await storeFile(`asset/${id}`, file.bytes, DOC_TYPES[t]);
  const contract = { ...a.contract, file: path };
  if (kind === "fixture") await db.update(fixture).set({ contract }).where(eq(fixture.id, id));
  else await db.update(equipment).set({ contract }).where(eq(equipment.id, id));
}

/** 반납(빌린 장비): 상태 사진·자료 삭제 확인은 메모로. 대장에서는 처분과 같이 빠진다 */
export async function returnAsset(db: Db, actor: Actor, kind: AssetKind, id: string, on: string, note: string, now = new Date()) {
  if (!can(actor, "fixture.manage") && !can(actor, "equip.manage")) throw new AssetError("회계 담당·공장장·대표가 처리합니다");
  const a = await assetView(db, kind, id);
  if (a.ownership === "own") throw new AssetError("자사 소유는 반납이 아니라 처분합니다");
  if (!DATE.test(on)) throw new AssetError("반납일을 적어 주세요");
  if (!note.trim()) throw new AssetError("반납 때 상태와 저장 자료 삭제 여부를 적어 주세요");
  const contract = { ...(a.contract as AssetContract), returnedOn: on, returnNote: note.trim() };
  if (kind === "fixture") {
    await db.update(fixture).set({ contract, status: "disposed", disposedOn: on, disposeMethod: null, disposeNote: `반납: ${note.trim()}`, updatedAt: now }).where(eq(fixture.id, id));
    await db.insert(fixtureEvent).values({ fixtureId: id, kind: "return", detail: `반납 ${on}: ${note.trim()}`, by: actor.id, at: now });
  } else await db.update(equipment).set({ contract, status: "disposed", disposedOn: on, stopReason: `반납: ${note.trim()}`, updatedAt: now }).where(eq(equipment.id, id));
  await writeAudit(db, { actorId: actor.id, action: `${kind}.return`, entityType: kind, entityId: a.no, after: { on } });
}

const depInput = async (db: Db, a: AssetView): Promise<DepInput> => {
  const adds = await db.select({ on: assetRepair.on, won: assetRepair.costWon }).from(assetRepair).where(and(eq(assetRepair.assetKind, a.kind), eq(assetRepair.assetId, a.id), eq(assetRepair.capital, true)));
  return { cost: a.cost, method: a.depMethod, years: a.usefulYears, startOn: a.depStartOn, adds, disposedOn: a.disposedOn };
};

/** 감가상각 대장(그 해): 자사 소유 비품·설비 */
export async function depreciationRegister(db: Db, year: number) {
  const fx = await db.select({ id: fixture.id }).from(fixture).where(and(eq(fixture.ownership, "own"), ne(fixture.depMethod, "none")));
  const eqs = await db.select({ id: equipment.id }).from(equipment).where(and(eq(equipment.ownership, "own"), ne(equipment.depMethod, "none")));
  const out = [];
  for (const [kind, ids] of [["fixture", fx], ["equipment", eqs]] as const)
    for (const { id } of ids) {
      const a = await assetView(db, kind, id);
      if (a.status === "pending") continue;
      const d = depNow(await depInput(db, a), year);
      out.push({ a, ...d });
    }
  return out.sort((x, y) => x.a.no.localeCompare(y.a.no));
}

/** 월 마감용: 그 달 감가상각비 합계 */
export async function depreciationOfMonth(db: Db, ym: string) {
  const year = Number(ym.slice(0, 4));
  let total = 0;
  let count = 0;
  for (const r of await depreciationRegister(db, year)) {
    const w = r.a.depMethod === "expense" ? (r.a.depStartOn?.startsWith(ym) ? r.cost : 0) : depOfMonth(await depInput(db, r.a), ym);
    if (w > 0) {
      total += w;
      count++;
    }
  }
  return { won: total, count };
}

export async function assetDep(db: Db, a: AssetView, year = Number(seoulDate().slice(0, 4))) {
  return depNow(await depInput(db, a), year);
}

// ── 정비·수리 이력 ──

export type RepairInput = { on: string; what: string; vendor: string; costWon: number; capital: boolean; files: { name: string; bytes: Uint8Array }[]; expenseId?: string | null; failureId?: string | null; filesSaved?: { path: string; name: string; at: string; by: string }[] };

export async function addRepair(db: Db, actor: Actor, kind: AssetKind, id: string, input: RepairInput, now = new Date()) {
  const a = await assetView(db, kind, id);
  if (!canManage(actor, kind) && !can(actor, "expense.draft") && actor.id !== a.managerId && actor.id !== a.subManagerId) throw new AssetError("관리자·담당이 기록합니다");
  if (!DATE.test(input.on) || input.on > seoulDate(now)) throw new AssetError("수리한 날은 오늘이나 그 전입니다");
  if (!input.what.trim()) throw new AssetError("무엇을 고쳤는지 적어 주세요");
  if (!Number.isInteger(input.costWon) || input.costWon < 0) throw new AssetError("비용을 확인해 주세요");
  if (input.capital && a.ownership !== "own") throw new AssetError("빌린 장비의 수리는 자본적 지출로 잡지 않습니다");
  const files = [...(input.filesSaved ?? [])];
  for (const f of input.files) {
    if (f.bytes.length > MAX_DOC_BYTES) throw new AssetError(`${f.name}: 8MB가 넘습니다`);
    const t = sniffDoc(f.bytes);
    if (!t) throw new AssetError(`${f.name}: PDF나 사진만 붙입니다`);
    files.push({ path: await storeFile(`asset/${id}`, f.bytes, DOC_TYPES[t]), name: f.name.slice(0, 120), at: now.toISOString(), by: actor.id });
  }
  const [row] = await db
    .insert(assetRepair)
    .values({ assetKind: kind, assetId: id, on: input.on, what: input.what.trim(), vendor: clean(input.vendor), costWon: input.costWon, capital: input.capital, files, expenseId: input.expenseId ?? null, failureId: input.failureId ?? null, by: actor.id, createdAt: now })
    .returning({ id: assetRepair.id });
  if (kind === "fixture") await db.insert(fixtureEvent).values({ fixtureId: id, kind: "repair", detail: `${input.what.trim()}${input.costWon ? ` ${won(input.costWon)}` : ""}${input.capital ? " (자본적 지출)" : ""}`, by: actor.id, at: now });
  await writeAudit(db, { actorId: actor.id, action: `${kind}.repair`, entityType: kind, entityId: a.no, after: { what: input.what.trim(), cost: input.costWon, capital: input.capital } });
  return row.id;
}

export async function listRepairs(db: Db, kind: AssetKind, id: string) {
  return db.select({ r: assetRepair, by: appUser.name, docNo: expense.docNo }).from(assetRepair).leftJoin(appUser, eq(appUser.id, assetRepair.by)).leftJoin(expense, eq(expense.id, assetRepair.expenseId)).where(and(eq(assetRepair.assetKind, kind), eq(assetRepair.assetId, id))).orderBy(desc(assetRepair.on));
}

/** 지출 결의(설비 수리·유지)·고장 기록에서 고를 대상 */
export async function assetOptions(db: Db) {
  const fx = await db.select({ id: fixture.id, no: fixture.no, name: fixture.name }).from(fixture).where(ne(fixture.status, "disposed")).orderBy(fixture.no);
  const eqs = await db.select({ id: equipment.id, no: equipment.no, name: equipment.name }).from(equipment).where(ne(equipment.status, "disposed")).orderBy(equipment.no);
  return [...eqs.map((e) => ({ value: `equipment:${e.id}`, label: `${e.no} ${e.name}` })), ...fx.map((f) => ({ value: `fixture:${f.id}`, label: `${f.no} ${f.name}` }))];
}

// ── 지출결의에서 불러오기(대장에 안 올린 설비·공구 결의) ──

export async function unlinkedAssetExpenses(db: Db) {
  // 최근 90일 결의만(오래된 것은 할 일로 계속 띄우지 않는다)
  const since = new Date(Date.now() - 90 * 86_400_000);
  const rows = await db.select().from(expense).where(and(eq(expense.category, "equipment"), isNull(expense.cancelledAt), gte(expense.createdAt, since))).orderBy(desc(expense.createdAt)).limit(100);
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const linked = new Set([
    ...(await db.select({ x: fixture.expenseId }).from(fixture).where(inArray(fixture.expenseId, ids))).map((r) => r.x),
    ...(await db.select({ x: equipment.expenseId }).from(equipment).where(inArray(equipment.expenseId, ids))).map((r) => r.x),
    ...(await db.select({ x: tool.expenseId }).from(tool).where(inArray(tool.expenseId, ids))).map((r) => r.x),
  ]);
  return rows.filter((r) => !linked.has(r.id));
}

/** 불러오기: 그 결의를 고르면 등록 칸을 채울 값 */
export async function expensePrefill(db: Db, expenseId: string) {
  const [e] = await db.select().from(expense).where(eq(expense.id, expenseId));
  if (!e) return null;
  return { expenseId: e.id, docNo: e.docNo, supplierId: e.supplierId, payeeName: e.payeeName, purpose: e.purpose, supplyWon: e.supplyWon, on: e.evidenceOn ?? seoulDate(e.createdAt) };
}

/** 등록 화면에서 불러온 결의를 연결(대장에서 바로 등록한 경우) */
export async function linkExpense(db: Db, kind: AssetKind, id: string, expenseId: string) {
  if (kind === "fixture") await db.update(fixture).set({ expenseId }).where(eq(fixture.id, id));
  else await db.update(equipment).set({ expenseId }).where(eq(equipment.id, id));
}

// ── 사용계약: 사용료 결의·만료 알림 ──

const ymOf = (d: string) => d.slice(0, 7);
const nextYm = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
};

/** 사용료를 결의해야 할 달(계약 시작 달부터 이번 달까지, 낸 달 다음부터) */
export function feeMonthsDue(a: { ownership: string; contract: AssetContract | null; feeBilledYm: string | null; status: string }, today: string) {
  const c = a.contract;
  if (a.ownership !== "lease" || !c || !(c.feeWon > 0) || c.returnedOn || a.status === "disposed") return [];
  const out: string[] = [];
  let m = a.feeBilledYm ? nextYm(a.feeBilledYm) : ymOf(c.start);
  const last = c.end && ymOf(c.end) < ymOf(today) ? ymOf(c.end) : ymOf(today);
  while (m <= last && out.length < 24) {
    out.push(m);
    m = nextYm(m);
  }
  return out;
}

/** 사용료 결의 쓰기 화면에 채울 값(?lease=kind:id) */
export async function leaseFeePrefill(db: Db, kind: AssetKind, id: string, today = seoulDate()) {
  const a = await assetView(db, kind, id);
  const months = feeMonthsDue(a, today);
  if (!a.contract || !months.length) return null;
  const supply = a.contract.feeWon * months.length;
  return { a, months, supply, purpose: `${a.no} ${a.name} 사용료 ${months.length > 1 ? `${months[0]}~${months[months.length - 1]}` : months[0]}(${a.contract.party})`, payee: a.contract.party };
}

/** 사용료 결의를 올리면 낸 달을 적는다 */
export async function markFeeBilled(db: Db, kind: AssetKind, id: string, ym: string) {
  if (kind === "fixture") await db.update(fixture).set({ feeBilledYm: ym }).where(eq(fixture.id, id));
  else await db.update(equipment).set({ feeBilledYm: ym }).where(eq(equipment.id, id));
}

type Todo = { key: string; when: "late" | "today" | "soon"; what: string; detail?: string; href: string; action: string };

/** 내 할 일: 입고 대기 확인, 사용료 결의, 계약 만료, 라벨 붙이기, 대장에 안 올린 설비·공구 결의 */
export async function assetTodos(db: Db, actor: Actor, today: string): Promise<Todo[]> {
  const out: Todo[] = [];
  const p = await loadPolicy(db, today);
  const fx = await db.select().from(fixture).where(ne(fixture.status, "disposed"));
  const eqs = await db.select().from(equipment).where(ne(equipment.status, "disposed"));
  const all = [...fx.map((f) => ({ kind: "fixture" as const, id: f.id, no: f.no, name: f.name, status: f.status, managerId: f.managerId, subManagerId: f.subManagerId, ownership: f.ownership, contract: f.contract, feeBilledYm: f.feeBilledYm, labeled: !!f.labeledAt })), ...eqs.map((e) => ({ kind: "equipment" as const, id: e.id, no: e.no, name: e.name, status: e.status, managerId: e.ownerId, subManagerId: e.subManagerId, ownership: e.ownership, contract: e.contract, feeBilledYm: e.feeBilledYm, labeled: !!e.labeledAt }))];
  for (const a of all) {
    const mine = a.managerId === actor.id || a.subManagerId === actor.id || canManage(actor, a.kind);
    if (a.status === "pending" && mine) out.push({ key: `asset-arrive-${a.id}`, when: "today", what: `${a.no} ${a.name} 들어옴 확인`, detail: a.kind === "equipment" ? "설치·시운전을 마치면 확인합니다" : "물건을 받으면 확인합니다", href: href(a.kind, a.id), action: "확인" });
    if (a.kind === "equipment" && a.status !== "pending" && !a.labeled && mine) out.push({ key: `asset-label-${a.id}`, when: "soon", what: `${a.no} ${a.name} 라벨 붙이기`, href: `/equipment/labels`, action: "인쇄" });
    if (can(actor, "expense.draft")) {
      const due = feeMonthsDue(a, today);
      const payDay = a.contract?.payDay ?? 1;
      const thisMonthDue = due.length && (due.length > 1 || Number(today.slice(8, 10)) >= Math.max(1, payDay - 3));
      if (thisMonthDue) out.push({ key: `asset-fee-${a.id}-${due[due.length - 1]}`, when: due.length > 1 ? "late" : "today", what: `${a.no} ${a.name} 사용료 결의 ${due.length}개월`, detail: `${a.contract!.party} 월 ${won(a.contract!.feeWon)}`, href: `/money/expenses/new?lease=${a.kind}:${a.id}`, action: "결의" });
    }
    const left = daysLeft(a.contract?.end, today);
    if (a.ownership !== "own" && !a.contract?.returnedOn && left != null && left <= p["asset.contract_alert_days"] && mine)
      out.push({ key: `asset-contract-${a.id}`, when: left < 0 ? "late" : left <= 14 ? "today" : "soon", what: `${a.no} ${a.name} 사용계약 ${left < 0 ? "끝남" : `${left}일 남음`}`, detail: `${a.contract?.party} · ${a.contract?.end}까지 — 연장하거나 반납`, href: href(a.kind, a.id), action: "처리" });
  }
  if (can(actor, "fixture.manage") || can(actor, "equip.manage"))
    for (const e of await unlinkedAssetExpenses(db))
      out.push({ key: `asset-unlinked-${e.id}`, when: "soon", what: `${e.docNo} 설비·공구 결의를 대장에 올리기`, detail: `${e.payeeName} ${won(e.supplyWon)} · ${e.purpose}`, href: `/fixtures/new?exp=${e.id}`, action: "등록" });
  return out;
}

export const assetHref = href;
