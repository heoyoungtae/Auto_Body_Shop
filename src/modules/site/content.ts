// 홈페이지 2단계: 자주 묻는 질문 · 공지사항 · 작업 사례. 손님은 읽기만 하고, 상담을 쓸 수 있는 직원(consult.write)이 앱에서 쓴다.
// - 자주 묻는 질문: 처음 글 23개(표준서·정책값으로 만듦)는 홈페이지를 처음 열 때 저절로 공개로 들어간다(starters.ts). 직원이 고치고 내린다. 상담 답변에서 단추로 초안을 만든다.
// - 공지사항: 게시 기간 안에서만 보이고 끝나면 저절로 내려간다. 맨 위 고정·첫 화면 띠·내 차 수첩 알림(푸시)을 고른다.
// - 작업 사례: 출고한 수리 건 가운데 손님이 '사진 홍보 사용'에 동의한 건만. 번호판을 가려 새로 만든 사진만 올리고, 동의를 거두면 저절로 빠진다.
import { and, asc, desc, eq, inArray, isNotNull, isNull, lte, or, gte, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { carbookPush, consultation, customer, inspection, repairOrder, repairStatement, roPhoto, siteCase, siteFaq, siteNotice, vehicle, type CasePhoto } from "@/db/schema";
import type { Role } from "@/modules/auth/roles";
import { can } from "@/modules/auth/permissions";
import { sendPush } from "@/modules/carbook/push";
import { consentState } from "@/modules/customer/service";
import { writeAudit } from "@/modules/platform/audit";
import { IMAGE_TYPES, MAX_IMAGE_BYTES, removeStored, sniffImage, storeFile } from "@/modules/platform/storage";
import { seoulDate } from "@/modules/platform/time";
import { FAQ_CATEGORIES } from "./faq-starters";
import { ensureFaqStarters, faqStarterRows } from "./starters";
import { maskPersonal, SERVICES } from "./rules";
import { SiteError } from "./service";

type Actor = { id: string; roles: readonly Role[] };
const cut = (s: unknown, n: number) => String(s ?? "").trim().slice(0, n);
const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);
function mustWrite(actor: Actor) {
  if (!can(actor, "consult.write")) throw new SiteError("홈페이지 글은 상담을 쓸 수 있는 사람(상담원·공장장·대표)이 씁니다");
}

