// 문자관리 설정·시험 발송·이력. 비밀 키는 암호화해 저장하고 화면에는 '저장됨' 여부만 돌려준다.
// 권한(대표) 확인은 화면 계층에서 한다.
import { featureOff } from "@/modules/platform/features";
import { APP_NAME } from "@/modules/platform/brand";
import { desc, eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { appUser, messageLog, messagingConfig } from "@/db/schema";
import { decrypt, encrypt, maskPhone } from "@/modules/auth/crypto";
import { writeAudit } from "@/modules/platform/audit";
import { UserError } from "@/modules/platform/errors";
import { loadPolicy } from "@/modules/platform/policy";
import { seoulDate } from "@/modules/platform/time";
import {
  GIFT_ID_RE,
  GIFT_IMAGE_KINDS,
  GIFT_PROVIDERS,
  GIFT_MSG_MAX,
  GIFT_TITLE_MAX,
  giftishowBalance,
  isGiftProviderId,
  MAX_GIFT_IMAGE_BYTES,
  type GiftImageKind,
  type GiftProviderId,
} from "./gift";
import {
  IMAGE_TYPES,
  removeStored,
  sniffImage,
  storeFile,
} from "@/modules/platform/storage";
import {
  KAKAO_KEYS,
  kakaoTextMark,
  KAKAO_TEMPLATES,
  renderKakao,
  SAMPLE_VARS,
  type KakaoKey,
} from "./kakao";
import {
  ADAPTERS,
  isProviderId,
  PROVIDER_IDS,
  PROVIDERS,
  type ProviderId,
} from "./providers";
import { digits, MOBILE_RE, SENDER_RE, smsKind } from "./rules";

export class MessagingError extends UserError {}

type Kind = "sms" | "kakao" | "gift";
type Secrets = Record<string, Record<string, string>>;

export type SmsData = {
  provider: ProviderId;
  sender: string;
  optout: string;
  checklist: Record<string, boolean>;
  fields: Record<string, Record<string, string>>;
};
export type KakaoData = {
  enabled: boolean;
  pfId: string;
  codes: Partial<Record<KakaoKey, string>>;
  /** 대표가 '이 문구로 카카오 검수 받음'이라 표시한 문구의 표시값(kakaoTextMark). 문구가 바뀌면 다시 검수 */
  reviewed?: Partial<Record<KakaoKey, string>>;
};
export type GiftImage = {
  path: string;
  fileName: string;
  updatedAt: string;
};
export type GiftData = {
  provider: GiftProviderId;
  callback: string;
  /** 문자 제목(20자까지). 비우면 '앱 이름 선물' */
  title: string;
  /** 기본 문구({고객}·{목적}·{가게}). 비우면 앱 기본 문구 */
  defaultMessage: string;
  /** 기프티쇼 비즈 카드 아이디(template_id)·배너 아이디(banner_id). 비우면 공급사 기본 모양 */
  templateId: string;
  bannerId: string;
  /** 미리보기용 카드·배너 그림(공급사에 올린 것과 같은 그림) */
  images: Partial<Record<GiftImageKind, GiftImage>>;
  monthLimit: number;
  unitLimit: number;
  dupDays: number;
  checklist: Record<string, boolean>;
  fields: Record<string, Record<string, string>>;
};

const DEFAULTS = {
  sms: {
    provider: "demo",
    sender: "",
    optout: "",
    checklist: {},
    fields: {},
  } as SmsData,
  kakao: { enabled: false, pfId: "", codes: {} } as KakaoData,
  gift: {
    provider: "demo",
    callback: "",
    title: "",
    defaultMessage: "",
    templateId: "",
    bannerId: "",
    images: {},
    monthLimit: 0,
    unitLimit: 0,
    dupDays: 30,
    checklist: {},
    fields: {},
  } as GiftData,
};

async function load<K extends Kind>(
  db: Db,
  kind: K,
): Promise<{
  data: (typeof DEFAULTS)[K];
  secrets: Secrets;
  updatedAt: Date | null;
  updatedBy: string | null;
}> {
  const [row] = await db
    .select({
      data: messagingConfig.data,
      secrets: messagingConfig.secrets,
      updatedAt: messagingConfig.updatedAt,
      updatedBy: appUser.name,
    })
    .from(messagingConfig)
    .leftJoin(appUser, eq(appUser.id, messagingConfig.updatedBy))
    .where(eq(messagingConfig.kind, kind));
  const data = {
    ...DEFAULTS[kind],
    ...((row?.data as object) ?? {}),
  } as (typeof DEFAULTS)[K];
  let secrets: Secrets = {};
  if (row?.secrets) {
    try {
      secrets = JSON.parse(decrypt(row.secrets)) as Secrets;
    } catch {
      secrets = {}; // 키가 바뀌어 풀 수 없으면 다시 입력받는다
    }
  }
  return {
    data,
    secrets,
    updatedAt: row?.updatedAt ?? null,
    updatedBy: row?.updatedBy ?? null,
  };
}

async function save(
  db: Db,
  actorId: string,
  kind: Kind,
  data: object,
  secrets: Secrets,
  audit: object,
) {
  const enc = Object.keys(secrets).length
    ? encrypt(JSON.stringify(secrets))
    : null;
  await db.transaction(async (tx) => {
    await tx
      .insert(messagingConfig)
      .values({
        kind,
        data,
        secrets: enc,
        updatedBy: actorId,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: messagingConfig.kind,
        set: { data, secrets: enc, updatedBy: actorId, updatedAt: new Date() },
      });
    // 비밀 값은 감사 로그에도 남기지 않는다
    await writeAudit(tx, {
      actorId,
      action: `messaging.${kind}.save`,
      entityType: "messaging",
      entityId: kind,
      after: audit,
    });
  });
}

/** 공급사 칸 값: 비밀 칸은 비우면 그대로 둔다(화면에 다시 보여 주지 않으므로) */
function mergeFields(
  defs: { key: string; secret?: boolean }[],
  input: Record<string, string>,
  prevPlain: Record<string, string>,
  prevSecret: Record<string, string>,
) {
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

const fieldView = (
  defs: { key: string; label: string; secret?: boolean }[],
  plain: Record<string, string> = {},
  secret: Record<string, string> = {},
) =>
  defs.map((f) => ({
    ...f,
    value: f.secret ? "" : (plain[f.key] ?? ""),
    saved: f.secret ? !!secret[f.key] : !!plain[f.key],
  }));

async function log(
  db: Db,
  e: {
    channel: string;
    purpose: string;
    provider: string;
    to: string;
    body: string;
    ok: boolean;
    error?: string;
    sentBy: string | null;
    amount?: number;
    ref?: string;
    customerName?: string;
  },
) {
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
  if (!MOBILE_RE.test(d))
    throw new MessagingError(
      "받을 휴대폰 번호를 확인해 주세요(예: 010-1234-5678)",
    );
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
    providers: PROVIDER_IDS.map((id) => ({
      id,
      ...PROVIDERS[id],
      fields: fieldView(PROVIDERS[id].fields, data.fields[id], secrets[id]),
    })),
  };
}

export async function saveSms(
  db: Db,
  actorId: string,
  input: {
    provider: string;
    sender: string;
    optout: string;
    fields: Record<string, string>;
    checklist: string[];
  },
) {
  if (!isProviderId(input.provider))
    throw new MessagingError("문자 서비스를 골라 주세요");
  const sender = digits(input.sender);
  if (sender && !SENDER_RE.test(sender))
    throw new MessagingError(
      "발신번호는 숫자 8~12자리로 적어 주세요(예: 0212345678, 15881234)",
    );
  if (input.provider !== "demo" && !sender)
    throw new MessagingError(
      "실제 발송에는 대행사에 등록·승인된 발신번호가 필요합니다",
    );
  const optout = input.optout.trim();
  if (optout && !/^\d{2,4}-?\d{3,4}-?\d{4}$/.test(optout))
    throw new MessagingError(
      "무료수신거부 번호 형식을 확인해 주세요(예: 080-123-4567)",
    );
  const prev = await load(db, "sms");
  const defs = PROVIDERS[input.provider].fields;
  const { plain, secret } = mergeFields(
    defs,
    input.fields,
    prev.data.fields[input.provider] ?? {},
    prev.secrets[input.provider] ?? {},
  );
  const missing = defs.filter(
    (f) => !(f.secret ? secret[f.key] : plain[f.key]),
  );
  if (missing.length)
    throw new MessagingError(
      `${PROVIDERS[input.provider].label}: ${missing.map((f) => f.label).join(", ")}을(를) 적어 주세요`,
    );
  const data: SmsData = {
    provider: input.provider,
    sender,
    optout,
    checklist: Object.fromEntries(input.checklist.map((k) => [k, true])),
    fields: { ...prev.data.fields, [input.provider]: plain },
  };
  await save(
    db,
    actorId,
    "sms",
    data,
    { ...prev.secrets, [input.provider]: secret },
    { provider: input.provider, sender, optout, checklist: input.checklist },
  );
}

async function smsRuntime(db: Db) {
  const { data, secrets } = await load(db, "sms");
  return {
    id: data.provider,
    cfg: {
      ...(data.fields[data.provider] ?? {}),
      ...(secrets[data.provider] ?? {}),
    },
    sender: data.sender,
  };
}

export async function smsTest(
  db: Db,
  actorId: string,
  toRaw: string,
  f: typeof fetch = fetch,
) {
  const to = mobile(toRaw);
  const p = await smsRuntime(db);
  const text = `[${SHOP_NAME}] 문자 연결 시험입니다. (${PROVIDERS[p.id].label})`;
  const [r] = await ADAPTERS[p.id].send(
    p.cfg,
    p.sender,
    [{ to, text, kind: smsKind(text), subject: "연결 시험" }],
    f,
  );
  await log(db, {
    channel: smsKind(text),
    purpose: "시험",
    provider: p.id,
    to,
    body: text,
    ok: r.ok,
    error: r.error,
    sentBy: actorId,
  });
  return { ...r, demo: p.id === "demo" };
}

export async function smsBalance(db: Db, f: typeof fetch = fetch) {
  const p = await smsRuntime(db);
  const b = ADAPTERS[p.id].balance;
  if (!b)
    throw new MessagingError(
      `${PROVIDERS[p.id].label}는 잔액 조회를 지원하지 않습니다. 대행사 콘솔에서 확인하세요`,
    );
  try {
    return await b(p.cfg, f);
  } catch (e) {
    throw new MessagingError(
      `잔액 조회 실패: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
}

// ── 카카오 알림톡 ──
export async function kakaoOverview(db: Db) {
  const { data, updatedAt, updatedBy } = await load(db, "kakao");
  const sms = await load(db, "sms");
  const pid = sms.data.provider;
  const supported = pid === "demo" || !!PROVIDERS[pid].kakao;
  const ready = (k: KakaoKey) =>
    data.enabled &&
    supported &&
    (pid === "demo" || !!(data.pfId && data.codes[k]));
  return {
    enabled: data.enabled,
    pfId: data.pfId,
    provider: pid,
    providerLabel: PROVIDERS[pid].label,
    supported,
    updatedAt,
    updatedBy,
    templates: KAKAO_KEYS.map((key) => ({
      key,
      ...KAKAO_TEMPLATES[key],
      code: data.codes[key] ?? "",
      ready: ready(key),
      review: (data.reviewed?.[key] === kakaoTextMark(key) ? "ok" : data.reviewed?.[key] ? "changed" : "none") as "ok" | "changed" | "none",
    })),
  };
}

export async function saveKakao(
  db: Db,
  actorId: string,
  input: { enabled: boolean; pfId: string; codes: Record<string, string>; reviewed?: string[] },
) {
  const codes: Partial<Record<KakaoKey, string>> = {};
  for (const k of KAKAO_KEYS) {
    const v = (input.codes[k] ?? "").trim();
    if (v.length > 100)
      throw new MessagingError(
        `${KAKAO_TEMPLATES[k].title}: 템플릿 코드가 너무 깁니다`,
      );
    if (v) codes[k] = v;
  }
  const data: KakaoData = {
    enabled: input.enabled,
    pfId: input.pfId.trim(),
    codes,
    reviewed: Object.fromEntries(KAKAO_KEYS.filter((k) => input.reviewed?.includes(k)).map((k) => [k, kakaoTextMark(k)])),
  };
  if (data.enabled) {
    const sms = await load(db, "sms");
    if (sms.data.provider !== "demo" && !PROVIDERS[sms.data.provider].kakao)
      throw new MessagingError(
        `${PROVIDERS[sms.data.provider].label}는 알림톡을 지원하지 않습니다. 문자 발송 서비스를 솔라피로 바꾼 뒤 켜 주세요`,
      );
    if (sms.data.provider !== "demo" && !data.pfId)
      throw new MessagingError("알림톡을 켜려면 발신 프로필 ID 가 필요합니다");
  }
  await save(db, actorId, "kakao", data, {}, data);
}

export async function kakaoTest(
  db: Db,
  actorId: string,
  key: string,
  toRaw: string,
  f: typeof fetch = fetch,
) {
  if (!(KAKAO_KEYS as string[]).includes(key))
    throw new MessagingError("템플릿을 골라 주세요");
  const k = key as KakaoKey;
  const to = mobile(toRaw);
  const { data } = await load(db, "kakao");
  const p = await smsRuntime(db);
  const send = ADAPTERS[p.id].sendKakao;
  if (!send)
    throw new MessagingError(
      `${PROVIDERS[p.id].label}는 알림톡을 지원하지 않습니다`,
    );
  if (p.id !== "demo" && !(data.pfId && data.codes[k]))
    throw new MessagingError(
      "발신 프로필 ID 와 이 템플릿의 코드를 먼저 저장해 주세요",
    );
  const vars = SAMPLE_VARS;
  const text = renderKakao(k, vars);
  const [r] = await send(
    p.cfg,
    p.sender,
    [
      {
        to,
        text,
        subject: SHOP_NAME,
        pfId: data.pfId,
        templateId: data.codes[k] ?? "DEMO",
        variables: Object.fromEntries(
          Object.entries(vars).map(([a, b]) => [`#{${a}}`, b]),
        ),
      },
    ],
    f,
  );
  await log(db, {
    channel: "알림톡",
    purpose: "시험",
    provider: p.id,
    to,
    body: text,
    ok: r.ok,
    error: r.error,
    sentBy: actorId,
  });
  return { ...r, demo: p.id === "demo" };
}

