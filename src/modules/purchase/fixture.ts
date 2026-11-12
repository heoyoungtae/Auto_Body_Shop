// 비품·자산(STD-07 9절, F-07-04): 등록(관리 번호·QR 라벨) → 지급(사용자 수령 확인) → 이동·사용자 변경 → 연 1회(12월) 실물 확인 → 처분
// 정책값 '자산 비품 기준 금액' 이상은 자산 비품으로 구분하고, 처분은 대표가 한다. 저장장치가 있는 전산 비품은 자료 완전 삭제를 확인해야 처분한다(STD-13).
import { and, asc, desc, eq, inArray, ne } from "drizzle-orm";
import type { Db } from "@/db/client";
import { appUser, fixture, fixtureEvent, supplier } from "@/db/schema";
import { can } from "@/modules/auth/permissions";
import type { Role } from "@/modules/auth/roles";
import { writeAudit } from "@/modules/platform/audit";
import { UserError } from "@/modules/platform/errors";
import { notifyRole, notifyUser } from "@/modules/platform/notify";
import { loadPolicy } from "@/modules/platform/policy";
import { seoulDate } from "@/modules/platform/time";
import { CHECK_RESULTS, DISPOSE_METHODS, FX_CATEGORIES, isFxCategory, nextFxNo, type FxStatus } from "./rules";

export class FixtureError extends UserError {}
type Actor = { id: string; roles: Role[] };
const clean = (s: string | null | undefined) => (s ?? "").trim() || null;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

async function fxRow(db: Db, id: string) {
  const [f] = await db.select().from(fixture).where(eq(fixture.id, id));
  if (!f) throw new FixtureError("비품을 찾을 수 없습니다");
  return f;
}
const must = (a: Actor) => {
  if (!can(a, "fixture.manage")) throw new FixtureError("비품 대장은 회계 담당·대표가 관리합니다");
};
async function event(db: Db, fixtureId: string, kind: string, detail: string | null, by: string | null, at: Date) {
  await db.insert(fixtureEvent).values({ fixtureId, kind, detail, by, at });
}

export type FixtureInput = { name: string; category: string; spec: string; purchasedOn: string; priceWon: number; location: string; holderId: string; warrantyUntil: string; supplierId: string; expenseRef: string; note: string; managerId?: string; subManagerId?: string; expenseId?: string };

function check(i: FixtureInput) {
  if (!i.name.trim()) throw new FixtureError("품명을 적어 주세요");
  if (!isFxCategory(i.category)) throw new FixtureError("구분을 골라 주세요");
  if (i.purchasedOn && !DATE.test(i.purchasedOn)) throw new FixtureError("구입일을 확인해 주세요");
  if (i.warrantyUntil && !DATE.test(i.warrantyUntil)) throw new FixtureError("보증 기간 날짜를 확인해 주세요");
  if (!Number.isInteger(i.priceWon) || i.priceWon < 0) throw new FixtureError("구입 가격을 확인해 주세요");
  if (!i.location.trim() && !i.holderId) throw new FixtureError("보관 위치나 사용자 중 하나는 적어 주세요");
  return {
    name: i.name.trim(),
    category: i.category,
    spec: clean(i.spec),
    purchasedOn: i.purchasedOn || null,
    priceWon: i.priceWon,
    location: clean(i.location),
    holderId: i.holderId || null,
    warrantyUntil: i.warrantyUntil || null,
    supplierId: i.supplierId || null,
    expenseRef: clean(i.expenseRef),
    note: clean(i.note),
  };
}