/** 서울 시각(시) — 광고 알림은 오후 9시~오전 8시에 보내지 않는다 */
const seoulHour = (now: Date) => Number(new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Seoul", hour: "2-digit", hourCycle: "h23" }).format(now));
export const quietHours = (now: Date) => {
  const h = seoulHour(now);
  return h >= 21 || h < 8;
};

// ── 자주 묻는 질문 ──
export type FaqInput = { id?: string; category: string; question: string; answer: string; sort: number; published: boolean };

export async function listFaqs(db: Db) {
  return db.select().from(siteFaq).orderBy(asc(siteFaq.category), asc(siteFaq.sort), asc(siteFaq.createdAt));
}

/** 공개한 질문만. q 가 있으면 질문·답에서 찾는다(띄어쓰기 무시) */
export async function publicFaqs(db: Db, q = "", category = "") {
  await ensureFaqStarters(db);
  const rows = await db.select({ id: siteFaq.id, category: siteFaq.category, question: siteFaq.question, answer: siteFaq.answer, sort: siteFaq.sort }).from(siteFaq).where(eq(siteFaq.published, true)).orderBy(asc(siteFaq.sort), asc(siteFaq.createdAt));
  const order = (c: string) => {
    const i = (FAQ_CATEGORIES as readonly string[]).indexOf(c);
    return i < 0 ? 99 : i;
  };
  const words = q.replace(/\s+/g, " ").trim().toLowerCase().split(" ").filter(Boolean).slice(0, 5);
  const squash = (s: string) => s.replace(/\s+/g, "").toLowerCase();
  return rows
    .filter((r) => !category || r.category === category)
    .filter((r) => words.every((w) => squash(`${r.question} ${r.answer}`).includes(squash(w))))
    .sort((a, b) => order(a.category) - order(b.category) || a.sort - b.sort);
}

export async function saveFaq(db: Db, actor: Actor, input: FaqInput, now = new Date()) {
  mustWrite(actor);
  const category = cut(input.category, 20);
  const question = cut(input.question, 200);
  const answer = cut(input.answer, 3000);
  if (!category) throw new SiteError("분야를 골라 주세요");
  if (question.length < 5) throw new SiteError("질문을 적어 주세요");
  if (answer.length < 5) throw new SiteError("답을 적어 주세요");
  if (input.published && maskPersonal(`${question}\n${answer}`) !== `${question}\n${answer}`) throw new SiteError("공개할 글에 휴대폰 번호나 차량번호가 있습니다. 지우고 공개해 주세요");
  const sort = Number.isFinite(input.sort) ? Math.max(0, Math.min(999, Math.round(input.sort))) : 100;
  const values = { category, question, answer, sort, published: input.published, updatedBy: actor.id, updatedAt: now };
  let id = input.id;
  if (id) {
    const [r] = await db.update(siteFaq).set(values).where(eq(siteFaq.id, id)).returning({ id: siteFaq.id });
    if (!r) throw new SiteError("없는 질문입니다");
  } else {
    [{ id }] = await db.insert(siteFaq).values({ ...values, createdAt: now }).returning({ id: siteFaq.id });
  }
  await writeAudit(db, { actorId: actor.id, action: "site.faq", entityType: "site_faq", entityId: id!, after: { category, question, published: input.published } });
  return id!;
}

export async function deleteFaq(db: Db, actor: Actor, id: string) {
  mustWrite(actor);
  const [r] = await db.delete(siteFaq).where(eq(siteFaq.id, id)).returning({ q: siteFaq.question });
  if (r) await writeAudit(db, { actorId: actor.id, action: "site.faq_delete", entityType: "site_faq", entityId: id, before: { question: r.q } });
}

/** 처음 글 23개 가운데 빠진 것 넣기(이미 넣은 것은 건너뜀). 지금 정책값(회신 기한·보증 기간 등)을 넣고 바로 공개한다 */
export async function loadFaqStarters(db: Db, actor: Actor, now = new Date()) {
  mustWrite(actor);
  const have = new Set((await db.select({ k: siteFaq.starterKey }).from(siteFaq).where(isNotNull(siteFaq.starterKey))).map((r) => r.k));
  const rows = await faqStarterRows(db, have, true, actor.id, now);
  if (rows.length) await db.insert(siteFaq).values(rows);
  await writeAudit(db, { actorId: actor.id, action: "site.faq_starters", entityType: "site_faq", entityId: "starters", after: { added: rows.length } });
  return rows.length;
}

/** 상담 답변으로 질문 초안 만들기: 손님 요청을 질문으로, 비밀 답변을 답으로. 이름·번호는 가리고 '공개 안 함'으로 둔다 */
export async function faqFromConsult(db: Db, actor: Actor, consultId: string, now = new Date()) {
  mustWrite(actor);
  const [c] = await db.select({ id: consultation.id, docNo: consultation.docNo, parts: consultation.damageParts, needs: consultation.needs, reply: consultation.webReply, types: consultation.damageTypes, customerId: consultation.customerId }).from(consultation).where(eq(consultation.id, consultId));
  if (!c) throw new SiteError("없는 상담입니다");
  if (!c.reply) throw new SiteError("손님에게 보낸 답이 있어야 질문 초안을 만들 수 있습니다");
  const [dup] = await db.select({ id: siteFaq.id }).from(siteFaq).where(eq(siteFaq.consultationId, c.id));
  if (dup) return dup.id;
  const [cu] = await db.select({ name: customer.name }).from(customer).where(eq(customer.id, c.customerId));
  const hide = (s: string) => {
    let t = maskPersonal(s);
    if (cu?.name && cu.name.length >= 2) t = t.split(cu.name).join("고객");
    return t.replace(/CS-\d{4}-\d+/g, "").trim();
  };
  const first = hide((c.parts ?? "").split("\n")[0] ?? "").slice(0, 80);
  const question = first ? `${first} — 어떻게 고치고 비용은 얼마나 드나요?` : `${(c.types as string[])[0] ?? "손상"} 수리는 어떻게 하나요?`;
  const category = (c.types as string[]).some((t) => t === "찌그러짐" || t === "긁힘") ? "수리·작업" : "견적·비용";
  const [r] = await db
    .insert(siteFaq)
    .values({ category, question: question.slice(0, 200), answer: hide(c.reply).slice(0, 3000), sort: 500, published: false, origin: "consult", consultationId: c.id, updatedBy: actor.id, createdAt: now, updatedAt: now })
    .returning({ id: siteFaq.id });
  await writeAudit(db, { actorId: actor.id, action: "site.faq_from_consult", entityType: "site_faq", entityId: r.id, after: { from: c.docNo } });
  return r.id;
}

// ── 공지사항 ──
export type NoticeInput = { id?: string; title: string; body: string; pinned: boolean; banner: boolean; ad: boolean; published: boolean; startsOn: string; endsOn: string; notifyCarbook: boolean };

export async function listNotices(db: Db) {
  return db.select().from(siteNotice).orderBy(desc(siteNotice.pinned), desc(siteNotice.startsOn), desc(siteNotice.createdAt));
}

const liveNotice = (today: string) => and(eq(siteNotice.published, true), lte(siteNotice.startsOn, today), or(isNull(siteNotice.endsOn), gte(siteNotice.endsOn, today)));

/** 지금 게시 중인 공지(고정 먼저, 그다음 새 글) */
export async function publicNotices(db: Db, today = seoulDate()) {
  return db
    .select({ id: siteNotice.id, title: siteNotice.title, body: siteNotice.body, pinned: siteNotice.pinned, ad: siteNotice.ad, startsOn: siteNotice.startsOn })
    .from(siteNotice)
    .where(liveNotice(today))
    .orderBy(desc(siteNotice.pinned), desc(siteNotice.startsOn), desc(siteNotice.createdAt));
}

/** 첫 화면 띠에 보일 공지 하나(띠로 고른 것 가운데 고정·새 글 먼저) */
export async function bannerNotice(db: Db, today = seoulDate()) {
  const [r] = await db
    .select({ id: siteNotice.id, title: siteNotice.title, ad: siteNotice.ad })
    .from(siteNotice)
    .where(and(liveNotice(today), eq(siteNotice.banner, true)))
    .orderBy(desc(siteNotice.pinned), desc(siteNotice.startsOn))
    .limit(1);
  return r ?? null;
}

/** 공지 한 건(게시 중일 때만). 읽은 수를 하나 올린다 */
export async function readNotice(db: Db, id: string, today = seoulDate()) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [r] = await db.select().from(siteNotice).where(and(eq(siteNotice.id, id), liveNotice(today)));
  if (!r) return null;
  await db.update(siteNotice).set({ views: sql`${siteNotice.views} + 1` }).where(eq(siteNotice.id, id));
  return r;
}