// ── 기프티콘 공급사 ──
/** 발송 모듈이 쓰는 설정과 비밀 키(화면에 내려보내지 않는다) */
export async function giftConfig(db: Db) {
  const { data, secrets } = await load(db, "gift");
  return {
    data,
    cfg: { ...(data.fields.giftishow ?? {}), ...(secrets.giftishow ?? {}) },
  };
}

export async function giftOverview(db: Db) {
  const { data, secrets, updatedAt, updatedBy } = await load(db, "gift");
  const ids = Object.keys(GIFT_PROVIDERS) as GiftProviderId[];
  return {
    ...data,
    fields: undefined,
    updatedAt,
    updatedBy,
    providers: ids.map((id) => ({
      id,
      ...GIFT_PROVIDERS[id],
      fields: fieldView(
        GIFT_PROVIDERS[id].fields,
        data.fields[id],
        secrets[id],
      ),
    })),
  };
}

export async function saveGift(
  db: Db,
  actorId: string,
  input: {
    provider: string;
    callback: string;
    title?: string;
    defaultMessage?: string;
    templateId?: string;
    bannerId?: string;
    monthLimit: number;
    unitLimit: number;
    dupDays: number;
    fields: Record<string, string>;
    checklist: string[];
  },
) {
  if (!isGiftProviderId(input.provider))
    throw new MessagingError("기프티콘 공급사를 골라 주세요");
  const callback = digits(input.callback);
  if (callback && !SENDER_RE.test(callback))
    throw new MessagingError(
      "발신번호는 숫자 8~12자리로 적어 주세요(예: 15886474)",
    );
  if (input.provider !== "demo" && !callback)
    throw new MessagingError(
      "실제 발송에는 공급사에 등록된 발신번호가 필요합니다",
    );
  const title = (input.title ?? "").trim();
  if (title.length > GIFT_TITLE_MAX)
    throw new MessagingError(
      `문자 제목은 ${GIFT_TITLE_MAX}자까지입니다(지금 ${title.length}자)`,
    );
  const defaultMessage = (input.defaultMessage ?? "").trim();
  if (defaultMessage.length > GIFT_MSG_MAX)
    throw new MessagingError(
      `기본 문구는 ${GIFT_MSG_MAX}자까지입니다(기프티쇼 비즈는 문자 본문을 ${GIFT_MSG_MAX}자까지만 보냄)`,
    );
  const templateId = (input.templateId ?? "").replace(/\s/g, "");
  const bannerId = (input.bannerId ?? "").replace(/\s/g, "");
  for (const [v, label] of [
    [templateId, "카드 아이디"],
    [bannerId, "배너 아이디"],
  ] as const)
    if (v && !GIFT_ID_RE.test(v))
      throw new MessagingError(
        `${label}는 기프티쇼 비즈 [오픈API > 서비스 관리]에 나온 번호를 그대로 적어 주세요(예: 202006010058067)`,
      );
  for (const [v, label, max] of [
    [input.monthLimit, "월 예산 한도", 1e9],
    [input.unitLimit, "건당 상한", 1e7],
    [input.dupDays, "중복 확인 기간", 3650],
  ] as const) {
    if (!Number.isInteger(v) || v < 0 || v > max)
      throw new MessagingError(`${label}을(를) 확인해 주세요`);
  }
  if (input.monthLimit && input.unitLimit > input.monthLimit)
    throw new MessagingError("건당 상한이 월 예산보다 큽니다");
  const prev = await load(db, "gift");
  const defs = GIFT_PROVIDERS[input.provider].fields;
  const { plain, secret } = mergeFields(
    defs,
    input.fields,
    prev.data.fields[input.provider] ?? {},
    prev.secrets[input.provider] ?? {},
  );
  const missing = defs.filter(
    (f) => !(f.secret ? secret[f.key] : plain[f.key]),
  );
  if (missing.length)
    throw new MessagingError(
      `${GIFT_PROVIDERS[input.provider].label}: ${missing.map((f) => f.label).join(", ")}을(를) 적어 주세요`,
    );
  const data: GiftData = {
    ...prev.data,
    provider: input.provider,
    callback,
    title,
    defaultMessage,
    templateId,
    bannerId,
    monthLimit: input.monthLimit,
    unitLimit: input.unitLimit,
    dupDays: input.dupDays,
    checklist: Object.fromEntries(input.checklist.map((k) => [k, true])),
    fields: { ...prev.data.fields, [input.provider]: plain },
  };
  await save(
    db,
    actorId,
    "gift",
    data,
    { ...prev.secrets, [input.provider]: secret },
    { ...data, fields: undefined },
  );
}

