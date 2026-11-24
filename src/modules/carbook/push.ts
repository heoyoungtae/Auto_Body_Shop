// 내 차 수첩 3단계: 푸시 알림(홈 화면에 둔 내 차 수첩).
// 푸시는 내용 없이 '깨우기'만 보낸다(VAPID 서명만, 본문 암호화 없음). 휴대폰의 서비스 워커가 로그인 쿠키로
// /api/my/inbox 에서 보여 줄 글을 받아 띄운다. 그래서 푸시 업체(구글·애플)는 알림 내용을 보지 못한다.
// 열쇠(VAPID)는 처음 쓸 때 만들어 app_config 'carbook_vapid' 에 둔다. 보낼 곳이 없어졌다는 답(404·410)이면 그 기기를 지운다.
import { createPrivateKey, generateKeyPairSync, sign, type JsonWebKey } from "node:crypto";
import { and, asc, eq, isNull } from "drizzle-orm";
import type { Db } from "@/db/client";
import { appConfig, carbookInbox, carbookPush } from "@/db/schema";
import { appUrl } from "@/modules/customer/service";
import { CarbookError, type MySession } from "./service";

const KEY = "carbook_vapid";
type Vapid = { publicKey: string; privateJwk: JsonWebKey };
const b64u = (b: Buffer | Uint8Array) => Buffer.from(b).toString("base64url");

/** 공개 열쇠(브라우저가 구독할 때 쓰는 applicationServerKey, base64url). 없으면 만든다 */
export async function vapidKeys(db: Db): Promise<Vapid> {
  const [r] = await db.select({ data: appConfig.data }).from(appConfig).where(eq(appConfig.key, KEY));
  if (r?.data && (r.data as Vapid).publicKey) return r.data as Vapid;
  const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const pub = publicKey.export({ format: "jwk" });
  const raw = Buffer.concat([Buffer.from([4]), Buffer.from(pub.x!, "base64url"), Buffer.from(pub.y!, "base64url")]);
  const data: Vapid = { publicKey: b64u(raw), privateJwk: privateKey.export({ format: "jwk" }) };
  await db.insert(appConfig).values({ key: KEY, data }).onConflictDoNothing();
  // 동시에 두 번 만들었으면 먼저 들어간 것을 쓴다
  const [again] = await db.select({ data: appConfig.data }).from(appConfig).where(eq(appConfig.key, KEY));
  return again.data as Vapid;
}

/** VAPID 서명(JWT, ES256). aud=푸시 업체 주소, sub=우리 앱 주소 */
export function vapidAuth(v: Vapid, endpoint: string, now = new Date()) {
  const header = b64u(Buffer.from(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const sub = appUrl().startsWith("https://") ? appUrl() : "https://localhost";
  const payload = b64u(Buffer.from(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(now.getTime() / 1000) + 12 * 3600, sub })));
  const data = `${header}.${payload}`;
  const sig = sign("sha256", Buffer.from(data), { key: createPrivateKey({ key: v.privateJwk, format: "jwk" }), dsaEncoding: "ieee-p1363" });
  return `vapid t=${data}.${b64u(sig)}, k=${v.publicKey}`;
}

const pushHostOk = (endpoint: string) => {
  try {
    const u = new URL(endpoint);
    return u.protocol === "https:" && u.hostname.length > 3;
  } catch {
    return false;
  }
};

/** 이 휴대폰에서 푸시 받기(문자 인증 로그인만). 같은 기기는 한 줄 */
export async function subscribePush(db: Db, s: MySession, endpoint: string, userAgent: string | null, now = new Date()) {
  if (s.scope !== "full") throw new CarbookError("푸시는 휴대폰 문자 인증으로 들어와야 켤 수 있습니다");
  if (!pushHostOk(endpoint) || endpoint.length > 1000) throw new CarbookError("이 휴대폰은 푸시를 받을 수 없습니다");
  await db
    .insert(carbookPush)
    .values({ customerId: s.customerId, endpoint, userAgent: userAgent?.slice(0, 300) ?? null, createdAt: now })
    .onConflictDoUpdate({ target: carbookPush.endpoint, set: { customerId: s.customerId, userAgent: userAgent?.slice(0, 300) ?? null } });
}

export async function unsubscribePush(db: Db, s: MySession, endpoint: string) {
  await db.delete(carbookPush).where(and(eq(carbookPush.endpoint, endpoint), eq(carbookPush.customerId, s.customerId)));
}

export async function pushDevices(db: Db, customerId: string) {
  return db.select({ endpoint: carbookPush.endpoint, createdAt: carbookPush.createdAt, lastOkAt: carbookPush.lastOkAt }).from(carbookPush).where(eq(carbookPush.customerId, customerId));
}

/**
 * 푸시 보내기: 보여 줄 글을 받은편지함에 넣고, 이 손님의 기기마다 깨우기를 보낸다.
 * 한 기기라도 받으면 ok. 기기가 없거나 모두 실패하면 ok=false(부르는 쪽이 알림톡·문자로 보낸다)
 */
export async function sendPush(db: Db, customerId: string, msg: { title: string; body: string; url: string }, now = new Date(), f: typeof fetch = fetch) {
  const subs = await db.select().from(carbookPush).where(eq(carbookPush.customerId, customerId));
  if (!subs.length) return { ok: false, sent: 0 };
  const v = await vapidKeys(db);
  const [box] = await db.insert(carbookInbox).values({ customerId, title: msg.title.slice(0, 80), body: msg.body.slice(0, 1000), url: msg.url.startsWith("/my") || msg.url.startsWith("/survey/") ? msg.url : "/my", createdAt: now }).returning({ id: carbookInbox.id });
  let sent = 0;
  for (const sub of subs) {
    try {
      const r = await f(sub.endpoint, { method: "POST", headers: { TTL: String(24 * 3600), Urgency: "normal", Authorization: vapidAuth(v, sub.endpoint, now), "Content-Length": "0" } });
      if (r.status === 404 || r.status === 410) await db.delete(carbookPush).where(eq(carbookPush.id, sub.id));
      else if (r.ok) {
        sent++;
        await db.update(carbookPush).set({ lastOkAt: now }).where(eq(carbookPush.id, sub.id));
      }
    } catch {
      /* 이 기기는 건너뛴다 */
    }
  }
  // 한 기기도 받지 못했으면 받은편지함 글도 지운다(알림톡·문자로 대신 감)
  if (!sent) await db.delete(carbookInbox).where(eq(carbookInbox.id, box.id));
  return { ok: sent > 0, sent };
}

/** 서비스 워커가 깨어나 가져가는 글(아직 안 보여 준 것). 가져가면 보여 준 것으로 적는다 */
export async function takeInbox(db: Db, s: MySession, now = new Date()) {
  const rows = await db
    .select({ id: carbookInbox.id, title: carbookInbox.title, body: carbookInbox.body, url: carbookInbox.url })
    .from(carbookInbox)
    .where(and(eq(carbookInbox.customerId, s.customerId), isNull(carbookInbox.shownAt)))
    .orderBy(asc(carbookInbox.createdAt))
    .limit(5);
  for (const r of rows) await db.update(carbookInbox).set({ shownAt: now }).where(eq(carbookInbox.id, r.id));
  return rows;
}