export const noticeTitle = (n: { title: string; ad: boolean }) => (n.ad ? `(광고) ${n.title}` : n.title);

export async function saveNotice(db: Db, actor: Actor, input: NoticeInput, now = new Date(), f: typeof fetch = fetch) {
  mustWrite(actor);
  const title = cut(input.title, 80);
  const body = cut(input.body, 5000);
  if (title.length < 2) throw new SiteError("제목을 적어 주세요");
  if (body.length < 2) throw new SiteError("내용을 적어 주세요");
  const today = seoulDate(now);
  const startsOn = isDate(input.startsOn) ? input.startsOn : today;
  const endsOn = isDate(input.endsOn) ? input.endsOn : null;
  if (endsOn && endsOn < startsOn) throw new SiteError("게시 끝 날은 시작 날 뒤여야 합니다");
  if (input.published && maskPersonal(`${title}\n${body}`) !== `${title}\n${body}`) throw new SiteError("공개할 글에 휴대폰 번호나 차량번호가 있습니다(정비소 전화는 괜찮지만 휴대폰 번호는 가려 주세요)");
  const values = { title, body, pinned: input.pinned, banner: input.banner, ad: input.ad, published: input.published, startsOn, endsOn, notifyCarbook: input.notifyCarbook, updatedBy: actor.id, updatedAt: now };
  let id = input.id;
  if (id) {
    const [r] = await db.update(siteNotice).set(values).where(eq(siteNotice.id, id)).returning({ id: siteNotice.id });
    if (!r) throw new SiteError("없는 공지입니다");
  } else {
    [{ id }] = await db.insert(siteNotice).values({ ...values, createdBy: actor.id, createdAt: now }).returning({ id: siteNotice.id });
  }
  await writeAudit(db, { actorId: actor.id, action: "site.notice", entityType: "site_notice", entityId: id!, after: { title, published: input.published, startsOn, endsOn, notify: input.notifyCarbook } });
  // 지금 게시가 시작되는 공지면 바로 알린다(광고는 밤 9시~아침 8시를 피해 오후 4시 작업에서 보낸다)
  const sent = input.published && input.notifyCarbook && startsOn <= today && !(input.ad && quietHours(now)) ? await notifyNotice(db, id!, now, f) : null;
  return { id: id!, sent };
}