/** 미리보기용 카드·배너 그림 올리기(file 있음) 또는 빼기(file 없음). 권한(대표)은 화면 계층에서 */
export async function saveGiftImage(
  db: Db,
  actorId: string,
  kind: GiftImageKind,
  file: { bytes: Uint8Array; fileName: string } | null,
  now = new Date(),
) {
  if (!(GIFT_IMAGE_KINDS as readonly string[]).includes(kind))
    throw new MessagingError("어느 그림인지 알 수 없습니다");
  const prev = await load(db, "gift");
  const images = { ...(prev.data.images ?? {}) };
  const old = images[kind]?.path;
  if (file) {
    if (!file.bytes.length)
      throw new MessagingError("올릴 그림 파일을 골라 주세요");
    if (file.bytes.length > MAX_GIFT_IMAGE_BYTES)
      throw new MessagingError(
        "그림이 500KB보다 큽니다. 기프티쇼 규격(배너 700×280, 카드 330×330)으로 줄여 다시 저장해 주세요",
      );
    const type = sniffImage(file.bytes);
    if (!type)
      throw new MessagingError("PNG·JPG·WEBP 그림 파일만 받습니다");
    const path = await storeFile("gift", file.bytes, IMAGE_TYPES[type]);
    images[kind] = {
      path,
      fileName: file.fileName.slice(0, 120),
      updatedAt: now.toISOString(),
    };
  } else delete images[kind];
  const data: GiftData = { ...prev.data, images };
  await save(db, actorId, "gift", data, prev.secrets, {
    ...data,
    fields: undefined,
  });
  if (old && old !== images[kind]?.path)
    await removeStored(old).catch(() => {});
}

