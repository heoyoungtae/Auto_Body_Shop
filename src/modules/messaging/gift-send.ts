// 기프티콘 발송·이력(STD-06 사후관리, 설정 › 기프티콘 공급사)
// 고객 고르기 → 목적(이벤트·감사는 광고 수신 동의 고객만, 불만 보상은 대표만) → 상품(건당 상한 이하) → 월 예산·중복 확인 → 발송 → 이력·취소
import { and, desc, eq, gte, inArray, lt } from "drizzle-orm";
import type { Db } from "@/db/client";
import {
  appUser,
  complaint,
  consent,
  customer,
  giftSend,
  messageLog,
} from "@/db/schema";
import { decrypt, encrypt } from "@/modules/auth/crypto";
import { can } from "@/modules/auth/permissions";
import type { Role } from "@/modules/auth/roles";
import { writeAudit } from "@/modules/platform/audit";
import { nextDocNo } from "@/modules/platform/docno";
import { UserError } from "@/modules/platform/errors";
import { seoulDate } from "@/modules/platform/time";
import {
  DEMO_GOODS,
  giftishowCancel,
  giftishowGoods,
  giftishowSend,
  type GiftGoods,
} from "./gift";
import { giftConfig } from "./service";

export class GiftError extends UserError {}
type Actor = { id: string; roles: Role[] };
export const GIFT_PURPOSES = {
  event: "이벤트 경품",
  thanks: "감사(소개·후기)",
  complaint: "불만 보상",
  other: "기타",
} as const;
export type GiftPurpose = keyof typeof GIFT_PURPOSES;
const NEEDS_MARKETING: GiftPurpose[] = ["event", "thanks"];
const maskPhone = (p: string) =>
  p.length >= 10 ? `${p.slice(0, 3)}-****-${p.slice(-4)}` : "****";