export async function deleteNotice(db: Db, actor: Actor, id: string) {
  mustWrite(actor);
  const [r] = await db.delete(siteNotice).where(eq(siteNotice.id, id)).returning({ t: siteNotice.title });
  if (r) await writeAudit(db, { actorId: actor.id, action: "site.notice_delete", entityType: "site_notice", entityId: id, before: { title: r.t } });
}

/**
 * 공지를 내 차 수첩 알림(푸시)으로 보내기 — 한 번만. 푸시를 켠 손님에게만 가고(문자·알림톡으로 대신 보내지 않음),
 * 광고 공지는 광고 수신에 동의한 손님에게만 '(광고)'를 붙여 보낸다.
 */
export async function notifyNotice(db: Db, id: string, now = new Date(), f: typeof fetch = fetch) {
  const [n] = await db.select().from(siteNotice).where(eq(siteNotice.id, id));
  if (!n || !n.notifyCarbook || n.notifiedAt || !n.published) return 0;
  // 먼저 표시해서 두 번 보내지 않게 한다
  const [claimed] = await db.update(siteNotice).set({ notifiedAt: now }).where(and(eq(siteNotice.id, id), isNull(siteNotice.notifiedAt))).returning({ id: siteNotice.id });
  if (!claimed) return 0;
  const ids = [...new Set((await db.selectDistinct({ c: carbookPush.customerId }).from(carbookPush)).map((r) => r.c))];
  const live = ids.length ? await db.select({ id: customer.id, purgedAt: customer.purgedAt }).from(customer).where(inArray(customer.id, ids)) : [];
  let sent = 0;
  for (const c of live) {
    if (c.purgedAt) continue;
    if (n.ad && !(await consentState(db, c.id)).marketing) continue;
    const r = await sendPush(db, c.id, { title: noticeTitle(n), body: n.body.replace(/\s+/g, " ").slice(0, 120), url: "/my" }, now, f);
    if (r.ok) sent++;
  }
  await db.update(siteNotice).set({ notifiedCount: sent }).where(eq(siteNotice.id, id));
  return sent;
}

/** 오후 4시 작업: 오늘부터 게시하는 공지 가운데 알림을 고른 것을 보낸다 */
export async function noticeNotifyJob(db: Db, now = new Date(), f: typeof fetch = fetch) {
  const today = seoulDate(now);
  const due = await db.select({ id: siteNotice.id }).from(siteNotice).where(and(liveNotice(today), eq(siteNotice.notifyCarbook, true), isNull(siteNotice.notifiedAt)));
  let sent = 0;
  for (const d of due) sent += await notifyNotice(db, d.id, now, f);
  return `홈페이지 공지 알림 ${due.length}건(${sent}명)`;
}

