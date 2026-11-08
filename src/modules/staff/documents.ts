// 직원 서류(STD-11·STD-13): 근로계약서(F-11-01), 정보보호 서약서(F-13-02), 퇴직 비밀유지 확인서(F-13-03).
// 대표·회계 담당이 쓰고(계약서는 대표 확인), 직원이 본인 로그인이나 대면으로 서명한다.
// 서명하면 내용·인적 사항·사업장 정보·직인을 그때 값으로 고정하고, 계약서는 교부 사실을 남긴다(근로기준법 제17조).
import { and, desc, eq, inArray, ne } from "drizzle-orm";
import type { Db } from "@/db/client";
import { appUser, staffDocument, staffProfile } from "@/db/schema";
import { can } from "@/modules/auth/permissions";
import { decrypt, encrypt } from "@/modules/auth/crypto";
import type { Role } from "@/modules/auth/roles";
import { writeAudit } from "@/modules/platform/audit";
import { loadShopCalendar } from "@/modules/platform/calendar";
import { nextDocNo } from "@/modules/platform/docno";
import { UserError } from "@/modules/platform/errors";
import { notifyRole, notifyUser } from "@/modules/platform/notify";
import { loadPolicy } from "@/modules/platform/policy";
import { loadShopInfo, shopAddressLine } from "@/modules/platform/shop";
import { storeFile } from "@/modules/platform/storage";
import { seoulDate } from "@/modules/platform/time";
import { checkContract, DOC_KINDS, LEAVE_CHECKS, PLEDGE_VERSION, type ContractTerms, type DocKind, type PledgeTerms } from "./contract-rules";
import { RULES_VERSION } from "./work-rules-text";
import { getProfile } from "./service";

export class DocError extends UserError {}
type Actor = { id: string; roles: Role[] };
type Row = typeof staffDocument.$inferSelect;
export type Party = { name: string; birth: string; phone: string; address: string };

export const canWriteDocs = (a: Actor) => can(a, "staff.roster");
const ISO = /^\d{4}-\d{2}-\d{2}$/;

async function nameOf(db: Db, userId: string) {
  const [u] = await db.select({ name: appUser.name }).from(appUser).where(eq(appUser.id, userId));
  if (!u) throw new DocError("없는 직원입니다");
  return u.name;
}

async function annualText(db: Db, on: string) {
  const pol = await loadPolicy(db, on);
  return pol["hr.headcount_5plus"] === 1 ? "근로기준법에서 정하는 바에 따라 부여함" : `사내 규정에 따라 입사일 기준 1년마다 ${pol["leave.small_annual_days"]}일 부여함(상시 5명 미만 사업장)`;
}

/** 새 계약서 기본값: 같은 직원의 마지막 계약서 → 없으면 명부·사업장 설정·정책값 */
export async function contractDefaults(db: Db, actor: Actor, userId: string): Promise<{ terms: ContractTerms; source: string }> {
  if (!canWriteDocs(actor)) throw new DocError("근로계약서는 대표·회계 담당이 씁니다");
  const [last] = await db
    .select()
    .from(staffDocument)
    .where(and(eq(staffDocument.userId, userId), eq(staffDocument.kind, "contract"), ne(staffDocument.status, "cancelled")))
    .orderBy(desc(staffDocument.createdAt))
    .limit(1);
  if (last) return { terms: last.terms as ContractTerms, source: `이전 계약서 ${last.docNo}` };
  const [p, shop, cal] = await Promise.all([getProfile(db, actor, userId), loadShopInfo(db), loadShopCalendar(db)]);
  const pol = await loadPolicy(db);
  const off = [0, 1, 2, 3, 4, 5, 6].filter((d) => !cal.workdays.includes(d));
  const kind = p?.contractKind === "fixed" || p?.contractKind === "part" ? p.contractKind : "regular";
  return {
    terms: {
      contractType: kind,
      startOn: p?.hiredOn || seoulDate(),
      endOn: kind === "fixed" ? p?.contractEnd ?? "" : "",
      place: shop.name ? `${shop.name} 사업장(${shopAddressLine(shop)})` : "",
      duties: p?.job ?? "",
      workDays: cal.workdays.filter((d) => d !== (off.includes(0) ? 0 : off[0] ?? 0)),
      workStart: "09:00",
      workEnd: "18:00",
      breakStart: "12:00",
      breakEnd: "13:00",
      holiday: off.includes(0) ? 0 : off[0] ?? 0,
      payType: kind === "part" ? "hourly" : "monthly",
      basePay: 0,
      allowances: [],
      bonus: "",
      payDay: pol["payroll.pay_day"],
      payMethod: "account",
      insurances: ["employment", "accident", "pension", "health"],
      extra: "",
    },
    source: "명부·설정",
  };
}