/** 등록(9.2): 관리 번호를 매기고, 기준 금액 이상이면 자산 비품. 사용자를 정하면 그 사람에게 수령 확인을 요청 */
export async function registerFixture(db: Db, actor: Actor, input: FixtureInput, now = new Date()) {
  must(actor);
  const v = check(input);
  const p = await loadPolicy(db, seoulDate(now));
  const nos = await db.select({ no: fixture.no }).from(fixture);
  const no = nextFxNo(nos.map((r) => r.no));
  if (input.subManagerId && input.subManagerId === input.managerId) throw new FixtureError("관리자(정)과 (부)는 다른 사람으로 정해 주세요");
  // 지출 결의에서 불러왔으면 결의와 묶는다. 상각 방법은 금액으로 먼저 정한다(산 날 비용 처리 기준 이하 → 비용, 아니면 정책값)
  const dep = { expenseId: input.expenseId || null, depMethod: v.priceWon <= p["asset.immediate_max"] ? "expense" : p["asset.dep_declining"] ? "db" : "sl", usefulYears: p["asset.fixture_years"], depStartOn: v.purchasedOn };
  const [row] = await db
    .insert(fixture)
    .values({ ...v, ...dep, no, managerId: input.managerId || null, subManagerId: input.subManagerId || null, asset: v.priceWon >= p["asset.register_min"], createdBy: actor.id, createdAt: now, updatedAt: now })
    .returning({ id: fixture.id });
  await event(db, row.id, "register", `${FX_CATEGORIES[v.category as keyof typeof FX_CATEGORIES]} ${v.priceWon.toLocaleString("ko-KR")}원${v.location ? ` · ${v.location}` : ""}`, actor.id, now);
  await writeAudit(db, { actorId: actor.id, action: "fixture.create", entityType: "fixture", entityId: no, after: { name: v.name, price: v.priceWon } });
  if (v.holderId) await notifyUser(db, v.holderId, `비품 지급: ${no} ${v.name} — 받았으면 수령 확인을 눌러 주세요`, `fx-give-${row.id}-${v.holderId}`, `/fixtures/${row.id}`);
  return { id: row.id, no };
}

export async function updateFixture(db: Db, actor: Actor, id: string, input: FixtureInput, now = new Date()) {
  must(actor);
  const f = await fxRow(db, id);
  if (f.status === "disposed") throw new FixtureError("처분한 비품은 고칠 수 없습니다");
  const v = check(input);
  const p = await loadPolicy(db, seoulDate(now));
  const holderChanged = (v.holderId ?? null) !== (f.holderId ?? null);
  await db
    .update(fixture)
    .set({ ...v, asset: v.priceWon >= p["asset.register_min"], receivedAt: holderChanged ? null : f.receivedAt, updatedAt: now })
    .where(eq(fixture.id, id));
  if (holderChanged || v.location !== f.location) await event(db, id, "move", await moveText(db, f, v), actor.id, now);
  if (holderChanged && v.holderId) await notifyUser(db, v.holderId, `비품 지급: ${f.no} ${v.name} — 받았으면 수령 확인을 눌러 주세요`, `fx-give-${id}-${v.holderId}-${now.getTime()}`, `/fixtures/${id}`);
}

async function moveText(db: Db, before: { location: string | null; holderId: string | null }, after: { location: string | null; holderId: string | null }) {
  const ids = [before.holderId, after.holderId].filter((x): x is string => !!x);
  const names = new Map((ids.length ? await db.select({ id: appUser.id, name: appUser.name }).from(appUser).where(inArray(appUser.id, ids)) : []).map((u) => [u.id, u.name]));
  const who = (u: string | null) => (u ? (names.get(u) ?? "?") : "공용");
  const parts: string[] = [];
  if (before.location !== after.location) parts.push(`위치 ${before.location ?? "-"} → ${after.location ?? "-"}`);
  if (before.holderId !== after.holderId) parts.push(`사용자 ${who(before.holderId)} → ${who(after.holderId)}`);
  return parts.join(", ");
}

/** 9.4 이동·사용자 변경: 사용자 본인이나 관리자가 한다. 새 사용자는 수령 확인 */
export async function moveFixture(db: Db, actor: Actor, id: string, input: { location: string; holderId: string }, now = new Date()) {
  const f = await fxRow(db, id);
  if (f.status === "disposed") throw new FixtureError("처분한 비품입니다");
  if (!can(actor, "fixture.manage") && f.holderId !== actor.id) throw new FixtureError("사용자 본인이나 회계 담당이 바꿉니다");
  const after = { location: clean(input.location), holderId: input.holderId || null };
  if (!after.location && !after.holderId) throw new FixtureError("보관 위치나 사용자 중 하나는 적어 주세요");
  if (after.location === f.location && after.holderId === f.holderId) throw new FixtureError("바뀐 것이 없습니다");
  const holderChanged = after.holderId !== f.holderId;
  await db.update(fixture).set({ ...after, receivedAt: holderChanged ? null : f.receivedAt, updatedAt: now }).where(eq(fixture.id, id));
  await event(db, id, "move", await moveText(db, f, after), actor.id, now);
  if (holderChanged && after.holderId && after.holderId !== actor.id) await notifyUser(db, after.holderId, `비품 받음: ${f.no} ${f.name} — 받았으면 수령 확인을 눌러 주세요`, `fx-give-${id}-${after.holderId}-${now.getTime()}`, `/fixtures/${id}`);
  if (holderChanged && after.holderId === actor.id) await confirmReceipt(db, actor, id, now);
}

