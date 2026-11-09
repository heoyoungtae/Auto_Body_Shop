// 문자 발송·문구 서식(설계서 문자관리, STD-01·STD-13): 고객을 골라(한 명·출고 고객·전체) 문구를 바꿔 넣어 보낸다.
// 정보성 안내는 필수 동의 고객에게, 광고는 마케팅 동의 고객에게만 보내고 (광고)·무료수신거부를 붙이며 밤(21~08시)에는 막는다(정보통신망법 제50조).
import { and, desc, eq, gte, inArray, isNotNull, isNull } from "drizzle-orm";
import type { Db } from "@/db/client";
import { consent, customer, repairOrder, repairStatement, smsTemplate, vehicle } from "@/db/schema";
import { decrypt } from "@/modules/auth/crypto";
import { writeAudit } from "@/modules/platform/audit";
import { UserError } from "@/modules/platform/errors";
import { adBlockedAt, adWrap, smsBytes, LMS_MAX } from "./rules";
import { formatPhone, sendSmsBatch, SHOP_NAME, smsSenderInfo } from "./service";

export class BulkError extends UserError {}

export const SMS_PURPOSES = { info: "정보성 안내", ad: "광고(마케팅)" } as const;
export type SmsPurpose = keyof typeof SMS_PURPOSES;
export const isSmsPurpose = (v: string): v is SmsPurpose => v in SMS_PURPOSES;

/** 문구에 쓸 수 있는 바꿈 칸 */
export const SMS_VARS = ["고객명", "차량번호", "업체명", "업체전화"] as const;
export const SAMPLE = { 고객명: "홍길동", 차량번호: "12가3456", 업체명: SHOP_NAME, 업체전화: "031-000-0000" };
export const MAX_RECIPIENTS = 1000;

export const SCOPES = { one: "고객 한 명", delivered: "출고 고객", all: "전체 고객" } as const;
export type Scope = { kind: "one"; customerId: string } | { kind: "delivered"; months: number } | { kind: "all" };

