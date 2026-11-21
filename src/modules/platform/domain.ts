// 설정 › 도메인(대표 2026-11-21): 앱 주소(도메인)·등록 업체·클라우드플레어 계정·API 토큰·인증서를 한곳에서 본다.
// - 도메인 만료일: 미니 PC 가 공개 등록 정보(RDAP)에서 하루 한 번 읽어 오고, 못 읽으면 대표가 직접 적는다. 60·30·7일 전 대표 알림.
// - 계정 금고: 자주 안 써서 잊기 쉬운 업체 계정 아이디·비밀번호(대표 요청). 비밀번호는 민감정보 키로 암호화하고,
//   대표가 앱 비밀번호를 다시 넣어야 30초 동안 보인다. 열 때마다 감사 기록과 대표 알림.
// - 클라우드플레어 API 토큰: 미니 PC .env 에만 둔다. 앱에서 바꾸면 암호화해 잠시 두었다가 미니 PC 가 가져가 확인·저장하고 지운다.
import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { appConfig, appUser } from "@/db/schema";
import type { Role } from "@/modules/auth/roles";
import { decrypt, encrypt, verifySecret } from "@/modules/auth/crypto";
import { writeAudit } from "./audit";
import { UserError } from "./errors";
import { notifyRole } from "./notify";

const KEY = "domain";
type Actor = { id: string; roles: readonly Role[] };

export const ACCOUNT_KINDS = ["registrar", "cloudflare"] as const;
export type AccountKind = (typeof ACCOUNT_KINDS)[number];
export const ACCOUNT_LABEL: Record<AccountKind, string> = { registrar: "도메인 등록 업체", cloudflare: "클라우드플레어" };

export type Account = {
  company: string; // 업체 이름(가비아 등). 클라우드플레어는 고정
  loginId: string;
  email: string;
  twoFactor: boolean;
  recovery: string; // 복구 코드를 둔 곳(코드 자체는 적지 않는다)
  pwChangedOn: string; // YYYY-MM-DD
  memo: string;
  pwEnc?: string; // 암호화한 비밀번호
  autoRenew?: boolean; // 등록 업체만
};
export type DomainInfo = {
  apex: string;
  expiry: string; // YYYY-MM-DD(RDAP 에서 읽음)
  expiryManual: string; // 대표가 적은 만료일(RDAP 를 못 읽을 때)
  ns: string[];
  checkedAt: string;
  token: { ok: boolean; status: string; expiresOn: string; last4: string; checkedAt: string } | null;
  record: { type: string; content: string; proxied: boolean } | null;
};
type TokenPending = { enc: string; at: string; by: string; last4: string };
type TokenResult = { at: string; ok: boolean; message: string; last4: string };
type Data = {
  accounts?: Partial<Record<AccountKind, Account>>;
  info?: Partial<DomainInfo>;
  tokenPending?: TokenPending | null;
  tokenResult?: TokenResult | null;
};

