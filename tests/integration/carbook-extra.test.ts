// 내 차 수첩 3단계: 푸시(깨우기만·받은편지함·끊긴 기기 지움·안 되면 카톡/문자), 사진으로 상담 요청(상담 일지), 수리 이력 확인서(확인 번호·무효)
import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import * as schema from "@/db/schema";
import { requestCode, sessionOf, verifyCode } from "@/modules/carbook/service";
import { carbookAlertsJob, saveInsurance, setConsent } from "@/modules/carbook/records";
import { sendPush, subscribePush, takeInbox, vapidAuth, vapidKeys } from "@/modules/carbook/push";
import { issueCert, maskPlate, myCerts, requestConsult, revokeCert, verifyCert, type ConsultRequestInput } from "@/modules/carbook/requests";
import { seedShop, testDb } from "./db";
import { approvedRepair, PNG } from "./flow";

let db: Db;
let ids: Awaited<ReturnType<typeof seedShop>>;
beforeEach(async () => {
  db = await testDb();
  ids = await seedShop(db);
});
const PHONE = "010-1234-5678";
const at = (d: string) => new Date(`${d}T03:00:00Z`);
async function login(now: Date) {
  const r = await requestCode(db, PHONE, {}, now);
  const { token } = await verifyCode(db, PHONE, r.demoCode!, {}, now);
  return (await sessionOf(db, token, now))!;
}
const EP = "https://fcm.googleapis.com/fcm/send/abc";
const EP2 = "https://web.push.apple.com/xyz";

describe("푸시", () => {
  it("열쇠는 한 번 만들어 계속 쓰고, 서명은 ES256 JWT", async () => {
    const v = await vapidKeys(db);
    expect((await vapidKeys(db)).publicKey).toBe(v.publicKey);
    expect(Buffer.from(v.publicKey, "base64url")).toHaveLength(65);
    const h = vapidAuth(v, EP, at("2026-11-21"));
    expect(h).toMatch(/^vapid t=[\w-]+\.[\w-]+\.[\w-]+, k=/);
    const payload = JSON.parse(Buffer.from(h.split(".")[1], "base64url").toString());
    expect(payload.aud).toBe("https://fcm.googleapis.com");
  });

  it("기기마다 깨우기, 410이면 기기 지움, 하나도 못 받으면 ok=false·받은편지함 비움", async () => {
    await approvedRepair(db, ids, at("2026-11-01"));
    const now = at("2026-11-21");
    const s = await login(now);
    await expect(subscribePush(db, { ...s, scope: "link" }, EP, null, now)).rejects.toThrow(/문자 인증/);
    await expect(subscribePush(db, s, "http://x.test/a", null, now)).rejects.toThrow(/받을 수 없습니다/);
    await subscribePush(db, s, EP, "Chrome", now);
    await subscribePush(db, s, EP, "Chrome 2", now);
    await subscribePush(db, s, EP2, "Safari", now);
    expect(await db.select().from(schema.carbookPush)).toHaveLength(2);

    const calls: string[] = [];
    const fake = (async (url: string, init: RequestInit) => {
      calls.push(url);
      expect((init.headers as Record<string, string>).Authorization).toMatch(/^vapid /);
      return new Response(null, { status: url === EP2 ? 410 : 201 });
    }) as unknown as typeof fetch;
    const r = await sendPush(db, s.customerId, { title: "t", body: "b", url: "https://evil.test" }, now, fake);
    expect(r).toEqual({ ok: true, sent: 1 });
    expect(calls).toHaveLength(2);
    expect((await db.select().from(schema.carbookPush)).map((p) => p.endpoint)).toEqual([EP]);
    const box = await takeInbox(db, s, now);
    expect(box).toEqual([expect.objectContaining({ title: "t", body: "b", url: "/my" })]);
    expect(await takeInbox(db, s, now)).toHaveLength(0);

    const down = (async () => new Response(null, { status: 500 })) as unknown as typeof fetch;
    expect(await sendPush(db, s.customerId, { title: "t", body: "b", url: "/my" }, now, down)).toEqual({ ok: false, sent: 0 });
    expect(await takeInbox(db, s, now)).toHaveLength(0);
  });

  it("알림 작업은 푸시가 되면 문자·카톡을 보내지 않는다", async () => {
    const { roId } = await approvedRepair(db, ids, at("2026-11-01"));
    const [ro] = await db.select().from(schema.repairOrder).where(eq(schema.repairOrder.id, roId));
    const now = at("2027-02-15");
    const s = await login(now);
    await setConsent(db, s, true, {}, now);
    await saveInsurance(db, s, ro.vehicleId, "2027-03-01", now);
    await subscribePush(db, s, EP, null, now);
    const orig = globalThis.fetch;
    globalThis.fetch = (async () => new Response(null, { status: 201 })) as unknown as typeof fetch;
    try {
      expect(await carbookAlertsJob(db, now)).toMatch(/1명/);
    } finally {
      globalThis.fetch = orig;
    }
    expect(await db.select().from(schema.messageLog).where(eq(schema.messageLog.purpose, "내 차 수첩 알림"))).toHaveLength(0);
    expect((await takeInbox(db, s, now))[0].body).toMatch(/보험 만기 2027-03-01/);
  });
});