/** 내 차 수첩 첫 화면 '정비소 소식'(광고 공지는 광고 수신 동의 손님에게만) */
export async function carbookNotices(db: Db, customerId: string, today = seoulDate()) {
  const rows = await publicNotices(db, today);
  const marketing = rows.some((r) => r.ad) ? (await consentState(db, customerId)).marketing : false;
  return rows.filter((r) => !r.ad || marketing).slice(0, 3);
}

// ── 작업 사례 ──
export const CASE_CATEGORIES = SERVICES.map((s) => s.title) as readonly string[];
const CASE_DIR = "site/cases";
export const CASE_LIMIT = { photos: 8 } as const;

async function photoConsent(db: Db, customerId: string | null) {
  if (!customerId) return false;
  const [c] = await db.select({ purgedAt: customer.purgedAt }).from(customer).where(eq(customer.id, customerId));
  if (!c || c.purgedAt) return false;
  const st = await consentState(db, customerId);
  return st.photo && !st.business;
}

/** 사례로 쓸 수 있는 수리 건: 출고했고, 손님이 사진 홍보 사용에 동의했고, 아직 사례가 없는 것(최근 순) */
export async function caseCandidates(db: Db, limit = 30) {
  const ros = await db
    .select({ id: repairOrder.id, docNo: repairOrder.docNo, customerId: repairOrder.customerId, deliveredAt: sql<Date | null>`coalesce(${repairStatement.deliveredAt}, ${repairOrder.updatedAt})`, maker: vehicle.maker, model: vehicle.model })
    .from(repairOrder)
    .leftJoin(vehicle, eq(vehicle.id, repairOrder.vehicleId))
    .leftJoin(repairStatement, eq(repairStatement.repairOrderId, repairOrder.id))
    .where(eq(repairOrder.status, "delivered"))
    .orderBy(desc(repairOrder.updatedAt))
    .limit(200);
  const used = new Set((await db.select({ r: siteCase.repairOrderId }).from(siteCase).where(isNotNull(siteCase.repairOrderId))).map((r) => r.r));
  const out: (typeof ros)[number][] = [];
  for (const r of ros) {
    if (used.has(r.id) || !(await photoConsent(db, r.customerId))) continue;
    out.push(r);
    if (out.length >= limit) break;
  }
  return out;
}

/** 사례 사진 고르기용: 입고 사진(전)과 검사 사진(후). 직원 화면에서만 보인다(/api/files) */
export async function caseSources(db: Db, roId: string) {
  const before = await db.select({ path: roPhoto.path, slot: roPhoto.slot }).from(roPhoto).where(eq(roPhoto.repairOrderId, roId)).orderBy(asc(roPhoto.createdAt));
  const ins = await db.select({ photos: inspection.photos }).from(inspection).where(eq(inspection.repairOrderId, roId)).orderBy(asc(inspection.round));
  return { before: before.filter((p) => p.slot !== "dash" && p.slot !== "label").map((p) => p.path), after: ins.flatMap((i) => i.photos) };
}

export async function listCases(db: Db) {
  const rows = await db.select({ c: siteCase, docNo: repairOrder.docNo }).from(siteCase).leftJoin(repairOrder, eq(repairOrder.id, siteCase.repairOrderId)).orderBy(desc(siteCase.createdAt));
  const out = [];
  for (const r of rows) out.push({ ...r.c, docNo: r.docNo, consent: await photoConsent(db, r.c.customerId) });
  return out;
}

export async function getCase(db: Db, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [r] = await db.select({ c: siteCase, docNo: repairOrder.docNo }).from(siteCase).leftJoin(repairOrder, eq(repairOrder.id, siteCase.repairOrderId)).where(eq(siteCase.id, id));
  return r ? { ...r.c, docNo: r.docNo, consent: await photoConsent(db, r.c.customerId) } : null;
}