/** 9.3 지급품 수령 확인(사용자 본인) */
export async function confirmReceipt(db: Db, actor: Actor, id: string, now = new Date()) {
  const f = await fxRow(db, id);
  if (f.holderId !== actor.id) throw new FixtureError("지급받은 사람만 수령을 확인합니다");
  if (f.receivedAt) return;
  await db.update(fixture).set({ receivedAt: now, updatedAt: now }).where(eq(fixture.id, id));
  await event(db, id, "receive", null, actor.id, now);
}

/** 9.3 라벨(관리 번호·QR) 부착 기록 */
export async function markLabeled(db: Db, actor: Actor, id: string, now = new Date()) {
  must(actor);
  const f = await fxRow(db, id);
  await db.update(fixture).set({ labeledAt: now, updatedAt: now }).where(eq(fixture.id, id));
  if (!f.labeledAt) await event(db, id, "label", null, actor.id, now);
}

/** 9.5 실물 확인(연 1회 12월, 그 밖에 분실·파손 신고). 분실·파손은 경위 필수, 대표에게 보고 */
export async function checkFixture(db: Db, actor: Actor, id: string, result: string, note: string, now = new Date()) {
  const f = await fxRow(db, id);
  if (f.status === "disposed") throw new FixtureError("처분한 비품입니다");
  const report = result !== "ok";
  if (!can(actor, "fixture.manage") && !(report && f.holderId === actor.id)) throw new FixtureError("실물 확인은 회계 담당이 합니다(분실·파손은 사용자도 신고)");
  if (!(result in CHECK_RESULTS) && result !== "found") throw new FixtureError("결과를 골라 주세요");
  if (report && result !== "found" && !note.trim()) throw new FixtureError("언제·어디서·어떻게 그렇게 됐는지 경위를 적어 주세요");
  const status: FxStatus = result === "lost" ? "lost" : result === "broken" ? "broken" : "in_use";
  await db.update(fixture).set({ status, updatedAt: now }).where(eq(fixture.id, id));
  await event(db, id, result === "ok" ? "check" : result, clean(note), actor.id, now);
  await writeAudit(db, { actorId: actor.id, action: `fixture.${result}`, entityType: "fixture", entityId: f.no, after: { note: clean(note) } });
  if (result === "lost" || result === "broken")
    await notifyRole(db, "owner", `비품 ${result === "lost" ? "분실" : "파손"}: ${f.no} ${f.name}${f.asset ? "(자산 비품)" : ""} — ${note.trim()}`, `fx-${result}-${id}-${now.getTime()}`, `/fixtures/${id}`);
}

/** 9.6 처분: 자산 비품은 대표만. 전산 비품은 자료 완전 삭제 확인 필수 */
export async function disposeFixture(db: Db, actor: Actor, id: string, input: { method: string; note: string; dataWiped: boolean }, now = new Date()) {
  must(actor);
  const f = await fxRow(db, id);
  if (f.status === "disposed") throw new FixtureError("이미 처분했습니다");
  if (f.asset && !actor.roles.includes("owner")) throw new FixtureError("자산 비품 처분은 대표가 합니다");
  if (!(input.method in DISPOSE_METHODS)) throw new FixtureError("처분 방법을 골라 주세요");
  if (!input.note.trim()) throw new FixtureError("처분 근거(불요품 처분 결재 번호나 이유)를 적어 주세요");
  if (f.category === "it" && !input.dataWiped) throw new FixtureError("저장장치의 자료를 완전히 지웠는지 확인해야 처분할 수 있습니다(STD-13)");
  const today = seoulDate(now);
  await db
    .update(fixture)
    .set({ status: "disposed", disposedOn: today, disposeMethod: input.method, disposeNote: input.note.trim(), dataWiped: f.category === "it" ? true : null, holderId: null, updatedAt: now })
    .where(eq(fixture.id, id));
  await event(db, id, "dispose", `${DISPOSE_METHODS[input.method as keyof typeof DISPOSE_METHODS]} — ${input.note.trim()}`, actor.id, now);
  await writeAudit(db, { actorId: actor.id, action: "fixture.dispose", entityType: "fixture", entityId: f.no, after: { method: input.method, note: input.note.trim() } });
}