async function load(db: Db): Promise<Data> {
  const [c] = await db.select().from(appConfig).where(eq(appConfig.key, KEY));
  return (c?.data ?? {}) as Data;
}
async function save(db: Db, data: Data, by: string | null = null) {
  await db
    .insert(appConfig)
    .values({ key: KEY, data, updatedBy: by, updatedAt: new Date() })
    .onConflictDoUpdate({ target: appConfig.key, set: { data, updatedBy: by, updatedAt: new Date() } });
}
const ownerOnly = (a: Actor) => {
  if (!a.roles.includes("owner")) throw new UserError("도메인 관리는 대표만 합니다");
};
const s = (x: unknown, n = 200) => String(x ?? "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, n);
const ymd = (x: unknown) => (/^\d{4}-\d{2}-\d{2}$/.test(String(x ?? "")) ? String(x) : "");
const seoulDay = (t: number) => new Date(t + 9 * 3600_000).toISOString().slice(0, 10);
const daysUntil = (day: string, now: number) => (day ? Math.floor((Date.parse(`${day}T00:00:00+09:00`) - Date.parse(`${seoulDay(now)}T00:00:00+09:00`)) / 86400_000) : null);

/** 앱 주소에서 본 도메인: app.jmotors.co.kr → jmotors.co.kr */
export function apexOf(host: string) {
  const p = host.toLowerCase().split(".").filter(Boolean);
  const two = /^(co|or|go|ne|re|ac|pe|ms|hs|es|sc|kg|seoul|busan)$/.test(p[p.length - 2] ?? "") && p[p.length - 1] === "kr";
  return p.slice(two ? -3 : -2).join(".");
}

export async function domainView(db: Db, now = Date.now()) {
  const d = await load(db);
  const info = d.info ?? {};
  const expiry = info.expiry || info.expiryManual || "";
  const accounts = Object.fromEntries(
    ACCOUNT_KINDS.map((k) => {
      const a = d.accounts?.[k];
      const { pwEnc, ...rest } = a ?? ({} as Account);
      return [k, a ? { ...rest, hasPassword: !!pwEnc } : null];
    }),
  ) as Record<AccountKind, (Omit<Account, "pwEnc"> & { hasPassword: boolean }) | null>;
  return {
    accounts,
    info: { apex: info.apex ?? "", expiry: info.expiry ?? "", expiryManual: info.expiryManual ?? "", ns: info.ns ?? [], checkedAt: info.checkedAt ?? "", token: info.token ?? null, record: info.record ?? null },
    expiry,
    expiryDays: daysUntil(expiry, now),
    nsCloudflare: (info.ns ?? []).length > 0 && (info.ns ?? []).every((n) => /\.ns\.cloudflare\.com\.?$/i.test(n)),
    tokenPending: d.tokenPending ? { at: d.tokenPending.at, last4: d.tokenPending.last4 } : null,
    tokenResult: d.tokenResult ?? null,
  };
}

/** 대표만. 계정 정보 저장(비밀번호는 넣었을 때만 바꾼다. 빈칸이면 그대로) */
export async function saveAccount(db: Db, actor: Actor, kind: AccountKind, input: Record<string, unknown>) {
  ownerOnly(actor);
  if (!ACCOUNT_KINDS.includes(kind)) throw new UserError("알 수 없는 계정입니다");
  const d = await load(db);
  const cur = d.accounts?.[kind];
  const pw = String(input.password ?? "");
  if (pw.length > 200) throw new UserError("비밀번호가 너무 깁니다");
  const a: Account = {
    company: kind === "cloudflare" ? "Cloudflare" : s(input.company, 60),
    loginId: s(input.loginId, 100),
    email: s(input.email, 120),
    twoFactor: input.twoFactor === true || input.twoFactor === "on",
    recovery: s(input.recovery, 200),
    pwChangedOn: ymd(input.pwChangedOn) || (pw ? seoulDay(Date.now()) : (cur?.pwChangedOn ?? "")),
    memo: s(input.memo, 500),
    ...(kind === "registrar" ? { autoRenew: input.autoRenew === true || input.autoRenew === "on" } : {}),
    ...(pw ? { pwEnc: encrypt(pw, "sensitive") } : cur?.pwEnc ? { pwEnc: cur.pwEnc } : {}),
  };
  await save(db, { ...d, accounts: { ...d.accounts, [kind]: a } }, actor.id);
  const { pwEnc: _a, ...after } = a;
  await writeAudit(db, { actorId: actor.id, action: "domain.account_save", entityType: "app_config", entityId: `${KEY}:${kind}`, after: { ...after, passwordChanged: !!pw } });
}

/** 대표만. 앱 비밀번호를 다시 넣으면 그 계정 비밀번호를 돌려준다(화면은 30초 뒤 가림). 열 때마다 기록·알림 */
export async function revealPassword(db: Db, actor: Actor, kind: AccountKind, appPassword: string, now = new Date()) {
  ownerOnly(actor);
  const [u] = await db.select({ hash: appUser.passwordHash, name: appUser.name }).from(appUser).where(eq(appUser.id, actor.id));
  if (!u || !verifySecret(appPassword, u.hash)) {
    await writeAudit(db, { actorId: actor.id, action: "domain.reveal_failed", entityType: "app_config", entityId: `${KEY}:${kind}` });
    throw new UserError("앱 비밀번호가 맞지 않습니다");
  }
  const d = await load(db);
  const enc = d.accounts?.[kind]?.pwEnc;
  if (!enc) throw new UserError("저장된 비밀번호가 없습니다");
  await writeAudit(db, { actorId: actor.id, action: "domain.reveal", entityType: "app_config", entityId: `${KEY}:${kind}` });
  await notifyRole(db, "owner", `${ACCOUNT_LABEL[kind]} 계정 비밀번호를 열어 보았습니다(${u.name}, ${now.toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}). 본인이 아니면 바로 비밀번호를 바꾸세요`, `domain-reveal:${kind}:${now.toISOString()}`, "/settings/domain");
  return decrypt(enc);
}

/** 대표만. 만료일 직접 적기(RDAP 로 못 읽을 때) */
export async function setManualExpiry(db: Db, actor: Actor, day: string) {
  ownerOnly(actor);
  const v = ymd(day.trim());
  if (day.trim() && !v) throw new UserError("만료일을 2027-03-15 처럼 넣어 주세요");
  const d = await load(db);
  await save(db, { ...d, info: { ...d.info, expiryManual: v } }, actor.id);
}

/** 대표만. 새 클라우드플레어 API 토큰. 미니 PC 가 1분 안에 가져가 확인하고 저장한다 */
export async function submitCfToken(db: Db, actor: Actor, token: string, now = new Date()) {
  ownerOnly(actor);
  const t = token.replace(/\s+/g, "");
  if (!/^[A-Za-z0-9_-]{30,200}$/.test(t)) throw new UserError("토큰 모양이 아닙니다. 클라우드플레어에서 만든 토큰(40자 안팎)을 그대로 붙여 넣으세요");
  const d = await load(db);
  await save(db, { ...d, tokenPending: { enc: encrypt(t, "sensitive"), at: now.toISOString(), by: actor.id, last4: t.slice(-4) }, tokenResult: null }, actor.id);
  await writeAudit(db, { actorId: actor.id, action: "domain.token_submit", entityType: "app_config", entityId: `${KEY}:cf_token`, after: { last4: t.slice(-4) } });
}

/** 미니 PC 에 넘길 새 토큰(30분 지나면 버림) */
export async function pendingCfToken(db: Db, now = new Date()): Promise<string | null> {
  const d = await load(db);
  const p = d.tokenPending;
  if (!p) return null;
  if (now.getTime() - Date.parse(p.at) > 30 * 60_000) {
    await save(db, { ...d, tokenPending: null, tokenResult: { at: now.toISOString(), ok: false, message: "서버가 30분 안에 가져가지 않아 버렸습니다. 다시 넣어 주세요", last4: p.last4 } });
    return null;
  }
  return decrypt(p.enc);
}

/** 미니 PC 가 알려 오는 도메인 정보·토큰 바꾸기 결과 */
export async function domainReport(db: Db, body: { domainInfo?: unknown; cfTokenResult?: unknown }, now = new Date()) {
  if (!body.domainInfo && !body.cfTokenResult) return;
  const d = await load(db);
  const next: Data = { ...d };
  if (body.domainInfo && typeof body.domainInfo === "object") {
    const o = body.domainInfo as Record<string, unknown>;
    const tk = (o.token ?? null) as Record<string, unknown> | null;
    const rc = (o.record ?? null) as Record<string, unknown> | null;
    next.info = {
      ...d.info,
      apex: s(o.apex, 120) || d.info?.apex || "",
      expiry: ymd(String(o.expiry ?? "").slice(0, 10)) || d.info?.expiry || "",
      ns: Array.isArray(o.ns) ? o.ns.slice(0, 10).map((x) => s(x, 120)).filter(Boolean) : (d.info?.ns ?? []),
      checkedAt: now.toISOString(),
      token: tk ? { ok: tk.ok === true, status: s(tk.status, 30), expiresOn: s(tk.expiresOn, 30), last4: s(tk.last4, 4), checkedAt: now.toISOString() } : (d.info?.token ?? null),
      record: rc ? { type: s(rc.type, 10), content: s(rc.content, 200), proxied: rc.proxied === true } : (d.info?.record ?? null),
    };
    // 토큰이 맞지 않게 되면(지워짐·만료) 대표에게. 주소 자동 고치기가 멈추기 때문
    if (tk && tk.ok !== true && d.info?.token?.ok !== false)
      await notifyRole(db, "owner", "클라우드플레어 API 토큰이 맞지 않습니다. 앱 주소 자동 고치기가 멈춥니다. 설정 › 도메인에서 새 토큰을 넣어 주세요", `cf-token-bad:${seoulDay(now.getTime())}`, "/settings/domain");
  }
  if (body.cfTokenResult && typeof body.cfTokenResult === "object") {
    const r = body.cfTokenResult as Record<string, unknown>;
    next.tokenPending = null;
    next.tokenResult = { at: now.toISOString(), ok: r.ok === true, message: s(r.message, 200), last4: s(r.last4, 4) };
    await writeAudit(db, { actorId: null, action: r.ok === true ? "domain.token_saved" : "domain.token_rejected", entityType: "app_config", entityId: `${KEY}:cf_token`, after: next.tokenResult });
    await notifyRole(db, "owner", r.ok === true ? `새 클라우드플레어 토큰(끝 ${next.tokenResult.last4})을 서버에 저장했습니다` : `새 클라우드플레어 토큰을 쓰지 못했습니다: ${next.tokenResult.message}. 이전 토큰을 그대로 씁니다`, `cf-token:${now.toISOString()}`, "/settings/domain");
  }
  await save(db, next);
}

/** 1분마다(서버 상태 알림 때): 도메인 만료 60·30·7일 전, 계정 비밀번호 1년 지남 알림(각각 한 번) */
export async function domainReminders(db: Db, now = new Date()) {
  const v = await domainView(db, now.getTime());
  const left = v.expiryDays;
  if (left != null) {
    const step = left <= 7 ? 7 : left <= 30 ? 30 : left <= 60 ? 60 : null;
    if (step)
      await notifyRole(
        db,
        "owner",
        left < 0 ? `도메인 ${v.info.apex || ""}이 만료되었습니다(${v.expiry}). 바로 등록 업체에서 연장하세요` : `도메인 ${v.info.apex || ""}이 ${left}일 뒤(${v.expiry}) 만료됩니다${v.accounts.registrar?.autoRenew ? "(자동 연장 켜짐: 결제 수단 확인)" : ". 등록 업체에서 연장하세요"}`,
        `domain-expiry:${v.expiry}:${left < 0 ? "over" : step}`,
        "/settings/domain",
      );
  }
  for (const k of ACCOUNT_KINDS) {
    const a = v.accounts[k];
    if (a?.hasPassword && a.pwChangedOn && (daysUntil(a.pwChangedOn, now.getTime()) ?? 0) <= -365)
      await notifyRole(db, "owner", `${ACCOUNT_LABEL[k]} 계정 비밀번호를 바꾼 지 1년이 넘었습니다. 바꾸고 설정 › 도메인에도 고쳐 두세요`, `domain-pw-old:${k}:${seoulDay(now.getTime()).slice(0, 7)}`, "/settings/domain");
  }
}