export async function contractCheck(db: Db, t: ContractTerms) {
  const pol = await loadPolicy(db, ISO.test(t.startOn) ? t.startOn : seoulDate());
  return checkContract(t, { minWage: pol["wage.minimum_hourly"], legal5: pol["hr.headcount_5plus"] === 1 });
}

/** 근로계약서 저장(새로 쓰기 또는 서명 전 고치기). 대표가 쓰면 바로 서명 대기, 회계가 쓰면 대표 확인 대기 */
export async function saveContract(db: Db, actor: Actor, userId: string, terms: ContractTerms, docId?: string, now = new Date()) {
  if (!canWriteDocs(actor)) throw new DocError("근로계약서는 대표·회계 담당이 씁니다");
  const name = await nameOf(db, userId);
  const t: ContractTerms = { ...terms, place: terms.place.trim(), duties: terms.duties.trim(), bonus: terms.bonus.trim(), extra: terms.extra.trim(), endOn: terms.contractType === "regular" ? "" : terms.endOn, allowances: terms.allowances.filter((a) => a.name.trim() || a.amount) };
  const r = await contractCheck(db, t);
  if (r.errors.length) throw new DocError(r.errors.join(" / "));
  t.annualText = await annualText(db, t.startOn);
  const approved = can(actor, "contract.approve");
  let row: Row;
  if (docId) {
    const [d] = await db.select().from(staffDocument).where(eq(staffDocument.id, docId));
    if (!d || d.kind !== "contract" || d.userId !== userId) throw new DocError("없는 계약서입니다");
    if (d.status === "signed" || d.status === "cancelled") throw new DocError("서명했거나 취소한 계약서는 고칠 수 없습니다. 바뀐 조건은 새 계약서로 씁니다");
    [row] = await db
      .update(staffDocument)
      .set({ terms: t, status: approved ? "ready" : "draft", approvedBy: approved ? actor.id : null, approvedAt: approved ? now : null, updatedAt: now })
      .where(eq(staffDocument.id, docId))
      .returning();
  } else {
    [row] = await db
      .insert(staffDocument)
      .values({ docNo: await nextDocNo(db, "LC", now), userId, kind: "contract", status: approved ? "ready" : "draft", terms: t, approvedBy: approved ? actor.id : null, approvedAt: approved ? now : null, createdBy: actor.id, createdAt: now, updatedAt: now })
      .returning();
  }
  await writeAudit(db, { actorId: actor.id, action: docId ? "staff_doc.update" : "staff_doc.create", entityType: "staff_document", entityId: row.id, after: { kind: "contract", status: row.status } });
  if (approved) await notifyUser(db, userId, `근로계약서 서명 요청 ${row.docNo}`, `doc-ready-${row.id}`, `/staff/docs/${row.id}`);
  else await notifyRole(db, "owner", `근로계약서 확인 요청: ${name} ${row.docNo}`, `doc-approve-${row.id}-${row.updatedAt.getTime()}`, `/staff/docs/${row.id}`);
  return { doc: row, warnings: r.warnings };
}

/** 대표 확인: 회계 담당이 쓴 계약서를 대표가 보고 서명 대기로 넘긴다(직인이 찍히므로) */
export async function approveContract(db: Db, actor: Actor, docId: string, now = new Date()) {
  if (!can(actor, "contract.approve")) throw new DocError("근로계약서 확인은 대표가 합니다");
  const [d] = await db.select().from(staffDocument).where(eq(staffDocument.id, docId));
  if (!d || d.kind !== "contract") throw new DocError("없는 계약서입니다");
  if (d.status !== "draft") throw new DocError("확인할 단계가 아닙니다");
  await db.update(staffDocument).set({ status: "ready", approvedBy: actor.id, approvedAt: now, updatedAt: now }).where(eq(staffDocument.id, docId));
  await writeAudit(db, { actorId: actor.id, action: "staff_doc.approve", entityType: "staff_document", entityId: d.id });
  await notifyUser(db, d.userId, `근로계약서 서명 요청 ${d.docNo}`, `doc-ready-${d.id}`, `/staff/docs/${d.id}`);
}

