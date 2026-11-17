// 업체 쪽 주문 앱(테크베이 등) — 대표 설명(2026-11-17): "업체 고객의 앱에 접속해 주문 확인, 진행 상태 등록 등을 한다".
// - 테크베이: 이 앱이 인증번호로 로그인해 '입고완료' 주문을 읽어 오고, 고른 주문을 업체 고객 앞 상담(CS)으로 만든다(차량·요청 항목을 불러옴).
// - 그 밖의 앱: 그쪽 주문번호를 상담·수리 건에 손으로 이어 둔다.
// - 진행 상태(입고·작업 시작·수리 완료·출고): 수리 건이 그 단계에 오면 '그쪽 앱에 등록할 일'이 생기고, 사람이 그쪽 앱에 등록한 뒤 '등록함'을 누른다.
import { and, desc, eq, inArray, isNotNull } from "drizzle-orm";
import type { Db } from "@/db/client";
import { appConfig, consultation, customer, portalOrder, repairOrder, vehicle } from "@/db/schema";
import { decrypt, encrypt } from "@/modules/auth/crypto";
import { can } from "@/modules/auth/permissions";
import type { Role } from "@/modules/auth/roles";
import { createConsultation, moveVehicle } from "@/modules/customer/service";
import { normalizePlate } from "@/modules/customer/rules";
import { isPortalStep, PORTAL_STEPS, PORTALS, reachedSteps, type PortalStep } from "@/modules/money/credit-rules";
import { writeAudit } from "@/modules/platform/audit";
import { UserError } from "@/modules/platform/errors";
import { createTechbay, fmtPhone, phoneDigits, TECHBAY_DEFAULT_URL, TechbayError, type TechbayOrder, type TechbayPending, type TechbaySession } from "./techbay";

export class PortalError extends UserError {}
type Actor = { id: string; roles: Role[] };
const KEY = "techbay";

type Conf = { url?: string; phone?: string; sessionEnc?: string | null; pending?: TechbayPending | null };

async function loadConf(db: Db): Promise<Conf> {
  const [c] = await db.select().from(appConfig).where(eq(appConfig.key, KEY));
  return (c?.data ?? {}) as Conf;
}
async function saveConf(db: Db, patch: Partial<Conf>, by: string | null) {
  const data = { ...(await loadConf(db)), ...patch };
  await db
    .insert(appConfig)
    .values({ key: KEY, data, updatedBy: by })
    .onConflictDoUpdate({ target: appConfig.key, set: { data, updatedBy: by, updatedAt: new Date() } });
}

const must = (a: Actor) => {
  if (!can(a, "portal.order")) throw new PortalError("업체 주문 앱은 대표·공장장·상담원이 씁니다");
};

/** 테크베이 연결 부품. 세션 쿠키는 암호화해 둔다 */
export async function techbayClient(db: Db, actorId: string | null, f?: typeof fetch) {
  const conf = await loadConf(db);
  return createTechbay({
    fetch: f,
    url: conf.url || TECHBAY_DEFAULT_URL,
    getSession: async () => {
      const c = await loadConf(db);
      if (!c.sessionEnc) return null;
      try {
        return JSON.parse(decrypt(c.sessionEnc)) as TechbaySession;
      } catch {
        return null;
      }
    },
    putSession: async (s) => saveConf(db, { sessionEnc: s ? encrypt(JSON.stringify(s)) : null }, actorId),
    getPending: async () => (await loadConf(db)).pending ?? null,
    putPending: async (p) => saveConf(db, { pending: p }, actorId),
  });
}

const wrap = async <T>(fn: () => Promise<T>) => {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof TechbayError) throw new PortalError(e.message);
    throw e;
  }
};

export async function techbayStatus(db: Db) {
  const conf = await loadConf(db);
  const st = await (await techbayClient(db, null)).status();
  return { ...st, savedPhone: conf.phone ?? "" };
}

