// 홈페이지(jmotors.co.kr) 1단계: 홈페이지 설정, 견적 요청(휴대폰 인증 → 상담 일지), 비밀 답변.
// - 견적 요청은 새 표를 두지 않고 정비소 '상담 일지'(F-01-01)에 경로 '고객용 화면'·출처 'web'으로 들어간다. 직원은 다시 치지 않는다.
// - 같은 휴대폰 번호의 고객·같은 차량번호의 차가 있으면 거기에 붙이고, 없으면 만든다(필수 동의는 요청 화면에서 받는다).
// - 답은 요청한 손님만 본다: 휴대폰 문자 인증으로 들어오는 '내 차 수첩'의 상담 요청 목록에 나온다. 알림톡(안 되면 문자)으로 알린다.
import { randomInt } from "node:crypto";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { appConfig, carbookOtp, carbookSession, consent, consultation, customer, MAIN_BRANCH_ID, vehicle } from "@/db/schema";
import { decrypt, encrypt, maskPhone, normalizePhone, phoneHash, randomToken, sha256 } from "@/modules/auth/crypto";
import type { Role } from "@/modules/auth/roles";
import { can } from "@/modules/auth/permissions";
import { carbookConfig } from "@/modules/carbook/service";
import { OTP, SESSION_DAYS } from "@/modules/carbook/rules";
import { INSURANCE_PICK, REQUEST_LIMIT } from "@/modules/carbook/requests";
import { addBusinessDays, CONSENT_VERSION, normalizePlate, PLATE_RE } from "@/modules/customer/rules";
import { consentState, saveVehicle } from "@/modules/customer/service";
import { MOBILE_RE } from "@/modules/messaging/rules";
import { sendNotice, sendSecretSms, SHOP_NAME } from "@/modules/messaging/service";
import { writeAudit } from "@/modules/platform/audit";
import { loadShopCalendar } from "@/modules/platform/calendar";
import { branchDocNo } from "@/modules/platform/docno";
import { UserError } from "@/modules/platform/errors";
import { notifyRole } from "@/modules/platform/notify";
import { loadPolicy } from "@/modules/platform/policy";
import { IMAGE_TYPES, MAX_IMAGE_BYTES, sniffImage, storeFile } from "@/modules/platform/storage";
import { seoulDate } from "@/modules/platform/time";
import { cleanMarks } from "@/modules/repair/rules";
import { DEFAULT_SITE, homepageHosts, WEB_LIMIT, type SiteConfig } from "./rules";

export class SiteError extends UserError {}

type Meta = { ip?: string | null; userAgent?: string | null };
type Actor = { id: string; roles: readonly Role[] };
const KEY = "site";