/** 서약서·확인서 만들기(바로 서명 대기). 퇴직 확인서는 반납·삭제 확인 항목을 담당자가 함께 확인해 체크한다 */
export async function createPledge(db: Db, actor: Actor, userId: string, kind: "pledge_join" | "pledge_leave" | "rules_ack", input: { leftOn?: string; checks?: string[]; note?: string } = {}, now = new Date()) {
  if (!canWriteDocs(actor)) throw new DocError("서약서는 대표·회계 담당이 준비합니다");
  const name = await nameOf(db, userId);
  const open = await db
    .select({ id: staffDocument.id })
    .from(staffDocument)
    .where(and(eq(staffDocument.userId, userId), eq(staffDocument.kind, kind), inArray(staffDocument.status, ["draft", "ready"])));
  if (open.length) throw new DocError(`서명을 기다리는 ${DOC_KINDS[kind].label}가 이미 있습니다`);
  const terms: PledgeTerms = { version: kind === "rules_ack" ? RULES_VERSION : PLEDGE_VERSION };
  if (kind === "pledge_leave") {
    const [p] = await db.select({ leftOn: staffProfile.leftOn }).from(staffProfile).where(eq(staffProfile.userId, userId));
    const leftOn = input.leftOn || p?.leftOn || "";
    if (!ISO.test(leftOn)) throw new DocError("퇴직일을 적어 주세요(근로자 명부의 퇴직일을 불러옵니다)");
    const checks = (input.checks ?? []).filter((c) => c in LEAVE_CHECKS);
    terms.leftOn = leftOn;
    terms.checks = checks;
    terms.note = (input.note ?? "").trim();
  }
  const [row] = await db
    .insert(staffDocument)
    .values({ docNo: await nextDocNo(db, "PL", now), userId, kind, status: "ready", terms, createdBy: actor.id, createdAt: now, updatedAt: now })
    .returning();
  await writeAudit(db, { actorId: actor.id, action: "staff_doc.create", entityType: "staff_document", entityId: row.id, after: { kind } });
  await notifyUser(db, userId, `${DOC_KINDS[kind].label} 서명 요청 ${row.docNo}`, `doc-ready-${row.id}`, `/staff/docs/${row.id}`);
  return { doc: row, name };
}

/** 퇴직 확인서의 반납·삭제 항목을 고친다(서명 전) */
export async function updateLeaveChecks(db: Db, actor: Actor, docId: string, checks: string[], note: string, now = new Date()) {
  if (!canWriteDocs(actor)) throw new DocError("대표·회계 담당이 확인합니다");
  const [d] = await db.select().from(staffDocument).where(eq(staffDocument.id, docId));
  if (!d || d.kind !== "pledge_leave" || d.status !== "ready") throw new DocError("서명 전 퇴직 확인서만 고칠 수 있습니다");
  const terms = { ...(d.terms as PledgeTerms), checks: checks.filter((c) => c in LEAVE_CHECKS), note: note.trim() };
  await db.update(staffDocument).set({ terms, updatedAt: now }).where(eq(staffDocument.id, docId));
}

/**
 * 서명: 본인이 로그인해 서명하거나, 대표·회계 담당 앞에서 대면 서명(담당자 화면).
 * 서명하면 인적 사항·사업장 정보를 고정하고, 계약서면 명부의 계약 형태·종료일을 계약서에 맞춘다.
 */