export const render = (body: string, v: Record<string, string>) => body.replace(/#\{([^}]+)\}/g, (m, k: string) => v[k] ?? m);

/** 보낼 글: 광고면 (광고)와 수신거부 번호를 붙인다 */
export const finalText = (body: string, purpose: SmsPurpose, optout: string, v: Record<string, string>) => {
  const t = render(body, v).trim();
  return purpose === "ad" ? adWrap(t, optout) : t;
};

export function bodyIssues(body: string, purpose: SmsPurpose, optout: string) {
  const out: string[] = [];
  if (!body.trim()) out.push("보낼 내용을 적어 주세요");
  const unknown = [...body.matchAll(/#\{([^}]+)\}/g)].map((m) => m[1]).filter((k) => !(SMS_VARS as readonly string[]).includes(k));
  if (unknown.length) out.push(`모르는 바꿈 칸: ${[...new Set(unknown)].map((k) => `#{${k}}`).join(", ")}`);
  if (purpose === "ad" && !optout) out.push("광고 문자에는 무료수신거부 번호가 필요합니다(설정 › 문자 발송 서비스)");
  if (smsBytes(finalText(body, purpose, optout || "080-000-0000", SAMPLE)) > LMS_MAX) out.push(`내용이 너무 깁니다(${LMS_MAX}바이트까지)`);
  return out;
}

// ── 문구 서식 ──
const DEFAULTS: { title: string; purpose: SmsPurpose; body: string }[] = [
  { title: "임시 휴무 안내", purpose: "info", body: "#{고객명} 고객님, #{업체명}입니다.\n○월 ○일은 임시 휴무입니다. 이용에 참고 부탁드립니다.\n문의: #{업체전화}" },
  { title: "차량 인수 독촉", purpose: "info", body: "#{고객명} 고객님, #{업체명}입니다.\n#{차량번호} 차량 수리가 끝났습니다. 편하신 때 인수 부탁드립니다.\n문의: #{업체전화}" },
  { title: "계절 도장 관리 안내(광고)", purpose: "ad", body: "#{업체명}입니다. 장마·겨울철 도장면 관리 점검을 무료로 해 드립니다. 예약: #{업체전화}" },
];

export async function listTemplates(db: Db) {
  const rows = await db.select().from(smsTemplate).where(eq(smsTemplate.active, 1)).orderBy(smsTemplate.title);
  if (rows.length) return rows;
  const [any] = await db.select({ id: smsTemplate.id }).from(smsTemplate).limit(1);
  if (any) return rows; // 모두 지운 경우 기본 문구를 다시 넣지 않는다
  await db.insert(smsTemplate).values(DEFAULTS);
  return db.select().from(smsTemplate).where(eq(smsTemplate.active, 1)).orderBy(smsTemplate.title);
}

export async function saveTemplate(db: Db, actorId: string, input: { id?: string; title: string; purpose: string; body: string }) {
  const title = input.title.trim();
  if (!title) throw new BulkError("서식 이름을 적어 주세요");
  if (!isSmsPurpose(input.purpose)) throw new BulkError("용도를 골라 주세요");
  const issues = bodyIssues(input.body, input.purpose, "080-000-0000");
  if (issues.length) throw new BulkError(issues.join(" / "));
  if (/\(광고\)|수신거부/.test(input.body)) throw new BulkError("(광고)·무료수신거부는 보낼 때 저절로 붙습니다. 본문에서 빼 주세요");
  const v = { title, purpose: input.purpose, body: input.body.trim(), updatedBy: actorId, updatedAt: new Date() };
  if (input.id) await db.update(smsTemplate).set(v).where(eq(smsTemplate.id, input.id));
  else await db.insert(smsTemplate).values(v);
  await writeAudit(db, { actorId, action: "sms.template", entityType: "sms_template", entityId: input.id ?? title, after: { title, purpose: input.purpose } });
}

export async function removeTemplate(db: Db, actorId: string, id: string) {
  await db.update(smsTemplate).set({ active: 0, updatedBy: actorId, updatedAt: new Date() }).where(eq(smsTemplate.id, id));
}

// ── 받는 사람 ──
export type Recipient = { customerId: string; name: string; plateNo: string; phone: string };

/** 범위와 용도로 받는 사람을 고른다. 동의가 없거나 연락처가 없는 고객은 빼고 그 수를 돌려준다 */
export async function recipients(db: Db, scope: Scope, purpose: SmsPurpose, now = new Date()) {
  let ids: string[] | null = null;
  if (scope.kind === "one") ids = [scope.customerId];
  else if (scope.kind === "delivered") {
    const since = new Date(now.getTime() - scope.months * 30.5 * 86_400_000);
    const rows = await db
      .selectDistinct({ id: repairOrder.customerId })
      .from(repairStatement)
      .innerJoin(repairOrder, eq(repairOrder.id, repairStatement.repairOrderId))
      .where(and(isNotNull(repairStatement.deliveredAt), gte(repairStatement.deliveredAt, since)));
    ids = rows.map((r) => r.id);
    if (!ids.length) return { list: [] as Recipient[], excluded: { consent: 0, marketing: 0, phone: 0 } };
  }
  const cs = await db
    .select({ id: customer.id, name: customer.name, phoneEnc: customer.phoneEnc })
    .from(customer)
    .where(ids ? and(inArray(customer.id, ids), isNull(customer.purgedAt)) : isNull(customer.purgedAt));
  const cids = cs.map((c) => c.id);
  const latest = new Map<string, { required: boolean; marketing: boolean; withdrawal: boolean }>();
  if (cids.length)
    for (const r of await db.select().from(consent).where(inArray(consent.customerId, cids)).orderBy(desc(consent.at))) if (!latest.has(r.customerId)) latest.set(r.customerId, r);
  const plates = new Map<string, string>();
  if (cids.length) for (const v of await db.select({ c: vehicle.customerId, p: vehicle.plateNo }).from(vehicle).where(inArray(vehicle.customerId, cids)).orderBy(desc(vehicle.updatedAt))) if (!plates.has(v.c)) plates.set(v.c, v.p);
  const excluded = { consent: 0, marketing: 0, phone: 0 };
  const list: Recipient[] = [];
  for (const c of cs) {
    const k = latest.get(c.id);
    if (!c.phoneEnc) excluded.phone++;
    else if (!k || !k.required || k.withdrawal) excluded.consent++;
    else if (purpose === "ad" && !k.marketing) excluded.marketing++;
    else list.push({ customerId: c.id, name: c.name, plateNo: plates.get(c.id) ?? "", phone: decrypt(c.phoneEnc) });
  }
  list.sort((a, b) => a.name.localeCompare(b.name, "ko"));
  return { list, excluded };
}

/** 보내기. 화면에서 고른 범위로 서버에서 받는 사람을 다시 골라(화면 값을 믿지 않음) 보낸다 */
export async function sendMessages(db: Db, actorId: string, input: { scope: Scope; purpose: string; body: string; expected: number }, now = new Date(), f: typeof fetch = fetch) {
  if (!isSmsPurpose(input.purpose)) throw new BulkError("용도를 골라 주세요");
  const purpose = input.purpose;
  const info = await smsSenderInfo(db);
  const issues = bodyIssues(input.body, purpose, info.optout);
  if (issues.length) throw new BulkError(issues.join(" / "));
  if (purpose === "ad" && adBlockedAt(now)) throw new BulkError("광고 문자는 오후 9시부터 오전 8시까지 보낼 수 없습니다(정보통신망법 제50조)");
  const { list } = await recipients(db, input.scope, purpose, now);
  if (!list.length) throw new BulkError("보낼 수 있는 고객이 없습니다(동의·연락처 확인)");
  if (list.length > MAX_RECIPIENTS) throw new BulkError(`한 번에 ${MAX_RECIPIENTS}명까지 보냅니다. 범위를 줄여 주세요`);
  if (list.length !== input.expected) throw new BulkError(`그사이 받는 사람이 ${input.expected}명에서 ${list.length}명으로 바뀌었습니다. 미리보기를 다시 확인해 주세요`);
  const phone = info.sender ? formatPhone(info.sender) : "정비소";
  const items = list.map((r) => ({ to: r.phone, customerName: r.name, text: finalText(input.body, purpose, info.optout, { 고객명: r.name, 차량번호: r.plateNo, 업체명: SHOP_NAME, 업체전화: phone }) }));
  const res = await sendSmsBatch(db, actorId, purpose === "ad" ? "광고" : "안내", items, f);
  await writeAudit(db, { actorId, action: "sms.send", entityType: "message", entityId: input.scope.kind, after: { purpose, count: list.length, ok: res.ok } });
  return { ...res, count: list.length };
}