export async function techbaySettings(db: Db, actor: Actor, input: { url: string; phone: string }) {
  must(actor);
  const u = input.url.trim() || TECHBAY_DEFAULT_URL;
  let url: URL;
  try {
    url = new URL(u);
  } catch {
    throw new PortalError(`웹 주소를 정확히 적어 주세요(예: ${TECHBAY_DEFAULT_URL})`);
  }
  if (url.protocol !== "https:") throw new PortalError("웹 주소는 https:// 로 시작해야 합니다");
  const p = phoneDigits(input.phone);
  if (p && !/^01\d{8,9}$/.test(p)) throw new PortalError("휴대폰 번호를 정확히 적어 주세요");
  await saveConf(db, { url: url.origin, phone: p ? fmtPhone(p) : "" }, actor.id);
  await writeAudit(db, { actorId: actor.id, action: "techbay.settings", entityType: "app_config", entityId: KEY, after: { url: url.origin } });
}

export async function techbayRequestCode(db: Db, actor: Actor, phone: string, f?: typeof fetch) {
  must(actor);
  await wrap(async () => (await techbayClient(db, actor.id, f)).requestCode(phone));
  const p = phoneDigits(phone);
  if (!(await loadConf(db)).phone) await saveConf(db, { phone: fmtPhone(p) }, actor.id);
}

export async function techbayLogin(db: Db, actor: Actor, code: string, f?: typeof fetch, now = new Date()) {
  must(actor);
  await wrap(async () => (await techbayClient(db, actor.id, f)).login(code, now.toISOString()));
  await writeAudit(db, { actorId: actor.id, action: "techbay.login", entityType: "app_config", entityId: KEY });
}

export async function techbayLogout(db: Db, actor: Actor) {
  must(actor);
  await (await techbayClient(db, actor.id)).logout();
  await writeAudit(db, { actorId: actor.id, action: "techbay.logout", entityType: "app_config", entityId: KEY });
}

async function importedIds(db: Db) {
  return new Set((await db.select({ id: portalOrder.extId }).from(portalOrder).where(eq(portalOrder.platform, "techbay"))).map((r) => r.id));
}

/** 테크베이 '입고완료' 주문 가운데 아직 안 불러온 것 */
export async function techbayOrders(db: Db, actor: Actor, f?: typeof fetch) {
  must(actor);
  const done = await importedIds(db);
  return wrap(async () => (await techbayClient(db, actor.id, f)).orders((h) => done.has(h)));
}

const itemsText = (o: TechbayOrder) => o.items.map((i) => (i.type ? `[${i.type}] ${i.content}` : i.content)).join("\n");

/** 고른 테크베이 주문을 업체 고객 앞 상담(CS)으로 만든다. 차량·요청 항목·메모를 불러오고 그쪽 주문과 잇는다 */
export async function importTechbayOrders(db: Db, actor: Actor, customerId: string, hashIds: string[], f?: typeof fetch, now = new Date()) {
  must(actor);
  if (!can(actor, "consult.write")) throw new PortalError("상담을 쓸 수 있는 사람만 주문을 불러옵니다");
  const [c] = await db.select().from(customer).where(eq(customer.id, customerId));
  if (!c || c.kind !== "business") throw new PortalError("주문을 받을 업체 고객을 골라 주세요(고객·차량에서 '업체'로 등록한 고객)");
  const want = new Set(hashIds.filter(Boolean));
  if (!want.size) throw new PortalError("불러올 주문을 하나 이상 골라 주세요");
  const done = await importedIds(db);
  const r = await wrap(async () => (await techbayClient(db, actor.id, f)).orders((h) => done.has(h) || !want.has(h)));
  if (!r.connected) throw new PortalError("테크베이 연결이 끝났습니다. 인증번호로 다시 로그인해 주세요");
  const made: { consultId: string; docNo: string; plateNo: string; moved: boolean }[] = [];
  for (const o of r.rows) {
    if (!o.plateNo) continue;
    const plate = normalizePlate(o.plateNo);
    // 이미 다른 고객의 차로 있으면(예: 전 차주) 이 업체로 옮긴다. 지난 상담·수리 기록은 전 고객에게 남는다
    const [same] = await db.select().from(vehicle).where(eq(vehicle.plateNo, plate));
    let moved = false;
    if (same && same.customerId !== customerId) {
      await moveVehicle(db, actor.id, same.id, customerId);
      moved = true;
    }
    const text = itemsText(o);
    const row = await createConsultation(
      db,
      actor.id,
      {
        customerId,
        vehicleId: same?.id,
        newVehicle: same ? undefined : { plateNo: plate, vin: o.vin || undefined, maker: o.make || undefined, model: o.model || undefined, year: o.year, mileage: o.mileage || null, colorCode: undefined },
        mileage: null,
        channel: "partner",
        damageTypes: [],
        damageParts: (text.split("\n")[0] || "테크베이 주문").slice(0, 200),
        methods: [],
        insurance: "self",
        needs: [`테크베이 주문 ${o.requestedAt ? `(요청 ${o.requestedAt.slice(0, 10)})` : ""}`.trim(), text, o.memo && `메모: ${o.memo}`, o.color && `외장: ${o.color}`].filter(Boolean).join("\n"),
        result: "open",
      },
      now,
    );
    await db.insert(portalOrder).values({
      customerId,
      platform: "techbay",
      extId: o.hashId,
      extNo: o.hashId.slice(0, 10),
      requestedAt: o.requestedAt || null,
      plateNo: plate,
      payload: o as unknown as Record<string, unknown>,
      consultationId: row.id,
      createdBy: actor.id,
    });
    await writeAudit(db, { actorId: actor.id, action: "portal.import", entityType: "consultation", entityId: row.docNo, after: { platform: "techbay", ext: o.hashId, plate } });
    made.push({ consultId: row.id, docNo: row.docNo, plateNo: plate, moved });
  }
  return made;
}