export async function signDocument(db: Db, actor: Actor, docId: string, png: Uint8Array | null, now = new Date()) {
  const [d] = await db.select().from(staffDocument).where(eq(staffDocument.id, docId));
  if (!d) throw new DocError("없는 서류입니다");
  const self = actor.id === d.userId;
  if (!self && !canWriteDocs(actor)) throw new DocError("본인이나 대표·회계 담당(대면 서명)만 서명을 받을 수 있습니다");
  if (d.status === "draft") throw new DocError("대표가 계약 내용을 확인한 뒤에 서명합니다");
  if (d.status !== "ready") throw new DocError("서명할 단계가 아닙니다");
  if (!png || png.length < 200) throw new DocError("서명란에 서명해 주세요");
  if (d.kind === "pledge_leave") {
    const t = d.terms as PledgeTerms;
    const missing = Object.keys(LEAVE_CHECKS).filter((k) => !t.checks?.includes(k));
    if (missing.length) throw new DocError(`반납·삭제 확인이 끝나지 않았습니다: ${missing.map((k) => LEAVE_CHECKS[k as keyof typeof LEAVE_CHECKS]).join(" / ")}`);
  }
  const [name, p, shop] = await Promise.all([nameOf(db, d.userId), getProfile(db, { id: d.userId, roles: ["owner"] }, d.userId), loadShopInfo(db)]);
  if (d.kind === "contract" && !p?.phone) throw new DocError("근로자 명부에 휴대폰·주소를 먼저 적어 주세요(계약서 근로자 칸에 들어갑니다)");
  const party: Party = { name, birth: p?.birth ?? "", phone: p?.phone ?? "", address: p?.address ? `${p.address}${p.addressDetail ? `, ${p.addressDetail}` : ""}` : "" };
  const signPath = await storeFile("staff/sign", png, "png");
  const shopSnap = { name: shop.name, ceo: shop.ceo, bizNo: shop.bizNo, phone: shop.phone, address: shopAddressLine(shop), sealPath: shop.sealPath };
  await db.transaction(async (tx) => {
    const done = await tx
      .update(staffDocument)
      .set({ status: "signed", signPath, signedVia: self ? "self" : "in_person", signedAt: now, signedBy: actor.id, partyEnc: encrypt(JSON.stringify(party), "sensitive"), shop: shopSnap, updatedAt: now })
      .where(and(eq(staffDocument.id, d.id), eq(staffDocument.status, "ready")))
      .returning({ id: staffDocument.id });
    if (!done.length) throw new DocError("이미 서명했습니다");
    if (d.kind === "contract") {
      const t = d.terms as ContractTerms;
      await tx.update(staffProfile).set({ contractKind: t.contractType, contractEnd: t.endOn || null, updatedAt: now }).where(eq(staffProfile.userId, d.userId));
    }
  });
  await writeAudit(db, { actorId: actor.id, action: "staff_doc.sign", entityType: "staff_document", entityId: d.id, after: { kind: d.kind, via: self ? "self" : "in_person" } });
  if (self) await notifyRole(db, "accounting", `${name} ${DOC_KINDS[d.kind as DocKind].label} 서명 완료 ${d.docNo}${d.kind === "contract" ? " — 교부 기록 필요" : ""}`, `doc-signed-${d.id}`, `/staff/docs/${d.id}`);
}

/** 취업규칙 확인: 직원이 /rules 에서 읽고 바로 서명한다(지금 판을 이미 확인했으면 막음) */
export async function ackRules(db: Db, actor: Actor, png: Uint8Array | null, now = new Date()) {
  const mine = await db
    .select()
    .from(staffDocument)
    .where(and(eq(staffDocument.userId, actor.id), eq(staffDocument.kind, "rules_ack"), ne(staffDocument.status, "cancelled")));
  if (mine.some((d) => d.status === "signed" && (d.terms as PledgeTerms).version === RULES_VERSION)) throw new DocError("이 판의 취업규칙은 이미 확인했습니다");
  let doc = mine.find((d) => d.status === "ready" && (d.terms as PledgeTerms).version === RULES_VERSION);
  if (!doc) {
    [doc] = await db
      .insert(staffDocument)
      .values({ docNo: await nextDocNo(db, "PL", now), userId: actor.id, kind: "rules_ack", status: "ready", terms: { version: RULES_VERSION }, createdBy: actor.id, createdAt: now, updatedAt: now })
      .returning();
  }
  await signDocument(db, actor, doc.id, png, now);
  return doc;
}

/** 직원별 취업규칙 확인 여부(지금 판) */
export async function rulesAckStatus(db: Db) {
  const rows = await db.select({ userId: staffDocument.userId, terms: staffDocument.terms, signedAt: staffDocument.signedAt }).from(staffDocument).where(and(eq(staffDocument.kind, "rules_ack"), eq(staffDocument.status, "signed")));
  const out = new Map<string, Date>();
  for (const r of rows) if ((r.terms as PledgeTerms).version === RULES_VERSION && r.signedAt) out.set(r.userId, r.signedAt);
  return out;
}