/** 상품 목록. 공급사 목록은 1시간 기억해 둔다 */
let cache: { at: number; list: GiftGoods[] } | null = null;
export async function giftGoods(
  db: Db,
  f: typeof fetch = fetch,
): Promise<{ list: GiftGoods[]; demo: boolean; error?: string }> {
  const { data, cfg } = await giftConfig(db);
  if (data.provider === "demo") return { list: DEMO_GOODS, demo: true };
  if (cache && Date.now() - cache.at < 3600_000)
    return { list: cache.list, demo: false };
  try {
    const list = await giftishowGoods(cfg, f);
    cache = { at: Date.now(), list };
    return { list, demo: false };
  } catch (e) {
    return {
      list: [],
      demo: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
export const resetGiftCache = () => (cache = null);

/** 고객의 동의 상태와 최근 기프티콘 */
export async function giftTarget(db: Db, customerId: string, now = new Date()) {
  const [c] = await db
    .select()
    .from(customer)
    .where(eq(customer.id, customerId));
  if (!c || c.purgedAt) return null;
  const [k] = await db
    .select()
    .from(consent)
    .where(eq(consent.customerId, customerId))
    .orderBy(desc(consent.at))
    .limit(1);
  const { data } = await giftConfig(db);
  const since = new Date(now.getTime() - data.dupDays * 864e5);
  const recent = await db
    .select()
    .from(giftSend)
    .where(
      and(
        eq(giftSend.customerId, customerId),
        eq(giftSend.status, "sent"),
        gte(giftSend.sentAt, since),
      ),
    )
    .orderBy(desc(giftSend.sentAt));
  const complaints = await db
    .select({
      id: complaint.id,
      docNo: complaint.docNo,
      status: complaint.status,
    })
    .from(complaint)
    .where(eq(complaint.customerId, customerId))
    .orderBy(desc(complaint.createdAt));
  return {
    id: c.id,
    name: c.name,
    phoneMasked: c.phoneMasked,
    hasPhone: !!c.phoneEnc,
    required: !!k?.required && !k.withdrawal,
    marketing: !!k?.marketing && !k.withdrawal,
    recent,
    complaints,
    dupDays: data.dupDays,
  };
}

/** 이번 달 보낸 금액(취소 뺌) */
export async function monthSpent(db: Db, now = new Date()) {
  const ym = seoulDate(now).slice(0, 7);
  const from = new Date(`${ym}-01T00:00:00+09:00`);
  const [y, m] = ym.split("-").map(Number);
  const to = new Date(
    `${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, "0")}-01T00:00:00+09:00`,
  );
  const rows = await db
    .select({ price: giftSend.price })
    .from(giftSend)
    .where(
      and(
        eq(giftSend.status, "sent"),
        gte(giftSend.sentAt, from),
        lt(giftSend.sentAt, to),
      ),
    );
  return rows.reduce((a, r) => a + r.price, 0);
}

export type GiftInput = {
  customerId: string;
  purpose: string;
  reason: string;
  complaintId: string;
  goodsCode: string;
  message: string;
  dupOk: boolean;
};

export async function sendGift(
  db: Db,
  actor: Actor,
  input: GiftInput,
  now = new Date(),
  f: typeof fetch = fetch,
) {
  if (!can(actor, "gift.send"))
    throw new GiftError("기프티콘은 대표·공장장·상담 담당이 보냅니다");
  if (!(input.purpose in GIFT_PURPOSES))
    throw new GiftError("무엇 때문에 보내는지 골라 주세요");
  const purpose = input.purpose as GiftPurpose;
  if (!input.reason.trim())
    throw new GiftError("보내는 이유를 적어 주세요(예: 11월 후기 이벤트 당첨)");
  const t = await giftTarget(db, input.customerId, now);
  if (!t) throw new GiftError("고객을 찾을 수 없습니다");
  if (!t.hasPhone) throw new GiftError("고객 휴대폰 번호가 없습니다");
  if (!t.required)
    throw new GiftError(
      "개인정보 수집·이용 동의가 없는(또는 철회한) 고객에게는 보낼 수 없습니다",
    );
  if (NEEDS_MARKETING.includes(purpose) && !t.marketing)
    throw new GiftError(
      "이벤트 경품·감사 기프티콘은 광고 수신에 동의한 고객에게만 보냅니다(동의서 문구). 불만 보상이면 목적을 바꾸세요",
    );
  if (purpose === "complaint") {
    if (!can(actor, "complaint.compensate"))
      throw new GiftError("불만 보상 기프티콘은 대표가 보냅니다(보상 승인)");
    if (!t.complaints.some((c) => c.id === input.complaintId))
      throw new GiftError("어느 불만에 대한 보상인지 골라 주세요");
  }
  if (t.recent.length && !input.dupOk)
    throw new GiftError(
      `${t.dupDays}일 안에 이미 보낸 기프티콘이 있습니다(${t.recent[0].goodsName}). 그래도 보내려면 '중복 확인'을 고르세요`,
    );
  const { data, cfg } = await giftConfig(db);
  const goods = await giftGoods(db, f);
  const g = goods.list.find((x) => x.code === input.goodsCode);
  if (!g)
    throw new GiftError(
      goods.error
        ? `상품 목록을 가져오지 못했습니다: ${goods.error}`
        : "상품을 골라 주세요",
    );
  const owner = actor.roles.includes("owner");
  if (data.unitLimit && g.price > data.unitLimit && !owner)
    throw new GiftError(
      `건당 상한(${data.unitLimit.toLocaleString("ko-KR")}원)을 넘습니다. 대표에게 요청하세요`,
    );
  const spent = await monthSpent(db, now);
  if (data.monthLimit && spent + g.price > data.monthLimit)
    throw new GiftError(
      `이번 달 예산(${data.monthLimit.toLocaleString("ko-KR")}원)을 넘습니다. 지금까지 ${spent.toLocaleString("ko-KR")}원`,
    );
  if (data.provider !== "demo" && !data.callback)
    throw new GiftError("설정 › 기프티콘 공급사에 발신번호가 없습니다");
  const [c] = await db
    .select({ phoneEnc: customer.phoneEnc })
    .from(customer)
    .where(eq(customer.id, t.id));
  const phone = decrypt(c.phoneEnc!).replace(/\D/g, "");
  const docNo = await nextDocNo(db, "GF", now);
  const trId = `abs${docNo.replace(/\D/g, "")}${Math.random().toString(36).slice(2, 6)}`;
  const message = (
    input.message.trim() ||
    `${t.name}님, 외관수리 정비소입니다. ${GIFT_PURPOSES[purpose]}으로 작은 선물을 보내 드립니다. 감사합니다.`
  ).slice(0, 1000);
  let orderNo: string | null = null;
  let error: string | null = null;
  if (data.provider !== "demo") {
    try {
      orderNo = (
        await giftishowSend(
          cfg,
          {
            goodsCode: g.code,
            phone,
            trId,
            title: "외관수리 정비소 선물",
            message,
            callback: data.callback,
          },
          f,
        )
      ).orderNo;
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
  }
  const status = error ? "failed" : "sent";
  const [r] = await db
    .insert(giftSend)
    .values({
      docNo,
      customerId: t.id,
      customerName: t.name,
      toEnc: encrypt(phone),
      toMasked: maskPhone(phone),
      purpose,
      reason: input.reason.trim(),
      complaintId: purpose === "complaint" ? input.complaintId : null,
      goodsCode: g.code,
      goodsName: `${g.brand ? `${g.brand} ` : ""}${g.name}`,
      price: g.price,
      provider: data.provider,
      trId,
      orderNo,
      status,
      error,
      sentBy: actor.id,
      sentAt: now,
    })
    .returning({ id: giftSend.id });
  await db
    .insert(messageLog)
    .values({
      channel: "기프티콘",
      purpose: GIFT_PURPOSES[purpose],
      provider: data.provider,
      toEnc: encrypt(phone),
      toMasked: maskPhone(phone),
      customerName: t.name,
      body: `${g.name} · ${message}`,
      amount: g.price,
      status: error ? "실패" : "성공",
      error,
      ref: docNo,
      sentBy: actor.id,
      createdAt: now,
    });
  await writeAudit(db, {
    actorId: actor.id,
    action: "gift.send",
    entityType: "gift_send",
    entityId: docNo,
    after: { purpose, price: g.price, status },
  });
  if (error) throw new GiftError(`발송 실패(${docNo}): ${error}`);
  return { id: r.id, docNo, demo: data.provider === "demo", price: g.price };
}

/** 취소: 보낸 사람이나 대표. 쓰지 않은 쿠폰만 공급사에서 취소된다 */
export async function cancelGift(
  db: Db,
  actor: Actor,
  id: number,
  reason: string,
  now = new Date(),
  f: typeof fetch = fetch,
) {
  const [x] = await db.select().from(giftSend).where(eq(giftSend.id, id));
  if (!x) throw new GiftError("발송 기록을 찾을 수 없습니다");
  if (x.status !== "sent") throw new GiftError("보낸 상태인 것만 취소합니다");
  if (x.sentBy !== actor.id && !actor.roles.includes("owner"))
    throw new GiftError("보낸 사람이나 대표가 취소합니다");
  if (!reason.trim()) throw new GiftError("취소 이유를 적어 주세요");
  if (x.provider !== "demo") {
    const { cfg } = await giftConfig(db);
    try {
      await giftishowCancel(cfg, x.trId, f);
    } catch (e) {
      throw new GiftError(
        `공급사 취소 실패: ${e instanceof Error ? e.message : String(e)}. 이미 쓴 쿠폰은 취소되지 않습니다`,
      );
    }
  }
  await db
    .update(giftSend)
    .set({
      status: "cancelled",
      cancelledBy: actor.id,
      cancelledAt: now,
      cancelReason: reason.trim(),
    })
    .where(eq(giftSend.id, id));
  await writeAudit(db, {
    actorId: actor.id,
    action: "gift.cancel",
    entityType: "gift_send",
    entityId: x.docNo,
    after: { reason: reason.trim() },
  });
}

export async function listGifts(db: Db, ym: string) {
  const from = new Date(`${ym}-01T00:00:00+09:00`);
  const [y, m] = ym.split("-").map(Number);
  const to = new Date(
    `${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, "0")}-01T00:00:00+09:00`,
  );
  const rows = await db
    .select({ g: giftSend, by: appUser.name })
    .from(giftSend)
    .leftJoin(appUser, eq(appUser.id, giftSend.sentBy))
    .where(and(gte(giftSend.sentAt, from), lt(giftSend.sentAt, to)))
    .orderBy(desc(giftSend.sentAt));
  const sent = rows.filter((r) => r.g.status === "sent");
  const byPurpose = Object.fromEntries(
    (Object.keys(GIFT_PURPOSES) as GiftPurpose[]).map((p) => [
      p,
      sent.filter((r) => r.g.purpose === p).reduce((a, r) => a + r.g.price, 0),
    ]),
  );
  return {
    rows,
    total: sent.reduce((a, r) => a + r.g.price, 0),
    count: sent.length,
    byPurpose,
  };
}

/** 고객 찾기(이름·번호 끝 4자리) */
export async function findGiftCustomers(db: Db, q: string) {
  const s = q.trim();
  if (!s) return [];
  const rows = await db
    .select({
      id: customer.id,
      name: customer.name,
      phoneMasked: customer.phoneMasked,
      purgedAt: customer.purgedAt,
    })
    .from(customer)
    .limit(500);
  return rows
    .filter(
      (r) =>
        !r.purgedAt &&
        (r.name.includes(s) ||
          (/^\d{4}$/.test(s) && r.phoneMasked?.endsWith(s))),
    )
    .slice(0, 20);
}

export async function customerNames(db: Db, ids: string[]) {
  return new Map(
    (ids.length
      ? await db
          .select({ id: customer.id, name: customer.name })
          .from(customer)
          .where(inArray(customer.id, ids))
      : []
    ).map((c) => [c.id, c.name]),
  );
}