/** 수리 건으로 사례 만들기(초안, 공개 안 함). 차종·작업일·분야는 수리 건에서 불러온다 */
export async function createCase(db: Db, actor: Actor, roId: string, now = new Date()) {
  mustWrite(actor);
  const [ro] = await db
    .select({ id: repairOrder.id, docNo: repairOrder.docNo, status: repairOrder.status, customerId: repairOrder.customerId, at: repairOrder.updatedAt, deliveredAt: repairStatement.deliveredAt, maker: vehicle.maker, model: vehicle.model, consultId: repairOrder.consultationId })
    .from(repairOrder)
    .leftJoin(vehicle, eq(vehicle.id, repairOrder.vehicleId))
    .leftJoin(repairStatement, eq(repairStatement.repairOrderId, repairOrder.id))
    .where(eq(repairOrder.id, roId));
  if (!ro) throw new SiteError("없는 수리 건입니다");
  if (ro.status !== "delivered") throw new SiteError("출고한 수리 건만 작업 사례로 씁니다");
  if (!(await photoConsent(db, ro.customerId))) throw new SiteError("이 손님은 '수리 전후 사진 홍보 사용'에 동의하지 않았습니다. 동의를 받은 뒤 만들 수 있습니다(고객 화면 › 동의)");
  const [dup] = await db.select({ id: siteCase.id }).from(siteCase).where(eq(siteCase.repairOrderId, roId));
  if (dup) return dup.id;
  const [cs] = ro.consultId ? await db.select({ types: consultation.damageTypes }).from(consultation).where(eq(consultation.id, ro.consultId)) : [];
  const types: string[] = cs?.types ?? [];
  const category = types.includes("찌그러짐") ? "찌그러짐" : types.includes("긁힘") ? "긁힘" : "도색";
  const carLabel = [ro.maker, ro.model].filter(Boolean).join(" ") || null;
  const [r] = await db
    .insert(siteCase)
    .values({ repairOrderId: ro.id, customerId: ro.customerId, title: `${carLabel ?? "차"} ${category} 수리`, body: "", category, carLabel, workedOn: seoulDate(ro.deliveredAt ?? ro.at), createdBy: actor.id, updatedBy: actor.id, createdAt: now, updatedAt: now })
    .returning({ id: siteCase.id });
  await writeAudit(db, { actorId: actor.id, action: "site.case", entityType: "site_case", entityId: r.id, after: { ro: ro.docNo } });
  return r.id;
}

export type CaseInput = { title: string; body: string; category: string; carLabel: string; published: boolean };

export async function saveCase(db: Db, actor: Actor, id: string, input: CaseInput, now = new Date()) {
  mustWrite(actor);
  const c = await getCase(db, id);
  if (!c) throw new SiteError("없는 사례입니다");
  const title = cut(input.title, 80);
  if (title.length < 2) throw new SiteError("제목을 적어 주세요");
  if (!CASE_CATEGORIES.includes(input.category)) throw new SiteError("분야를 골라 주세요");
  const body = cut(input.body, 2000);
  const carLabel = cut(input.carLabel, 40) || null;
  if (input.published) {
    if (!c.consent) throw new SiteError("손님이 사진 홍보 사용에 동의하지 않았거나 동의를 거두었습니다. 공개할 수 없습니다");
    if (!c.photos.some((p) => p.side === "before") || !c.photos.some((p) => p.side === "after")) throw new SiteError("수리 전 사진과 수리 후 사진을 한 장 이상씩 올려야 공개할 수 있습니다");
    if (maskPersonal(`${title}\n${body}\n${carLabel ?? ""}`) !== `${title}\n${body}\n${carLabel ?? ""}`) throw new SiteError("공개할 글에 휴대폰 번호나 차량번호가 있습니다. 지우고 공개해 주세요");
  }
  await db.update(siteCase).set({ title, body, category: input.category, carLabel, published: input.published, updatedBy: actor.id, updatedAt: now }).where(eq(siteCase.id, id));
  await writeAudit(db, { actorId: actor.id, action: "site.case", entityType: "site_case", entityId: id, after: { title, published: input.published } });
}