/** 손님에게 보낼 주소: 홈페이지 주소가 있으면 그것(https://jmotors.co.kr), 없으면 앱 주소 */
export function siteUrl(): string {
  const h = homepageHosts()[0];
  if (h) return `https://${h}`;
  return (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");
}

// ── 홈페이지 설정(대표) ──
export async function siteConfig(db: Db): Promise<SiteConfig> {
  const [r] = await db.select({ data: appConfig.data }).from(appConfig).where(eq(appConfig.key, KEY));
  return { ...DEFAULT_SITE, ...((r?.data as Partial<SiteConfig>) ?? {}) };
}

const cut = (s: unknown, n: number) => String(s ?? "").trim().slice(0, n);
const dateOrEmpty = (s: unknown) => (/^\d{4}-\d{2}-\d{2}$/.test(String(s ?? "")) ? String(s) : "");

export async function saveSiteConfig(db: Db, actor: Actor, input: Partial<SiteConfig>, now = new Date()) {
  if (!actor.roles.includes("owner")) throw new SiteError("홈페이지 설정은 대표만 바꿉니다");
  const kakao = cut(input.kakao, 200);
  if (kakao && !/^https:\/\/(pf\.kakao\.com|open\.kakao\.com)\//.test(kakao)) throw new SiteError("카카오톡 채널 주소는 https://pf.kakao.com/ 으로 시작합니다(채널 관리자 › 채널 URL 복사)");
  const data: SiteConfig = {
    requests: !!input.requests,
    headline: cut(input.headline, 60) || DEFAULT_SITE.headline,
    lead: cut(input.lead, 200),
    openOn: dateOrEmpty(input.openOn),
    about: cut(input.about, 3000),
    hours: cut(input.hours, 120),
    kakao,
    privacyOfficer: cut(input.privacyOfficer, 40),
    privacyContact: cut(input.privacyContact, 80),
    privacyFrom: dateOrEmpty(input.privacyFrom),
  };
  await db.insert(appConfig).values({ key: KEY, data, updatedBy: actor.id, updatedAt: now }).onConflictDoUpdate({ target: appConfig.key, set: { data, updatedBy: actor.id, updatedAt: now } });
  await writeAudit(db, { actorId: actor.id, action: "site.config", entityType: "app_config", entityId: KEY, after: data });
}

// ── 견적 요청 1: 휴대폰 본인 확인 ──
const codeHash = (otpId: string, code: string) => sha256(`web:${otpId}:${code}`);

function mobileOf(raw: string) {
  const phone = normalizePhone(raw);
  if (!MOBILE_RE.test(phone)) throw new SiteError("휴대폰 번호를 확인해 주세요(예: 010-1234-5678)");
  return phone;
}

/**
 * 인증번호 보내기. 처음 오는 손님에게도 보낸다(내 차 수첩 들어가기와 다름). 문자 값이 들므로 번호·접속 주소마다 횟수를 묶는다.
 * 테스트 서버(문자 '시연')는 실제로 보내지 않으니 demoCode 로 화면에 보여 준다.
 */
export async function requestWebCode(db: Db, raw: string, meta: Meta = {}, now = new Date(), f: typeof fetch = fetch): Promise<{ demoCode?: string }> {
  if (!(await siteConfig(db)).requests) throw new SiteError("지금은 홈페이지 견적 요청을 받지 않습니다. 정비소로 전화해 주세요");
  const phone = mobileOf(raw);
  const ph = phoneHash(phone);
  const dayAgo = new Date(now.getTime() - 864e5);
  const recent = await db.select().from(carbookOtp).where(and(eq(carbookOtp.phoneHash, ph), eq(carbookOtp.purpose, "web"), gte(carbookOtp.createdAt, dayAgo))).orderBy(desc(carbookOtp.createdAt));
  if (recent.length >= WEB_LIMIT.codesPerDay) throw new SiteError("오늘은 인증번호를 더 보낼 수 없습니다. 내일 다시 해 주시거나 정비소로 전화해 주세요");
  const locked = recent.find((o) => o.tries >= OTP.maxTries && o.createdAt.getTime() > now.getTime() - OTP.lockMinutes * 60_000);
  if (locked) throw new SiteError(`인증번호를 여러 번 틀려 ${OTP.lockMinutes}분 동안 잠겼습니다. 잠시 뒤 다시 해 주세요`);
  if (recent[0] && now.getTime() - recent[0].createdAt.getTime() < 30_000) throw new SiteError("방금 보냈습니다. 30초 뒤에 다시 받을 수 있습니다");
  if (meta.ip) {
    const [n] = await db.select({ n: sql<number>`count(*)::int` }).from(carbookOtp).where(and(eq(carbookOtp.ip, meta.ip), eq(carbookOtp.purpose, "web"), gte(carbookOtp.createdAt, new Date(now.getTime() - 3600_000))));
    if ((n?.n ?? 0) >= WEB_LIMIT.codesPerIpHour) throw new SiteError("요청이 너무 많습니다. 한 시간 뒤에 다시 해 주세요");
  }
  const code = String(randomInt(0, 10 ** OTP.digits)).padStart(OTP.digits, "0");
  const [row] = await db.insert(carbookOtp).values({ phoneHash: ph, customerId: null, codeHash: "-", purpose: "web", expiresAt: new Date(now.getTime() + OTP.minutes * 60_000), ip: meta.ip ?? null, createdAt: now }).returning({ id: carbookOtp.id });
  await db.update(carbookOtp).set({ codeHash: codeHash(row.id, code) }).where(eq(carbookOtp.id, row.id));
  const text = `[${SHOP_NAME}] 견적 요청 인증번호 ${code} (${OTP.minutes}분 안에 넣어 주세요). 요청하지 않으셨으면 무시해 주세요.`;
  const r = await sendSecretSms(db, { to: phone, text, secret: code, purpose: "홈페이지 견적 요청 인증번호" }, f);
  if (!r.ok && !r.demo) throw new SiteError("문자를 보내지 못했습니다. 잠시 뒤 다시 해 주시거나 정비소로 전화해 주세요");
  return r.demo ? { demoCode: code } : {};
}

/** 인증번호 확인. 맞으면 '확인증'(인증 줄 id)을 돌려준다 — 화면은 이것을 짧은 쿠키(30분)에 두고 요청을 보낼 때 낸다 */
export async function verifyWebCode(db: Db, raw: string, rawCode: string, now = new Date()) {
  const phone = mobileOf(raw);
  const code = rawCode.replace(/\D/g, "").slice(0, OTP.digits);
  if (code.length !== OTP.digits) throw new SiteError(`문자로 받은 숫자 ${OTP.digits}자리를 넣어 주세요`);
  const [o] = await db.select().from(carbookOtp).where(and(eq(carbookOtp.phoneHash, phoneHash(phone)), eq(carbookOtp.purpose, "web"))).orderBy(desc(carbookOtp.createdAt)).limit(1);
  if (!o || o.usedAt) throw new SiteError("인증번호를 먼저 받아 주세요");
  if (o.tries >= OTP.maxTries) throw new SiteError(`여러 번 틀려 잠겼습니다. ${OTP.lockMinutes}분 뒤 인증번호를 다시 받아 주세요`);
  if (o.expiresAt < now) throw new SiteError("인증번호 시간이 지났습니다. 다시 받아 주세요");
  if (o.codeHash !== codeHash(o.id, code)) {
    const tries = o.tries + 1;
    await db.update(carbookOtp).set({ tries }).where(eq(carbookOtp.id, o.id));
    throw new SiteError(tries >= OTP.maxTries ? `여러 번 틀려 ${OTP.lockMinutes}분 동안 잠겼습니다` : `인증번호가 맞지 않습니다(${OTP.maxTries - tries}번 더 넣을 수 있음)`);
  }
  await db.update(carbookOtp).set({ usedAt: now }).where(eq(carbookOtp.id, o.id));
  return { proof: o.id, phone };
}

/** 확인증이 살아 있는지(인증 뒤 30분 안·아직 요청에 쓰지 않음·같은 번호) */
async function checkProof(db: Db, proof: string, phone: string, now: Date) {
  if (!/^[0-9a-f-]{36}$/i.test(proof)) return null;
  const [o] = await db.select().from(carbookOtp).where(eq(carbookOtp.id, proof));
  if (!o || o.purpose !== "web" || !o.usedAt || o.codeHash === "spent") return null;
  if (o.phoneHash !== phoneHash(phone)) return null;
  if (now.getTime() - o.usedAt.getTime() > WEB_LIMIT.verifiedMinutes * 60_000) return null;
  return o;
}

/** 인증한 번호가 우리 고객이면 이름·차를 미리 채운다(다시 치지 않게). 화면에는 이름과 차량번호만 보인다 */
export async function knownVisitor(db: Db, proof: string, phone: string, now = new Date()) {
  if (!(await checkProof(db, proof, phone, now))) return null;
  const [c] = await db.select({ id: customer.id, name: customer.name, purgedAt: customer.purgedAt, kind: customer.kind }).from(customer).where(eq(customer.phoneHash, phoneHash(phone)));
  if (!c || c.purgedAt) return { name: "", cars: [] as { id: string; label: string; model: string | null; bodyType: string | null; options: string[] }[], phoneMasked: maskPhone(phone), consented: false };
  const cars = await db.select().from(vehicle).where(eq(vehicle.customerId, c.id)).orderBy(desc(vehicle.updatedAt));
  const st = await consentState(db, c.id);
  return {
    name: c.name,
    cars: cars.map((v) => ({ id: v.id, label: [v.plateNo, v.maker, v.model].filter(Boolean).join(" "), model: v.model, bodyType: v.bodyType, options: v.options })),
    phoneMasked: maskPhone(phone),
    consented: st.required && st.current,
  };
}

// ── 견적 요청 2: 보내기 ──
export type WebRequestInput = {
  proof: string;
  phone: string;
  name: string;
  /** 이미 있는 내 차(인증한 고객의 차)면 id, 아니면 차량번호·차종 */
  vehicleId: string;
  plateNo: string;
  model: string;
  bodyType: string;
  damageParts: string;
  damageZones: unknown;
  insurance: string;
  insurer: string;
  wantDate: string;
  needs: string;
  agreeRequired: boolean;
  agreeMarketing: boolean;
  photos: Uint8Array[];
};

/**
 * 홈페이지 견적 요청 → 상담 일지 한 줄. 손님 로그인(내 차 수첩, 90일)도 만들어 돌려준다 — 답이 오면 거기서 본다.
 * 내 차 수첩을 꺼 두었으면 로그인은 만들지 않는다(token null).
 */
export async function submitWebRequest(db: Db, input: WebRequestInput, meta: Meta = {}, now = new Date()) {
  if (!(await siteConfig(db)).requests) throw new SiteError("지금은 홈페이지 견적 요청을 받지 않습니다. 정비소로 전화해 주세요");
  const phone = mobileOf(input.phone);
  const proof = await checkProof(db, input.proof, phone, now);
  if (!proof) throw new SiteError(`휴대폰 인증이 끝났거나 ${WEB_LIMIT.verifiedMinutes}분이 지났습니다. 인증번호를 다시 받아 주세요`);
  const name = input.name.trim().slice(0, 30);
  if (name.length < 2) throw new SiteError("이름을 적어 주세요");
  const zones = cleanMarks(input.damageZones).filter((m) => m.kind !== "O").slice(0, 40);
  const parts = input.damageParts.trim().slice(0, 500);
  if (!zones.length && parts.length < 2) throw new SiteError("차 그림에서 다친 곳을 누르거나, 어디가 어떤지 적어 주세요");
  if (!(input.insurance in INSURANCE_PICK)) throw new SiteError("수리비를 어떻게 하실지 골라 주세요");
  const today = seoulDate(now);
  if (input.wantDate && (!/^\d{4}-\d{2}-\d{2}$/.test(input.wantDate) || input.wantDate < today)) throw new SiteError("원하는 날짜는 오늘 뒤로 골라 주세요");
  if (input.photos.filter((b) => b.length).length > WEB_LIMIT.photos) throw new SiteError(`사진은 ${WEB_LIMIT.photos}장까지 보낼 수 있습니다`);
  const ph = phoneHash(phone);
  const [known] = await db.select().from(customer).where(eq(customer.phoneHash, ph));
  const was = known && !known.purgedAt ? known : null;
  const st = was ? await consentState(db, was.id) : null;
  const needConsent = !(st?.required && st.current);
  if (needConsent && !input.agreeRequired) throw new SiteError("[필수] 개인정보 수집·이용에 동의해야 견적 요청을 받을 수 있습니다");
  if (was) {
    const recent = await db.select({ id: consultation.id }).from(consultation).where(and(eq(consultation.customerId, was.id), eq(consultation.channel, "online"), gte(consultation.at, new Date(now.getTime() - 864e5))));
    if (recent.length >= REQUEST_LIMIT.perDay) throw new SiteError("오늘은 견적 요청을 더 보낼 수 없습니다. 정비소로 전화해 주세요");
  }
  // 차: 내 차 고르기 → 같은 번호의 차 → 새 차. 다른 사람 이름으로 등록된 번호면 잇지 않고 글로만 남긴다(직원이 확인)
  let plateNote = "";
  if (!input.vehicleId) {
    const plate = normalizePlate(input.plateNo);
    if (!PLATE_RE.test(plate)) throw new SiteError("차량번호를 확인해 주세요(예: 12가3456)");
  }
  const paths: string[] = [];
  for (const b of input.photos) {
    if (!b.length) continue;
    if (b.length > MAX_IMAGE_BYTES) throw new SiteError("사진이 너무 큽니다(6MB까지)");
    const t = sniffImage(b);
    if (!t) throw new SiteError("사진 파일만 보낼 수 있습니다(JPG·PNG·WEBP)");
    paths.push(await storeFile("cs/web", b, IMAGE_TYPES[t]));
  }
  const policy = await loadPolicy(db, today);
  const replyDue = addBusinessDays(today, policy["consult.reply_business_days"], await loadShopCalendar(db));
  const types = [...new Set(zones.map((z) => ({ D: "찌그러짐", S: "긁힘", R: "부식", W: "긁힘", C: "기타" })[z.kind as "D"] ?? "기타"))];

  const out = await db.transaction(async (tx) => {
    let customerId = was?.id;
    if (!customerId) {
      const [c] = await tx.insert(customer).values({ name, phoneEnc: encrypt(phone), phoneHash: ph, phoneMasked: maskPhone(phone), memo: "홈페이지 견적 요청으로 등록" }).returning({ id: customer.id });
      customerId = c.id;
      await writeAudit(tx, { actorId: null, action: "customer.create", entityType: "customer", entityId: customerId, after: { name, via: "homepage" } });
    }
    if (needConsent || (input.agreeMarketing && !st?.marketing)) {
      await tx.insert(consent).values({ customerId, version: CONSENT_VERSION, required: true, photo: st?.photo ?? false, marketing: input.agreeMarketing || (st?.marketing ?? false), method: "online", note: "홈페이지 견적 요청 화면에서 직접 동의" });
      await writeAudit(tx, { actorId: null, action: "consent.record", entityType: "customer", entityId: customerId, after: { required: true, marketing: input.agreeMarketing, method: "online", via: "homepage" } });
    }
    let vehicleId: string | null = null;
    if (input.vehicleId) {
      const [v] = await tx.select().from(vehicle).where(eq(vehicle.id, input.vehicleId));
      if (!v || v.customerId !== customerId) throw new SiteError("고른 차를 찾을 수 없습니다. 차량번호를 직접 적어 주세요");
      vehicleId = v.id;
    } else {
      const plate = normalizePlate(input.plateNo);
      const [same] = await tx.select().from(vehicle).where(eq(vehicle.plateNo, plate));
      if (same && same.customerId !== customerId) plateNote = `차량번호 ${plate}(다른 고객 이름으로 등록된 차 — 소유자 바뀜 확인 필요)`;
      else vehicleId = await saveVehicle(tx, null, customerId, { id: same?.id, plateNo: plate, model: input.model.trim().slice(0, 40) || undefined, bodyType: input.bodyType || undefined }, today);
    }
    const docNo = await branchDocNo(tx, "CS", now, MAIN_BRANCH_ID);
    const insurer = input.insurance === "self" ? null : input.insurer.trim().slice(0, 40) || null;
    const [row] = await tx
      .insert(consultation)
      .values({
        docNo,
        branchId: MAIN_BRANCH_ID,
        at: now,
        channel: "online",
        source: "web",
        customerId,
        vehicleId,
        damageTypes: types,
        damageParts: [parts, plateNote].filter(Boolean).join("\n") || null,
        damageZones: zones,
        photoCount: paths.length,
        photos: paths,
        methods: [],
        insurance: input.insurance as "self",
        insurer,
        wantDate: input.wantDate || null,
        needs: [input.needs.trim().slice(0, 500), !vehicleId && input.model.trim() ? `차종: ${input.model.trim().slice(0, 40)}` : ""].filter(Boolean).join("\n") || null,
        replyDue,
        advisorId: null,
      })
      .returning({ id: consultation.id, docNo: consultation.docNo });
    await tx.update(carbookOtp).set({ codeHash: "spent" }).where(eq(carbookOtp.id, proof.id));
    await writeAudit(tx, { actorId: null, action: "site.request", entityType: "consultation", entityId: docNo, after: { photos: paths.length, zones: zones.length, newCustomer: !was, ip: meta.ip ?? null } });
    return { id: row.id, docNo, customerId };
  });
  await notifyRole(db, "advisor", `홈페이지 견적 요청: ${name} ${parts.split("\n")[0].slice(0, 30) || "사진 견적"} — ${replyDue}까지 답변`, `web-request-${out.id}`, `/consults/${out.id}`);
  // 답은 내 차 수첩에서 본다: 문자 인증을 방금 했으니 바로 들어간 상태로 만든다
  let token: string | null = null;
  if ((await carbookConfig(db)).enabled) {
    token = randomToken(32);
    await db.insert(carbookSession).values({ tokenHash: sha256(token), customerId: out.customerId, scope: "full", expiresAt: new Date(now.getTime() + SESSION_DAYS.full * 864e5), ip: meta.ip ?? null, userAgent: meta.userAgent?.slice(0, 300) ?? null, lastSeenAt: now, createdAt: now });
    const [c] = await db.select({ at: customer.carbookAt }).from(customer).where(eq(customer.id, out.customerId));
    await db.update(customer).set({ carbookAt: c?.at ?? now, carbookSeenAt: now }).where(eq(customer.id, out.customerId));
  }
  return { ...out, replyDue, token, days: SESSION_DAYS.full };
}

// ── 비밀 답변(직원) ──
/**
 * 온라인 요청(홈페이지·내 차 수첩)에 답 쓰기. 요청한 손님만 내 차 수첩에서 본다. 처음 답하면 회신함으로 표시하고 알림톡(안 되면 문자)을 보낸다.
 * 고친 답은 다시 알리지 않는다(notify 를 켜면 보낸다).
 */
export async function replyToRequest(db: Db, actor: Actor & { name?: string }, id: string, text: string, notify: boolean, now = new Date(), f: typeof fetch = fetch) {
  if (!can(actor, "consult.write")) throw new SiteError("상담을 쓸 수 있는 사람만 답합니다");
  const body = text.trim().slice(0, 2000);
  if (body.length < 5) throw new SiteError("답을 적어 주세요");
  const [c] = await db.select().from(consultation).where(eq(consultation.id, id));
  if (!c) throw new SiteError("없는 상담입니다");
  if (c.channel !== "online") throw new SiteError("홈페이지·내 차 수첩으로 들어온 요청에만 답을 씁니다");
  const first = !c.webReplyAt;
  await db.update(consultation).set({ webReply: body, webReplyAt: now, webReplyBy: actor.id, repliedAt: c.repliedAt ?? now, advisorId: c.advisorId ?? actor.id, updatedAt: now }).where(eq(consultation.id, id));
  await writeAudit(db, { actorId: actor.id, action: first ? "site.reply" : "site.reply_edit", entityType: "consultation", entityId: c.docNo, after: { length: body.length } });
  if (!first && !notify) return { sent: null };
  const [cu] = await db.select({ name: customer.name, enc: customer.phoneEnc }).from(customer).where(eq(customer.id, c.customerId));
  if (!cu?.enc) return { sent: null };
  const r = await sendNotice(db, { key: "web_reply", to: decrypt(cu.enc), vars: { 고객명: cu.name, 요청번호: c.docNo, 답변링크: `${siteUrl()}/my/consult` }, purpose: "견적 요청 답변 알림", customerName: cu.name, ref: c.docNo, sentBy: actor.id }, f);
  return { sent: r };
}