describe("사진으로 상담 요청", () => {
  const input = (vehicleId: string, x: Partial<ConsultRequestInput> = {}): ConsultRequestInput => ({ vehicleId, damageParts: "앞 범퍼 왼쪽 긁힘", damageZones: [], insurance: "self", insurer: "", wantDate: "", needs: "", photos: [PNG], ...x });

  it("상담 일지에 '고객용 화면'으로 들어가고 상담원에게 알림, 하루 3번까지", async () => {
    const { roId } = await approvedRepair(db, ids, at("2026-11-01"));
    const [ro] = await db.select().from(schema.repairOrder).where(eq(schema.repairOrder.id, roId));
    const now = at("2026-11-21");
    const s = await login(now);
    await expect(requestConsult(db, s, input("nope"), now)).rejects.toThrow(/어느 차/);
    await expect(requestConsult(db, s, input(ro.vehicleId, { damageParts: "" }), now)).rejects.toThrow(/차 그림/);
    await expect(requestConsult(db, s, input(ro.vehicleId, { insurance: "x" }), now)).rejects.toThrow(/수리비/);
    await expect(requestConsult(db, s, input(ro.vehicleId, { wantDate: "2026-11-01" }), now)).rejects.toThrow(/날짜/);
    await expect(requestConsult(db, s, input(ro.vehicleId, { photos: [new Uint8Array([1, 2, 3])] }), now)).rejects.toThrow(/사진 파일만/);
    const r = await requestConsult(db, s, input(ro.vehicleId, { insurance: "own", insurer: "삼성화재", wantDate: "2026-11-25" }), now);
    const [c] = await db.select().from(schema.consultation).where(eq(schema.consultation.id, r.id));
    expect(c).toMatchObject({ channel: "online", customerId: s.customerId, vehicleId: ro.vehicleId, photoCount: 1, insurance: "own", insurer: "삼성화재", wantDate: "2026-11-25", damageParts: "앞 범퍼 왼쪽 긁힘" });
    expect(c.photos[0]).toMatch(/^cs\/app\//);
    expect(c.docNo).toMatch(/^CS-/);
    expect(r.replyDue >= "2026-11-21").toBe(true);
    const notes = await db.select().from(schema.notification).where(eq(schema.notification.link, `/consults/${r.id}`));
    expect(notes.length).toBeGreaterThan(0);
    await requestConsult(db, s, input(ro.vehicleId), now);
    await requestConsult(db, s, input(ro.vehicleId), now);
    await expect(requestConsult(db, s, input(ro.vehicleId), now)).rejects.toThrow(/오늘은/);
    await expect(requestConsult(db, { ...s, scope: "link" }, input(ro.vehicleId), now)).rejects.toThrow(/문자 인증/);
  });
});

describe("수리 이력 확인서", () => {
  it("출고한 수리만, 금액은 고를 때만, 확인 번호로 누구나 확인, 무효로 하면 무효", async () => {
    const { roId, estimateId } = await approvedRepair(db, ids, at("2026-10-01"));
    const [ro] = await db.select().from(schema.repairOrder).where(eq(schema.repairOrder.id, roId));
    const now = at("2026-11-21");
    const s = await login(now);
    await expect(issueCert(db, s, ro.vehicleId, false, now)).rejects.toThrow(/출고한 수리가 없어/);
    await db.update(schema.repairOrder).set({ status: "delivered" }).where(eq(schema.repairOrder.id, roId));
    await db.insert(schema.repairStatement).values({ docNo: "IV-T-1", repairOrderId: roId, estimateId, issuedOn: "2026-10-25", deliveredAt: at("2026-10-25"), totalWon: 550_000, snapshot: { lines: [{ name: "앞 범퍼 도장" }, { name: "앞 범퍼 도장" }, { name: "탈착" }], warranty: [{ kind: "도장·판금", until: "2027-10-25" }] } });

    const a = await issueCert(db, s, ro.vehicleId, false, now);
    expect(a.docNo).toMatch(/^HC-/);
    expect(a.code).toMatch(/^[2-9A-HJ-NP-Z]{10}$/);
    const v = await verifyCert(db, `${a.code.slice(0, 5).toLowerCase()}-${a.code.slice(5)}`);
    expect(v?.snap.repairs).toEqual([expect.objectContaining({ outOn: "2026-10-25", items: ["앞 범퍼 도장", "탈착"], total: null, warranty: [{ kind: "도장·판금", until: "2027-10-25", live: true }] })]);
    expect(v?.revokedAt).toBeNull();
    const b = await issueCert(db, s, ro.vehicleId, true, now);
    expect((await verifyCert(db, b.code))?.snap.repairs[0].total).toBe(550_000);
    expect(await myCerts(db, s)).toHaveLength(2);

    await revokeCert(db, s, a.id, now);
    expect((await verifyCert(db, a.code))?.revokedAt).toBeTruthy();
    expect(await verifyCert(db, "AAAAA")).toBeNull();
    await expect(revokeCert(db, { ...s, customerId: "00000000-0000-0000-0000-000000000000" }, b.id, now)).rejects.toThrow(/찾을 수 없습니다/);
    expect(maskPlate("12가3456")).toBe("12가**56");
    expect(maskPlate("123가4567")).toBe("123가**67");
  });
});