/**
 * 가린 사진 올리기. 직원 화면에서 번호판·얼굴을 칠해 새로 만든 그림(JPG·WEBP)만 받는다 — 새로 그린 그림이라 촬영 위치(GPS) 같은 정보가 없다.
 */
export async function addCasePhoto(db: Db, actor: Actor, id: string, side: string, bytes: Uint8Array, size: { width?: number; height?: number } = {}, now = new Date()) {
  mustWrite(actor);
  const c = await getCase(db, id);
  if (!c) throw new SiteError("없는 사례입니다");
  if (side !== "before" && side !== "after") throw new SiteError("수리 전·후를 골라 주세요");
  if (c.photos.length >= CASE_LIMIT.photos) throw new SiteError(`사진은 ${CASE_LIMIT.photos}장까지 올립니다`);
  if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) throw new SiteError("사진이 비었거나 너무 큽니다(6MB까지)");
  const t = sniffImage(bytes);
  if (!t) throw new SiteError("사진 파일만 올릴 수 있습니다");
  const path = await storeFile(`${CASE_DIR}/${id}`, bytes, IMAGE_TYPES[t]);
  const photo: CasePhoto = { path, side, width: size.width && size.width > 0 ? Math.round(size.width) : undefined, height: size.height && size.height > 0 ? Math.round(size.height) : undefined };
  await db.update(siteCase).set({ photos: [...c.photos, photo], updatedBy: actor.id, updatedAt: now }).where(eq(siteCase.id, id));
  await writeAudit(db, { actorId: actor.id, action: "site.case_photo", entityType: "site_case", entityId: id, after: { side } });
  return path;
}

export async function removeCasePhoto(db: Db, actor: Actor, id: string, path: string, now = new Date()) {
  mustWrite(actor);
  const c = await getCase(db, id);
  if (!c) throw new SiteError("없는 사례입니다");
  if (!c.photos.some((p) => p.path === path)) return;
  const photos = c.photos.filter((p) => p.path !== path);
  await db.update(siteCase).set({ photos, published: c.published && photos.some((p) => p.side === "before") && photos.some((p) => p.side === "after"), updatedBy: actor.id, updatedAt: now }).where(eq(siteCase.id, id));
  await removeStored(path);
}

export async function deleteCase(db: Db, actor: Actor, id: string) {
  mustWrite(actor);
  const c = await getCase(db, id);
  if (!c) return;
  await db.delete(siteCase).where(eq(siteCase.id, id));
  for (const p of c.photos) await removeStored(p.path);
  await writeAudit(db, { actorId: actor.id, action: "site.case_delete", entityType: "site_case", entityId: id, before: { title: c.title } });
}

/** 홈페이지에 보일 사례: 공개했고, 손님 동의가 아직 살아 있는 것만 */
export async function publicCases(db: Db, category = "", limit = 60) {
  const rows = await db.select().from(siteCase).where(eq(siteCase.published, true)).orderBy(desc(siteCase.workedOn), desc(siteCase.createdAt)).limit(200);
  const out = [];
  for (const r of rows) {
    if (category && r.category !== category) continue;
    if (!(await photoConsent(db, r.customerId))) continue;
    out.push({ id: r.id, title: r.title, body: r.body, category: r.category, carLabel: r.carLabel, workedOn: r.workedOn, photos: r.photos });
    if (out.length >= limit) break;
  }
  return out;
}

export async function readCase(db: Db, id: string) {
  const c = await getCase(db, id);
  if (!c || !c.published || !c.consent) return null;
  await db.update(siteCase).set({ views: sql`${siteCase.views} + 1` }).where(eq(siteCase.id, id));
  return c;
}

/** 홈페이지에서 누구나 열 수 있는 사진인지: 공개 중·동의 살아 있는 사례의 사진만 */
export async function publicCaseFile(db: Db, rel: string) {
  const m = /^site\/cases\/([0-9a-f-]{36})\/[0-9a-f-]{36}\.(jpg|webp|png)$/.exec(rel);
  if (!m) return false;
  const c = await getCase(db, m[1]);
  return !!c && c.published && c.consent && c.photos.some((p) => p.path === rel);
}