export type FixtureFilter = "active" | "asset" | "mine" | "problem" | "disposed" | "all";

export async function listFixtures(db: Db, actor: Actor, filter: FixtureFilter = "active", holder?: string) {
  const rows = await db
    .select({ f: fixture, holderName: appUser.name })
    .from(fixture)
    .leftJoin(appUser, eq(appUser.id, fixture.holderId))
    .orderBy(asc(fixture.no));
  return rows.filter(({ f }) => {
    if (holder && f.holderId !== holder) return false;
    if (filter === "all") return true;
    if (filter === "disposed") return f.status === "disposed";
    if (f.status === "disposed") return false;
    if (filter === "asset") return f.asset;
    if (filter === "mine") return f.holderId === actor.id;
    if (filter === "problem") return f.status === "lost" || f.status === "broken" || (f.holderId && !f.receivedAt) || !f.labeledAt;
    return true;
  });
}

export async function getFixture(db: Db, id: string) {
  const f = await fxRow(db, id);
  const events = await db.select({ e: fixtureEvent, by: appUser.name }).from(fixtureEvent).leftJoin(appUser, eq(appUser.id, fixtureEvent.by)).where(eq(fixtureEvent.fixtureId, id)).orderBy(desc(fixtureEvent.at));
  const [holder] = f.holderId ? await db.select({ id: appUser.id, name: appUser.name }).from(appUser).where(eq(appUser.id, f.holderId)) : [];
  const [sup] = f.supplierId ? await db.select({ id: supplier.id, name: supplier.name }).from(supplier).where(eq(supplier.id, f.supplierId)) : [];
  const year = Number(seoulDate().slice(0, 4));
  const checkedThisYear = events.some(({ e }) => ["check", "lost", "broken"].includes(e.kind) && seoulDate(e.at).startsWith(String(year)));
  return { f, events, holder: holder ?? null, supplier: sup ?? null, checkedThisYear };
}

/** 퇴직 처리 등에서 쓸 사람별 지급품 */
export async function fixturesOf(db: Db, userId: string) {
  return db.select().from(fixture).where(and(eq(fixture.holderId, userId), ne(fixture.status, "disposed"))).orderBy(fixture.no);
}

/** 내 할 일: 수령 확인(본인), 라벨 부착·12월 실물 확인(회계 담당) */
export async function fixtureTodos(db: Db, actor: Actor, today: string) {
  const out: { key: string; when: "late" | "today" | "soon"; what: string; detail?: string; href: string; action: string }[] = [];
  for (const f of await db.select().from(fixture).where(and(eq(fixture.holderId, actor.id), ne(fixture.status, "disposed"))))
    if (!f.receivedAt) out.push({ key: `fx-rcv-${f.id}`, when: "today", what: `비품 수령 확인: ${f.no} ${f.name}`, href: `/fixtures/${f.id}`, action: "수령 확인" });
  if (can(actor, "fixture.manage") && !actor.roles.includes("owner")) {
    const all = (await db.select().from(fixture)).filter((f) => f.status !== "disposed");
    const nolabel = all.filter((f) => !f.labeledAt && f.status !== "pending");
    if (nolabel.length) out.push({ key: "fx-label", when: "soon", what: `라벨 안 붙인 비품 ${nolabel.length}개`, detail: nolabel.slice(0, 4).map((f) => `${f.no} ${f.name}`).join(", "), href: "/fixtures?f=problem", action: "라벨 인쇄" });
    if (today.slice(5, 7) === "12" && all.length) {
      const year = today.slice(0, 4);
      const ids = all.map((f) => f.id);
      const done = new Set((await db.select({ id: fixtureEvent.fixtureId, at: fixtureEvent.at, kind: fixtureEvent.kind }).from(fixtureEvent).where(inArray(fixtureEvent.fixtureId, ids))).filter((e) => ["check", "lost", "broken"].includes(e.kind) && seoulDate(e.at).startsWith(year)).map((e) => e.id));
      const left = all.filter((f) => !done.has(f.id));
      if (left.length) out.push({ key: `fx-check-${year}`, when: today >= `${year}-12-20` ? "today" : "soon", what: `비품 연 1회 실물 확인 ${left.length}개 남음`, href: "/fixtures/check", action: "확인하기" });
    }
  }
  return out;
}