/** 그 밖의 업체 앱: 상담에 그쪽 주문번호를 손으로 잇는다 */
export async function linkPortalOrder(db: Db, actor: Actor, consultationId: string, extNo: string) {
  must(actor);
  const [cs] = await db.select({ cs: consultation, c: customer }).from(consultation).innerJoin(customer, eq(customer.id, consultation.customerId)).where(eq(consultation.id, consultationId));
  if (!cs) throw new PortalError("없는 상담입니다");
  if (cs.c.kind !== "business" || !cs.c.portal) throw new PortalError("주문 앱을 쓰는 업체 고객의 상담만 잇습니다(고객 화면에서 '주문 앱'을 먼저 정해 주세요)");
  const no = extNo.trim();
  if (!no || no.length > 60) throw new PortalError("그쪽 앱의 주문번호를 적어 주세요");
  const [exist] = await db.select().from(portalOrder).where(eq(portalOrder.consultationId, consultationId));
  if (exist) {
    await db.update(portalOrder).set({ extNo: no, ...(exist.platform === "techbay" ? {} : { extId: no }) }).where(eq(portalOrder.id, exist.id));
  } else {
    const [dup] = await db.select({ id: portalOrder.id }).from(portalOrder).where(and(eq(portalOrder.platform, cs.c.portal), eq(portalOrder.extId, no)));
    if (dup) throw new PortalError("같은 주문번호가 이미 다른 상담에 이어져 있습니다");
    const [v] = cs.cs.vehicleId ? await db.select({ p: vehicle.plateNo }).from(vehicle).where(eq(vehicle.id, cs.cs.vehicleId)) : [];
    await db.insert(portalOrder).values({ customerId: cs.c.id, platform: cs.c.portal, extId: no, extNo: no, plateNo: v?.p ?? null, consultationId, createdBy: actor.id });
  }
  await writeAudit(db, { actorId: actor.id, action: "portal.link", entityType: "consultation", entityId: cs.cs.docNo, after: { ext: no } });
}

/** 그쪽 앱에 진행 상태를 등록했다고 남긴다 */
export async function markPortalStep(db: Db, actor: Actor, orderId: string, step: string, note: string, now = new Date()) {
  must(actor);
  if (!isPortalStep(step)) throw new PortalError("등록한 진행 상태를 골라 주세요");
  const v = await portalOrderView(db, { orderId });
  if (!v) throw new PortalError("없는 주문입니다");
  if (v.posted.some((p) => p.step === step)) throw new PortalError(`'${PORTAL_STEPS[step]}'은(는) 이미 등록했다고 적혀 있습니다`);
  if (!v.reached.includes(step)) throw new PortalError(`수리 건이 아직 '${PORTAL_STEPS[step]}' 단계가 아닙니다`);
  const posted = [...v.posted, { step, at: now.toISOString(), by: actor.id, ...(note.trim() ? { note: note.trim() } : {}) }];
  await db.update(portalOrder).set({ posted }).where(eq(portalOrder.id, orderId));
  await writeAudit(db, { actorId: actor.id, action: "portal.step", entityType: "portal_order", entityId: v.o.extNo ?? v.o.extId, after: { step } });
}

