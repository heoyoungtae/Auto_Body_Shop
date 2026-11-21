// 홈페이지 1단계: 주소 나누기, 견적 요청(휴대폰 인증 → 상담 일지·고객·차·동의), 비밀 답변(내 차 수첩에서만), 한도
import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import * as schema from "@/db/schema";
import { requestCode, sessionOf, verifyCode } from "@/modules/carbook/service";
import { myConsults } from "@/modules/carbook/requests";
import { knownVisitor, replyToRequest, requestWebCode, saveSiteConfig, siteConfig, submitWebRequest, verifyWebCode, type WebRequestInput } from "@/modules/site/service";
import { daysToOpen, isHomepageHost, maskPersonal, routeFor } from "@/modules/site/rules";
import { seedShop, testDb } from "./db";
import { PNG } from "./flow";

let db: Db;
let ids: Awaited<ReturnType<typeof seedShop>>;
beforeEach(async () => {
  db = await testDb();
  ids = await seedShop(db);
});
const PHONE = "010-5555-1234";
const at = (d: string, h = 3) => new Date(`${d}T0${h}:00:00Z`);
const owner = () => ({ id: ids.owner, roles: ["owner"] as const });
const advisor = () => ({ id: ids.advisor, roles: ["advisor"] as const });

async function verified(now: Date, phone = PHONE) {
  const r = await requestWebCode(db, phone, { ip: "1.2.3.4" }, now);
  expect(r.demoCode).toMatch(/^\d{6}$/);
  return verifyWebCode(db, phone, r.demoCode!, now);
}
const base = (v: { proof: string; phone: string }): WebRequestInput => ({
  ...v,
  name: "김손님",
  vehicleId: "",
  plateNo: "12가 3456",
  model: "아반떼",
  bodyType: "sedan",
  damageParts: "앞범퍼 긁힘",
  damageZones: [],
  insurance: "self",
  insurer: "",
  wantDate: "",
  needs: "대차 필요",
  agreeRequired: true,
  agreeMarketing: false,
  photos: [PNG],
});

describe("주소 나누기", () => {
  it("홈페이지 주소는 손님 화면만, 직원 화면은 앱 주소로", () => {
    expect(isHomepageHost("jmotors.co.kr", "jmotors.co.kr,www.jmotors.co.kr")).toBe(true);
    expect(isHomepageHost("WWW.jmotors.co.kr:443", "jmotors.co.kr,www.jmotors.co.kr")).toBe(true);
    expect(isHomepageHost("app.jmotors.co.kr", "jmotors.co.kr")).toBe(false);
    expect(routeFor("/", true)).toEqual({ kind: "rewrite", to: "/site" });
    expect(routeFor("/", false)).toEqual({ kind: "pass" });
    expect(routeFor("/request", false)).toEqual({ kind: "rewrite", to: "/site/request" });
    expect(routeFor("/privacy/", true)).toEqual({ kind: "rewrite", to: "/site/privacy" });
    for (const p of ["/my", "/my/consult", "/estimate/abc", "/verify", "/brand/logo-light.png", "/_next/static/x.js", "/favicon.ico", "/api/my/inbox"]) expect(routeFor(p, true), p).toEqual({ kind: "pass" });
    for (const p of ["/login", "/home", "/estimates", "/money", "/consults", "/api/server-agent"]) expect(routeFor(p, true), p).toEqual({ kind: "app" });
  });
  it("전화·차량번호 가리기, 개업 D-day", () => {
    expect(maskPersonal("010-1234-5678 로 연락, 차 12가3456")).toBe("010-****-5678 로 연락, 차 12가**56");
    expect(daysToOpen("2026-12-01", "2026-11-21")).toBe(10);
    expect(daysToOpen("2026-11-21", "2026-11-21")).toBeNull();
    expect(daysToOpen("", "2026-11-21")).toBeNull();
  });
});

