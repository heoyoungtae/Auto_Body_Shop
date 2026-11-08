// 문자관리 설정·시험 발송·이력. 비밀 키는 암호화해 저장하고 화면에는 '저장됨' 여부만 돌려준다.
// 권한(대표) 확인은 화면 계층에서 한다.
import { desc, eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { appUser, messageLog, messagingConfig } from "@/db/schema";
import { decrypt, encrypt, maskPhone } from "@/modules/auth/crypto";
import { writeAudit } from "@/modules/platform/audit";
import { UserError } from "@/modules/platform/errors";
import { GIFT_PROVIDERS, giftishowBalance, isGiftProviderId, type GiftProviderId } from "./gift";
import { KAKAO_KEYS, KAKAO_TEMPLATES, renderKakao, SAMPLE_VARS, type KakaoKey } from "./kakao";
import { ADAPTERS, isProviderId, PROVIDER_IDS, PROVIDERS, type ProviderId } from "./providers";
import { digits, MOBILE_RE, SENDER_RE, smsKind } from "./rules";

export class MessagingError extends UserError {}

type Kind = "sms" | "kakao" | "gift";
type Secrets = Record<string, Record<string, string>>;

export type SmsData = { provider: ProviderId; sender: string; optout: string; checklist: Record<string, boolean>; fields: Record<string, Record<string, string>> };
export type KakaoData = { enabled: boolean; pfId: string; codes: Partial<Record<KakaoKey, string>> };
export type GiftData = { provider: GiftProviderId; callback: string; monthLimit: number; unitLimit: number; dupDays: number; checklist: Record<string, boolean>; fields: Record<string, Record<string, string>> };

const DEFAULTS = {
  sms: { provider: "demo", sender: "", optout: "", checklist: {}, fields: {} } as SmsData,
  kakao: { enabled: false, pfId: "", codes: {} } as KakaoData,
  gift: { provider: "demo", callback: "", monthLimit: 0, unitLimit: 0, dupDays: 30, checklist: {}, fields: {} } as GiftData,
};

async function load<K extends Kind>(db: Db, kind: K): Promise<{ data: (typeof DEFAULTS)[K]; secrets: Secrets; updatedAt: Date | null; updatedBy: string | null }> {
  const [row] = await db
    .select({ data: messagingConfig.data, secrets: messagingConfig.secrets, updatedAt: messagingConfig.updatedAt, updatedBy: appUser.name })
    .from(messagingConfig)
    .leftJoin(appUser, eq(appUser.id, messagingConfig.updatedBy))
    .where(eq(messagingConfig.kind, kind));
  const data = { ...DEFAULTS[kind], ...((row?.data as object) ?? {}) } as (typeof DEFAULTS)[K];
  let secrets: Secrets = {};
  if (row?.secrets) {
    try {
      secrets = JSON.parse(decrypt(row.secrets)) as Secrets;
    } catch {
      secrets = {}; // 키가 바뀌어 풀 수 없으면 다시 입력받는다
    }
  }
  return { data, secrets, updatedAt: row?.updatedAt ?? null, updatedBy: row?.updatedBy ?? null };
}

async function save(db: Db, actorId: string, kind: Kind, data: object, secrets: Secrets, audit: object) {
  const enc = Object.keys(secrets).length ? encrypt(JSON.stringify(secrets)) : null;
  await db.transaction(async (tx) => {
    await tx
      .insert(messagingConfig)
      .values({ kind, data, secrets: enc, updatedBy: actorId, updatedAt: new Date() })
      .onConflictDoUpdate({ target: messagingConfig.kind, set: { data, secrets: enc, updatedBy: actorId, updatedAt: new Date() } });
    // 비밀 값은 감사 로그에도 남기지 않는다
    await writeAudit(tx, { actorId, action: `messaging.${kind}.save`, entityType: "messaging", entityId: kind, after: audit });
  });
}

/** 공급사 칸 값: 비밀 칸은 비우면 그대로 둔다(화면에 다시 보여 주지 않으므로) */
function mergeFields(defs: { key: string; secret?: boolean }[], input: Record<string, string>, prevPlain: Record<string, string>, prevSecret: Record<string, string>) {
  const plain: Record<string, string> = {};
  const secret: Record<string, string> = {};
  for (const f of defs) {
    const v = (input[f.key] ?? "").trim();
    if (f.secret) {
      if (v) secret[f.key] = v;
      else if (prevSecret[f.key]) secret[f.key] = prevSecret[f.key];
    } else plain[f.key] = v || "";
    void prevPlain;
  }
  return { plain, secret };
}

const fieldView = (defs: { key: string; label: string; secret?: boolean }[], plain: Record<string, string> = {}, secret: Record<string, string> = {}) =>
  defs.map((f) => ({ ...f, value: f.secret ? "" : (plain[f.key] ?? ""), saved: f.secret ? !!secret[f.key] : !!plain[f.key] }));

async function log(db: Db, e: { channel: string; purpose: string; provider: string; to: string; body: string; ok: boolean; error?: string; sentBy: string | null; amount?: number; ref?: string; customerName?: string }) {
  await db.insert(messageLog).values({
    channel: e.channel,
    purpose: e.purpose,
    provider: e.provider,
    toEnc: encrypt(e.to),
    toMasked: maskPhone(e.to),
    body: e.body,
    amount: e.amount ?? null,
    status: e.ok ? "성공" : "실패",
    error: e.error ?? null,
    ref: e.ref ?? null,
    customerName: e.customerName ?? null,
    sentBy: e.sentBy,
  });
}

function mobile(to: string) {
  const d = digits(to);
  if (!MOBILE_RE.test(d)) throw new MessagingError("받을 휴대폰 번호를 확인해 주세요(예: 010-1234-5678)");
  return d;
}

// ── 문자 발송 서비스 ──
export async function smsOverview(db: Db) {
  const { data, secrets, updatedAt, updatedBy } = await load(db, "sms");
  return {
    current: data.provider,
    sender: data.sender,
    optout: data.optout,
    checklist: data.checklist,
    updatedAt,
    updatedBy,
    providers: PROVIDER_IDS.map((id) => ({ id, ...PROVIDERS[id], fields: fieldView(PROVIDERS[id].fields, data.fields[id], secrets[id]) })),
  };
}

export async function saveSms(db: Db, actorId: string, input: { provider: string; sender: string; optout: string; fields: Record<string, string>; checklist: string[] }) {
  if (!isProviderId(input.provider)) throw new MessagingError("문자 서비스를 골라 주세요");
  const sender = digits(input.sender);
  if (sender && !SENDER_RE.test(sender)) throw new MessagingError("발신번호는 숫자 8~12자리로 적어 주세요(예: 0212345678, 15881234)");
  if (input.provider !== "demo" && !sender) throw new MessagingError("실제 발송에는 대행사에 등록·승인된 발신번호가 필요합니다");
  const optout = input.optout.trim();
  if (optout && !/^\d{2,4}-?\d{3,4}-?\d{4}$/.test(optout)) throw new MessagingError("무료수신거부 번호 형식을 확인해 주세요(예: 080-123-4567)");
  const prev = await load(db, "sms");
  const defs = PROVIDERS[input.provider].fields;
  const { plain, secret } = mergeFields(defs, input.fields, prev.data.fields[input.provider] ?? {}, prev.secrets[input.provider] ?? {});
  const missing = defs.filter((f) => !(f.secret ? secret[f.key] : plain[f.key]));
  if (missing.length) throw new MessagingError(`${PROVIDERS[input.provider].label}: ${missing.map((f) => f.label).join(", ")}을(를) 적어 주세요`);
  const data: SmsData = { provider: input.provider, sender, optout, checklist: Object.fromEntries(input.checklist.map((k) => [k, true])), fields: { ...prev.data.fields, [input.provider]: plain } };
  await save(db, actorId, "sms", data, { ...prev.secrets, [input.provider]: secret }, { provider: input.provider, sender, optout, checklist: input.checklist });
}

async function smsRuntime(db: Db) {
  const { data, secrets } = await load(db, "sms");
  return { id: data.provider, cfg: { ...(data.fields[data.provider] ?? {}), ...(secrets[data.provider] ?? {}) }, sender: data.sender };
}

export async function smsTest(db: Db, actorId: string, toRaw: string, f: typeof fetch = fetch) {
  const to = mobile(toRaw);
  const p = await smsRuntime(db);
  const text = `[외관수리 정비소] 문자 연결 시험입니다. (${PROVIDERS[p.id].label})`;
  const [r] = await ADAPTERS[p.id].send(p.cfg, p.sender, [{ to, text, kind: smsKind(text), subject: "연결 시험" }], f);
  await log(db, { channel: smsKind(text), purpose: "시험", provider: p.id, to, body: text, ok: r.ok, error: r.error, sentBy: actorId });
  return { ...r, demo: p.id === "demo" };
}

export async function smsBalance(db: Db, f: typeof fetch = fetch) {
  const p = await smsRuntime(db);
  const b = ADAPTERS[p.id].balance;
  if (!b) throw new MessagingError(`${PROVIDERS[p.id].label}는 잔액 조회를 지원하지 않습니다. 대행사 콘솔에서 확인하세요`);
  try {
    return await b(p.cfg, f);
  } catch (e) {
    throw new MessagingError(`잔액 조회 실패: ${e instanceof Error ? e.message : String(e)}`);
  }
}

// ── 카카오 알림톡 ──
export async function kakaoOverview(db: Db) {
  const { data, updatedAt, updatedBy } = await load(db, "kakao");
  const sms = await load(db, "sms");
  const pid = sms.data.provider;
  const supported = pid === "demo" || !!PROVIDERS[pid].kakao;
  const ready = (k: KakaoKey) => data.enabled && supported && (pid === "demo" || !!(data.pfId && data.codes[k]));
  return {
    enabled: data.enabled,
    pfId: data.pfId,
    provider: pid,
    providerLabel: PROVIDERS[pid].label,
    supported,
    updatedAt,
    updatedBy,
    templates: KAKAO_KEYS.map((key) => ({ key, ...KAKAO_TEMPLATES[key], code: data.codes[key] ?? "", ready: ready(key) })),
  };
}

export async function saveKakao(db: Db, actorId: string, input: { enabled: boolean; pfId: string; codes: Record<string, string> }) {
  const codes: Partial<Record<KakaoKey, string>> = {};
  for (const k of KAKAO_KEYS) {
    const v = (input.codes[k] ?? "").trim();
    if (v.length > 100) throw new MessagingError(`${KAKAO_TEMPLATES[k].title}: 템플릿 코드가 너무 깁니다`);
    if (v) codes[k] = v;
  }
  const data: KakaoData = { enabled: input.enabled, pfId: input.pfId.trim(), codes };
  if (data.enabled) {
    const sms = await load(db, "sms");
    if (sms.data.provider !== "demo" && !PROVIDERS[sms.data.provider].kakao) throw new MessagingError(`${PROVIDERS[sms.data.provider].label}는 알림톡을 지원하지 않습니다. 문자 발송 서비스를 솔라피로 바꾼 뒤 켜 주세요`);
    if (sms.data.provider !== "demo" && !data.pfId) throw new MessagingError("알림톡을 켜려면 발신 프로필 ID 가 필요합니다");
  }
  await save(db, actorId, "kakao", data, {}, data);
}

export async function kakaoTest(db: Db, actorId: string, key: string, toRaw: string, f: typeof fetch = fetch) {
  if (!(KAKAO_KEYS as string[]).includes(key)) throw new MessagingError("템플릿을 골라 주세요");
  const k = key as KakaoKey;
  const to = mobile(toRaw);
  const { data } = await load(db, "kakao");
  const p = await smsRuntime(db);
  const send = ADAPTERS[p.id].sendKakao;
  if (!send) throw new MessagingError(`${PROVIDERS[p.id].label}는 알림톡을 지원하지 않습니다`);
  if (p.id !== "demo" && !(data.pfId && data.codes[k])) throw new MessagingError("발신 프로필 ID 와 이 템플릿의 코드를 먼저 저장해 주세요");
  const vars = SAMPLE_VARS;
  const text = renderKakao(k, vars);
  const [r] = await send(p.cfg, p.sender, [{ to, text, subject: "외관수리 정비소", pfId: data.pfId, templateId: data.codes[k] ?? "DEMO", variables: Object.fromEntries(Object.entries(vars).map(([a, b]) => [`#{${a}}`, b])) }], f);
  await log(db, { channel: "알림톡", purpose: "시험", provider: p.id, to, body: text, ok: r.ok, error: r.error, sentBy: actorId });
  return { ...r, demo: p.id === "demo" };
}

// ── 기프티콘 공급사 ──
export async function giftOverview(db: Db) {
  const { data, secrets, updatedAt, updatedBy } = await load(db, "gift");
  const ids = Object.keys(GIFT_PROVIDERS) as GiftProviderId[];
  return { ...data, fields: undefined, updatedAt, updatedBy, providers: ids.map((id) => ({ id, ...GIFT_PROVIDERS[id], fields: fieldView(GIFT_PROVIDERS[id].fields, data.fields[id], secrets[id]) })) };
}

export async function saveGift(db: Db, actorId: string, input: { provider: string; callback: string; monthLimit: number; unitLimit: number; dupDays: number; fields: Record<string, string>; checklist: string[] }) {
  if (!isGiftProviderId(input.provider)) throw new MessagingError("기프티콘 공급사를 골라 주세요");
  const callback = digits(input.callback);
  if (callback && !SENDER_RE.test(callback)) throw new MessagingError("발신번호는 숫자 8~12자리로 적어 주세요(예: 15886474)");
  if (input.provider !== "demo" && !callback) throw new MessagingError("실제 발송에는 공급사에 등록된 발신번호가 필요합니다");
  for (const [v, label, max] of [
    [input.monthLimit, "월 예산 한도", 1e9],
    [input.unitLimit, "건당 상한", 1e7],
    [input.dupDays, "중복 확인 기간", 3650],
  ] as const) {
    if (!Number.isInteger(v) || v < 0 || v > max) throw new MessagingError(`${label}을(를) 확인해 주세요`);
  }
  if (input.monthLimit && input.unitLimit > input.monthLimit) throw new MessagingError("건당 상한이 월 예산보다 큽니다");
  const prev = await load(db, "gift");
  const defs = GIFT_PROVIDERS[input.provider].fields;
  const { plain, secret } = mergeFields(defs, input.fields, prev.data.fields[input.provider] ?? {}, prev.secrets[input.provider] ?? {});
  const missing = defs.filter((f) => !(f.secret ? secret[f.key] : plain[f.key]));
  if (missing.length) throw new MessagingError(`${GIFT_PROVIDERS[input.provider].label}: ${missing.map((f) => f.label).join(", ")}을(를) 적어 주세요`);
  const data: GiftData = {
    provider: input.provider,
    callback,
    monthLimit: input.monthLimit,
    unitLimit: input.unitLimit,
    dupDays: input.dupDays,
    checklist: Object.fromEntries(input.checklist.map((k) => [k, true])),
    fields: { ...prev.data.fields, [input.provider]: plain },
  };
  await save(db, actorId, "gift", data, { ...prev.secrets, [input.provider]: secret }, { ...data, fields: undefined });
}

export async function giftBalance(db: Db, f: typeof fetch = fetch): Promise<string> {
  const { data, secrets } = await load(db, "gift");
  if (data.provider === "demo") return "데모 모드: 실제 비즈머니가 없습니다";
  try {
    const n = await giftishowBalance({ ...(data.fields.giftishow ?? {}), ...(secrets.giftishow ?? {}) }, f);
    return `비즈머니 ${n.toLocaleString("ko-KR")}원`;
  } catch (e) {
    throw new MessagingError(`비즈머니 조회 실패: ${e instanceof Error ? e.message : String(e)}`);
  }
}

// ── 발송 이력 ──
export async function listLogs(db: Db, limit = 200) {
  return db
    .select({
      id: messageLog.id,
      channel: messageLog.channel,
      purpose: messageLog.purpose,
      provider: messageLog.provider,
      to: messageLog.toMasked,
      customerName: messageLog.customerName,
      body: messageLog.body,
      amount: messageLog.amount,
      status: messageLog.status,
      error: messageLog.error,
      sentBy: appUser.name,
      createdAt: messageLog.createdAt,
    })
    .from(messageLog)
    .leftJoin(appUser, eq(appUser.id, messageLog.sentBy))
    .orderBy(desc(messageLog.createdAt))
    .limit(limit);
}

// ── 고객 안내 발송(상담·예약·견적·출고 화면과 주기 작업이 쓴다) ──
export const SHOP_NAME = "외관수리 정비소";

/** 전화번호를 보기 좋게: 0212345678 → 02-1234-5678, 15881234 → 1588-1234 */
export function formatPhone(raw: string): string {
  const d = digits(raw);
  if (d.length === 8) return `${d.slice(0, 4)}-${d.slice(4)}`;
  if (d.startsWith("02")) return d.length === 9 ? `02-${d.slice(2, 5)}-${d.slice(5)}` : `02-${d.slice(2, 6)}-${d.slice(6)}`;
  if (d.length === 10) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  if (d.length === 11) return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
  return raw;
}

export type NoticeResult = { ok: boolean; channel: string; error?: string; demo: boolean; text: string };

/**
 * 정보성 안내 1건. 알림톡이 준비된 템플릿이면 알림톡으로, 아니면 같은 문구를 문자로 보낸다(설정 › 카카오 알림톡).
 * 업체명·업체전화는 여기서 채우므로 부르는 쪽은 고객·건 값만 넘긴다(중복 입력 없음).
 */
export async function sendNotice(
  db: Db,
  e: { key: KakaoKey; to: string; vars: Record<string, string>; purpose: string; customerName?: string; ref?: string; sentBy: string | null },
  f: typeof fetch = fetch,
): Promise<NoticeResult> {
  const to = mobile(e.to);
  const p = await smsRuntime(db);
  const vars = { 업체명: SHOP_NAME, 업체전화: p.sender ? formatPhone(p.sender) : "정비소", ...e.vars };
  const text = renderKakao(e.key, vars);
  const kakao = await kakaoOverview(db);
  const ready = kakao.templates.find((t) => t.key === e.key)?.ready;
  const sendKakao = ADAPTERS[p.id].sendKakao;
  let r: { ok: boolean; error?: string };
  let channel: string;
  if (ready && sendKakao) {
    const { data } = await load(db, "kakao");
    channel = "알림톡";
    [r] = await sendKakao(p.cfg, p.sender, [{ to, text, subject: SHOP_NAME, pfId: data.pfId, templateId: data.codes[e.key] ?? "DEMO", variables: Object.fromEntries(Object.entries(vars).map(([a, b]) => [`#{${a}}`, b])) }], f);
  } else {
    channel = smsKind(text);
    [r] = await ADAPTERS[p.id].send(p.cfg, p.sender, [{ to, text, kind: smsKind(text), subject: KAKAO_TEMPLATES[e.key].title }], f);
  }
  await log(db, { channel, purpose: e.purpose, provider: p.id, to, body: text, ok: r.ok, error: r.error, sentBy: e.sentBy, ref: e.ref, customerName: e.customerName });
  return { ok: r.ok, error: r.error, channel, demo: p.id === "demo", text };
}