export async function giftBalance(
  db: Db,
  f: typeof fetch = fetch,
): Promise<string> {
  const { data, secrets } = await load(db, "gift");
  if (data.provider === "demo") return "데모 모드: 실제 비즈머니가 없습니다";
  try {
    const n = await giftishowBalance(
      { ...(data.fields.giftishow ?? {}), ...(secrets.giftishow ?? {}) },
      f,
    );
    return `비즈머니 ${n.toLocaleString("ko-KR")}원`;
  } catch (e) {
    throw new MessagingError(
      `비즈머니 조회 실패: ${e instanceof Error ? e.message : String(e)}`,
    );
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
/** 문자·알림톡의 업체명(앱 이름과 같다). 손님 화면처럼 사업장 정보가 있으면 그 상호를 먼저 쓴다 */
export const SHOP_NAME = APP_NAME;

/** 전화번호를 보기 좋게: 0212345678 → 02-1234-5678, 15881234 → 1588-1234 */
export function formatPhone(raw: string): string {
  const d = digits(raw);
  if (d.length === 8) return `${d.slice(0, 4)}-${d.slice(4)}`;
  if (d.startsWith("02"))
    return d.length === 9
      ? `02-${d.slice(2, 5)}-${d.slice(5)}`
      : `02-${d.slice(2, 6)}-${d.slice(6)}`;
  if (d.length === 10) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  if (d.length === 11) return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
  return raw;
}

export type NoticeResult = {
  ok: boolean;
  channel: string;
  error?: string;
  demo: boolean;
  text: string;
};

/**
 * 정보성 안내 1건. 알림톡이 준비된 템플릿이면 알림톡으로, 아니면 같은 문구를 문자로 보낸다(설정 › 카카오 알림톡).
 * 업체명·업체전화는 여기서 채우므로 부르는 쪽은 고객·건 값만 넘긴다(중복 입력 없음).
 */
export async function sendNotice(
  db: Db,
  e: {
    key: KakaoKey;
    to: string;
    vars: Record<string, string>;
    purpose: string;
    customerName?: string;
    ref?: string;
    sentBy: string | null;
    /** 발송 기록에 남기지 않을 글자(예: 내 차 수첩 링크의 비밀 부분). 기록에는 ●●●● 로 남긴다 */
    secret?: string;
    /** 간소화 '손님 안내는 앱 푸시 먼저'(simple.push_first): 내 차 수첩 앱에서 알림을 켠 손님이면 푸시로 보내고 문자는 아낀다 */
    push?: { customerId: string; url: string };
  },
  f: typeof fetch = fetch,
): Promise<NoticeResult> {
  const to = mobile(e.to);
  const p = await smsRuntime(db);
  const vars = {
    업체명: SHOP_NAME,
    업체전화: p.sender ? formatPhone(p.sender) : "제이모터스",
    ...e.vars,
  };
  const text = renderKakao(e.key, vars);
  if (e.push && (await loadPolicy(db, seoulDate()))["simple.push_first"] === 1) {
    // 수첩 모듈이 이 모듈을 쓰므로 여기서 불러온다
    const { sendPush } = await import("@/modules/carbook/push");
    const pushed = await sendPush(db, e.push.customerId, { title: KAKAO_TEMPLATES[e.key].title, body: text, url: e.push.url }, new Date(), f);
    if (pushed.ok) {
      await log(db, { channel: "앱 푸시", purpose: e.purpose, provider: "push", to, body: e.secret ? text.split(e.secret).join("●●●●") : text, ok: true, sentBy: e.sentBy, ref: e.ref, customerName: e.customerName });
      return { ok: true, channel: "앱 푸시", demo: false, text };
    }
  }
  const kakao = await kakaoOverview(db);
  // 설정 › 간소화에서 카카오 알림톡을 꺼 두면 알림톡을 켜 두었어도 문자로 보낸다
  const ready = !(await featureOff(db, "kakao")) && kakao.templates.find((t) => t.key === e.key)?.ready;
  const sendKakao = ADAPTERS[p.id].sendKakao;
  let r: { ok: boolean; error?: string };
  let channel: string;
  if (ready && sendKakao) {
    const { data } = await load(db, "kakao");
    channel = "알림톡";
    [r] = await sendKakao(
      p.cfg,
      p.sender,
      [
        {
          to,
          text,
          subject: SHOP_NAME,
          pfId: data.pfId,
          templateId: data.codes[e.key] ?? "DEMO",
          variables: Object.fromEntries(
            Object.entries(vars).map(([a, b]) => [`#{${a}}`, b]),
          ),
        },
      ],
      f,
    );
  } else {
    channel = smsKind(text);
    [r] = await ADAPTERS[p.id].send(
      p.cfg,
      p.sender,
      [
        {
          to,
          text,
          kind: smsKind(text),
          subject: KAKAO_TEMPLATES[e.key].title,
        },
      ],
      f,
    );
  }
  await log(db, {
    channel,
    purpose: e.purpose,
    provider: p.id,
    to,
    body: e.secret ? text.split(e.secret).join("●●●●") : text,
    ok: r.ok,
    error: r.error,
    sentBy: e.sentBy,
    ref: e.ref,
    customerName: e.customerName,
  });
  return { ok: r.ok, error: r.error, channel, demo: p.id === "demo", text };
}

/** 직원이 고른 고객에게 문자 여러 건(문자 발송 화면). 고객마다 이미 바꿔 넣은 문구를 받는다 */
export async function sendSmsBatch(
  db: Db,
  actorId: string,
  purpose: string,
  items: { to: string; text: string; customerName: string }[],
  f: typeof fetch = fetch,
  /** 발송 기록에 남기지 않을 글자(예: 임시 비밀번호). 기록에는 ●●●● 로 남긴다 */
  secret?: string,
) {
  const p = await smsRuntime(db);
  const msgs = items.map((m) => ({
    to: mobile(m.to),
    text: m.text,
    kind: smsKind(m.text) as "SMS" | "LMS",
    subject: SHOP_NAME,
  }));
  const res = await ADAPTERS[p.id].send(p.cfg, p.sender, msgs, f);
  for (let i = 0; i < msgs.length; i++)
    await log(db, {
      channel: msgs[i].kind,
      purpose,
      provider: p.id,
      to: msgs[i].to,
      body: secret ? msgs[i].text.split(secret).join("●●●●") : msgs[i].text,
      ok: !!res[i]?.ok,
      error: res[i]?.error,
      sentBy: actorId,
      customerName: items[i].customerName,
    });
  return {
    ok: res.filter((r) => r.ok).length,
    failed: res.filter((r) => !r.ok).length,
    demo: p.id === "demo",
    errors: [
      ...new Set(res.filter((r) => !r.ok).map((r) => r.error ?? "실패")),
    ],
  };
}

/** 손님 한 명에게 비밀 글자가 든 문자 1건(내 차 수첩 인증번호). 기록에는 비밀 글자를 ●●●● 로 남긴다 */
export async function sendSecretSms(
  db: Db,
  e: { to: string; text: string; secret: string; purpose: string; customerName?: string },
  f: typeof fetch = fetch,
) {
  const p = await smsRuntime(db);
  const to = mobile(e.to);
  const [r] = await ADAPTERS[p.id].send(p.cfg, p.sender, [{ to, text: e.text, kind: smsKind(e.text) as "SMS" | "LMS", subject: SHOP_NAME }], f);
  await log(db, { channel: smsKind(e.text), purpose: e.purpose, provider: p.id, to, body: e.text.split(e.secret).join("●●●●"), ok: !!r?.ok, error: r?.error, sentBy: null, customerName: e.customerName });
  return { ok: !!r?.ok, error: r?.error, demo: p.id === "demo" };
}

/** 광고 문자에 붙일 수신거부 번호·발신번호·업체 전화 */
export async function smsSenderInfo(db: Db) {
  const { data } = await load(db, "sms");
  return { optout: data.optout, sender: data.sender, provider: data.provider };
}