describe("견적 요청", () => {
  it("처음 오는 손님: 인증 → 고객·차·동의·상담 일지(홈페이지) → 내 차 수첩 로그인, 상담원 알림", async () => {
    const now = at("2026-11-23");
    const v = await verified(now);
    const r = await submitWebRequest(db, base(v), { ip: "1.2.3.4" }, now);
    const [c] = await db.select().from(schema.consultation).where(eq(schema.consultation.id, r.id));
    expect(c.channel).toBe("online");
    expect(c.source).toBe("web");
    expect(c.photos).toHaveLength(1);
    expect(c.replyDue).toBe("2026-11-24");
    const [cu] = await db.select().from(schema.customer).where(eq(schema.customer.id, c.customerId));
    expect(cu.name).toBe("김손님");
    const [v1] = await db.select().from(schema.vehicle).where(eq(schema.vehicle.id, c.vehicleId!));
    expect(v1.plateNo).toBe("12가3456");
    expect(v1.model).toBe("아반떼");
    const cs = await db.select().from(schema.consent).where(eq(schema.consent.customerId, cu.id));
    expect(cs).toHaveLength(1);
    expect(cs[0].method).toBe("online");
    const notes = await db.select().from(schema.notification).where(eq(schema.notification.userId, ids.advisor));
    expect(notes.some((n) => n.title.includes("홈페이지 견적 요청"))).toBe(true);
    const s = await sessionOf(db, r.token!, now);
    expect(s?.customerId).toBe(cu.id);
    // 확인증은 한 번만 쓴다
    await expect(submitWebRequest(db, base(v), {}, now)).rejects.toThrow(/인증/);
  });

  it("동의 없이는 못 보냄, 인증 30분 지나면 다시, 다른 번호로 낸 확인증은 안 됨", async () => {
    const now = at("2026-11-23");
    const v = await verified(now);
    await expect(submitWebRequest(db, { ...base(v), agreeRequired: false }, {}, now)).rejects.toThrow(/동의/);
    await expect(submitWebRequest(db, { ...base(v), phone: "010-9999-0000" }, {}, now)).rejects.toThrow(/인증/);
    await expect(submitWebRequest(db, base(v), {}, new Date(now.getTime() + 31 * 60_000))).rejects.toThrow(/30분/);
  });

  it("우리 고객이면 이름·차를 불러오고, 동의는 다시 묻지 않으며, 같은 번호로 붙는다", async () => {
    const now = at("2026-11-23");
    const first = await submitWebRequest(db, base(await verified(now)), {}, now);
    const later = new Date(now.getTime() + 3600_000);
    const v = await verified(later);
    const who = await knownVisitor(db, v.proof, v.phone, later);
    expect(who?.name).toBe("김손님");
    expect(who?.consented).toBe(true);
    expect(who?.cars[0].label).toContain("12가3456");
    const r = await submitWebRequest(db, { ...base(v), agreeRequired: false, vehicleId: who!.cars[0].id, plateNo: "" }, {}, later);
    expect(r.customerId).toBe(first.customerId);
    expect(await db.select().from(schema.customer).where(eq(schema.customer.name, "김손님"))).toHaveLength(1);
    expect((await db.select().from(schema.consent).where(eq(schema.consent.customerId, r.customerId))).length).toBe(1);
  });

  it("다른 고객 이름으로 등록된 차량번호면 잇지 않고 글로 남긴다", async () => {
    const now = at("2026-11-23");
    await submitWebRequest(db, base(await verified(now)), {}, now);
    const v = await verified(now, "010-7777-8888");
    const r = await submitWebRequest(db, { ...base(v), name: "박다른" }, {}, now);
    const [c] = await db.select().from(schema.consultation).where(eq(schema.consultation.id, r.id));
    expect(c.vehicleId).toBeNull();
    expect(c.damageParts).toContain("다른 고객 이름으로 등록된 차");
  });

  it("견적 요청을 끄면 인증번호도 안 보냄, 인증번호는 번호당 하루 5번", async () => {
    const now = at("2026-11-23");
    await saveSiteConfig(db, owner(), { ...(await siteConfig(db)), requests: false }, now);
    await expect(requestWebCode(db, PHONE, {}, now)).rejects.toThrow(/받지 않습니다/);
    await saveSiteConfig(db, owner(), { ...(await siteConfig(db)), requests: true }, now);
    for (let i = 0; i < 5; i++) await requestWebCode(db, PHONE, {}, new Date(now.getTime() + i * 60_000));
    await expect(requestWebCode(db, PHONE, {}, new Date(now.getTime() + 10 * 60_000))).rejects.toThrow(/더 보낼 수 없습니다/);
    await expect(saveSiteConfig(db, advisor(), { requests: true }, now)).rejects.toThrow(/대표만/);
    await expect(saveSiteConfig(db, owner(), { kakao: "http://evil.test" }, now)).rejects.toThrow(/pf\.kakao/);
  });

  it("홈페이지 인증번호로 내 차 수첩에 들어갈 수 없다(용도가 다름)", async () => {
    const now = at("2026-11-23");
    await submitWebRequest(db, base(await verified(now)), {}, now);
    const r = await requestWebCode(db, PHONE, {}, new Date(now.getTime() + 60_000));
    await expect(verifyCode(db, PHONE, r.demoCode!, {}, new Date(now.getTime() + 61_000))).rejects.toThrow(/먼저 받아|맞지 않습니다/);
    const ok = await requestCode(db, PHONE, {}, new Date(now.getTime() + 120_000));
    expect((await verifyCode(db, PHONE, ok.demoCode!, {}, new Date(now.getTime() + 121_000))).token).toBeTruthy();
  });
});

describe("비밀 답변", () => {
  it("답을 쓰면 회신함·알림 발송, 손님은 내 차 수첩에서만 본다. 고친 답은 다시 알리지 않음", async () => {
    const now = at("2026-11-23");
    const r = await submitWebRequest(db, base(await verified(now)), {}, now);
    await expect(replyToRequest(db, { id: ids.tech1, roles: ["technician"] }, r.id, "답입니다 50만 원", false, now)).rejects.toThrow(/상담을 쓸 수 있는/);
    const a = await replyToRequest(db, advisor(), r.id, "김손님 고객님, 예상 30~40만 원입니다.", false, now);
    expect(a.sent?.ok).toBe(true);
    expect(a.sent?.text).toContain("/my/consult");
    const [c] = await db.select().from(schema.consultation).where(eq(schema.consultation.id, r.id));
    expect(c.repliedAt).toBeTruthy();
    expect(c.advisorId).toBe(ids.advisor);
    const s = (await sessionOf(db, r.token!, now))!;
    const list = await myConsults(db, s);
    expect(list[0].reply).toContain("30~40만 원");
    expect((await replyToRequest(db, advisor(), r.id, "고친 답: 35만 원입니다.", false, now)).sent).toBeNull();
    expect((await replyToRequest(db, advisor(), r.id, "고친 답: 35만 원입니다.", true, now)).sent?.ok).toBe(true);
    // 다른 손님의 수첩에는 안 보인다
    const other = await submitWebRequest(db, { ...base(await verified(now, "010-2222-3333")), plateNo: "34나5678", name: "이다른" }, {}, now);
    const s2 = (await sessionOf(db, other.token!, now))!;
    expect((await myConsults(db, s2)).every((x) => !x.reply)).toBe(true);
  });
});