/** 상담 또는 주문 하나의 연결 상태: 수리 건 진행으로 등록할 단계, 이미 등록한 단계 */
export async function portalOrderView(db: Db, by: { consultationId?: string; orderId?: string }) {
  const cond = by.orderId ? eq(portalOrder.id, by.orderId) : by.consultationId ? eq(portalOrder.consultationId, by.consultationId) : null;
  if (!cond) return null;
  const [r] = await db.select({ o: portalOrder, c: customer }).from(portalOrder).innerJoin(customer, eq(customer.id, portalOrder.customerId)).where(cond);
  if (!r) return null;
  const [ro] = r.o.consultationId ? await db.select({ id: repairOrder.id, docNo: repairOrder.docNo, status: repairOrder.status }).from(repairOrder).where(eq(repairOrder.consultationId, r.o.consultationId)).orderBy(desc(repairOrder.createdAt)).limit(1) : [];
  const reached = reachedSteps(ro?.status ?? null);
  const posted = r.o.posted ?? [];
  return {
    o: r.o,
    customerName: r.c.name,
    platformLabel: PORTALS[r.o.platform as keyof typeof PORTALS] ?? r.o.platform,
    url: r.c.portalUrl || (r.o.platform === "techbay" ? TECHBAY_DEFAULT_URL : null),
    note: r.c.portalNote,
    ro: ro ?? null,
    reached,
    posted,
    todo: reached.filter((s) => !posted.some((p) => p.step === s)),
  };
}

/** 주문 앱 목록(최근): 불러온·이은 주문과 남은 등록 */
export async function portalOrders(db: Db, limit = 100) {
  const rows = await db.select({ id: portalOrder.id }).from(portalOrder).orderBy(desc(portalOrder.createdAt)).limit(limit);
  const out = [];
  for (const r of rows) {
    const v = await portalOrderView(db, { orderId: r.id });
    if (v) out.push(v);
  }
  return out;
}

/** 내 할 일: 그쪽 앱에 등록할 진행 상태 */
export async function portalTodos(db: Db, actor: Actor) {
  type T = { key: string; when: "late" | "today" | "soon"; what: string; detail?: string; href: string; action: string };
  if (!can(actor, "portal.order")) return [] as T[];
  const rows = await db.select({ id: portalOrder.id }).from(portalOrder).where(isNotNull(portalOrder.consultationId)).orderBy(desc(portalOrder.createdAt)).limit(300);
  const out: T[] = [];
  for (const r of rows) {
    const v = await portalOrderView(db, { orderId: r.id });
    if (!v?.ro || !v.todo.length) continue;
    const last: PortalStep = v.todo[v.todo.length - 1];
    out.push({
      key: `portal-${v.o.id}-${last}`,
      when: "today",
      what: `${v.platformLabel.split("(")[0]}에 진행 상태 등록: ${v.ro.docNo} ${v.o.plateNo ?? ""} '${v.todo.map((s) => PORTAL_STEPS[s]).join("·")}'`,
      detail: `${v.customerName} 주문 ${v.o.extNo ?? v.o.extId} · 그쪽 앱에서 등록하고 '등록함'을 누르세요`,
      href: `/repairs/${v.ro.id}#portal`,
      action: "등록하고 체크",
    });
  }
  return out;
}

/** 업체 고객 가운데 주문 앱을 쓰는 곳(불러오기 화면의 고객 고르기) */
export async function portalCustomers(db: Db) {
  return db.select({ id: customer.id, name: customer.name, portal: customer.portal }).from(customer).where(and(eq(customer.kind, "business"), isNotNull(customer.portal))).orderBy(customer.name);
}

export async function consultIdsWithOrders(db: Db, ids: string[]) {
  if (!ids.length) return new Map<string, string>();
  const rows = await db.select({ c: portalOrder.consultationId, no: portalOrder.extNo }).from(portalOrder).where(inArray(portalOrder.consultationId, ids));
  return new Map(rows.map((r) => [r.c!, r.no ?? ""]));
}