export const DELIVER_HOW = { print: "인쇄본을 직접 줌", app: "앱에서 본인이 받음(전자 교부)", email: "이메일·문자로 보냄" } as const;

/** 교부 기록(계약서). 본인이 '받았습니다'를 누르면 전자 교부로 남는다 */
export async function markDelivered(db: Db, actor: Actor, docId: string, how: string, now = new Date()) {
  const [d] = await db.select().from(staffDocument).where(eq(staffDocument.id, docId));
  if (!d || d.status !== "signed") throw new DocError("서명한 서류만 교부할 수 있습니다");
  if (d.deliveredAt) throw new DocError("이미 교부를 기록했습니다");
  const self = actor.id === d.userId;
  if (!self && !canWriteDocs(actor)) throw new DocError("대표·회계 담당이 교부를 기록합니다");
  const h = self ? "app" : how;
  if (!(h in DELIVER_HOW)) throw new DocError("교부 방법을 골라 주세요");
  await db.update(staffDocument).set({ deliveredAt: now, deliveredHow: h, deliveredBy: actor.id, updatedAt: now }).where(eq(staffDocument.id, d.id));
  await writeAudit(db, { actorId: actor.id, action: "staff_doc.deliver", entityType: "staff_document", entityId: d.id, after: { how: h } });
}

/** 서명 전 취소(서명한 서류는 지우지 않고, 조건이 바뀌면 새 계약서를 쓴다) */
export async function cancelDocument(db: Db, actor: Actor, docId: string, reason: string, now = new Date()) {
  if (!canWriteDocs(actor)) throw new DocError("대표·회계 담당이 취소합니다");
  const [d] = await db.select().from(staffDocument).where(eq(staffDocument.id, docId));
  if (!d || (d.status !== "draft" && d.status !== "ready")) throw new DocError("서명 전 서류만 취소할 수 있습니다");
  if (!reason.trim()) throw new DocError("취소 사유를 적어 주세요");
  await db.update(staffDocument).set({ status: "cancelled", cancelledAt: now, cancelReason: reason.trim(), updatedAt: now }).where(eq(staffDocument.id, d.id));
  await writeAudit(db, { actorId: actor.id, action: "staff_doc.cancel", entityType: "staff_document", entityId: d.id });
}

/** 목록: 대표·회계는 모두(또는 한 사람), 다른 직원은 본인 것만 */
export async function listDocuments(db: Db, actor: Actor, userId?: string) {
  const all = canWriteDocs(actor);
  const who = all ? userId : actor.id;
  return db
    .select({ d: staffDocument, name: appUser.name })
    .from(staffDocument)
    .innerJoin(appUser, eq(appUser.id, staffDocument.userId))
    .where(who ? eq(staffDocument.userId, who) : undefined)
    .orderBy(desc(staffDocument.createdAt))
    .limit(300);
}

/** 한 서류 보기: 본인·대표·회계. 서명 전이면 지금 명부 값으로 미리 보여 준다 */
export async function getDocument(db: Db, actor: Actor, docId: string) {
  const [d] = await db.select().from(staffDocument).where(eq(staffDocument.id, docId));
  if (!d) throw new DocError("없는 서류입니다");
  if (d.userId !== actor.id && !canWriteDocs(actor)) throw new DocError("본인과 대표·회계 담당만 볼 수 있습니다");
  let party: Party;
  let shop: Record<string, string>;
  if (d.partyEnc && d.shop) {
    party = JSON.parse(decrypt(d.partyEnc)) as Party;
    shop = d.shop;
  } else {
    const [name, p, s] = await Promise.all([nameOf(db, d.userId), getProfile(db, { id: d.userId, roles: ["owner"] }, d.userId), loadShopInfo(db)]);
    party = { name, birth: p?.birth ?? "", phone: p?.phone ?? "", address: p?.address ? `${p.address}${p.addressDetail ? `, ${p.addressDetail}` : ""}` : "" };
    shop = { name: s.name, ceo: s.ceo, bizNo: s.bizNo, phone: s.phone, address: shopAddressLine(s), sealPath: "" };
  }
  const check = d.kind === "contract" ? await contractCheck(db, d.terms as ContractTerms) : null;
  return { d, party, shop, check };
}
