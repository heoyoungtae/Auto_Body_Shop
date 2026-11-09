// 문자 발송·문구 서식: 동의별 받는 사람, 광고 규칙(마케팅 동의·야간·수신거부), 바꿈 칸, 이력
import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { createConsultation } from "@/modules/customer/service";
import { bodyIssues, finalText, listTemplates, recipients, removeTemplate, saveTemplate, sendMessages } from "@/modules/messaging/bulk";
import { listLogs, saveSms } from "@/modules/messaging/service";
import { seedShop, testDb } from "./db";

let db: Db;
let ids: Awaited<ReturnType<typeof seedShop>>;
beforeEach(async () => {
  db = await testDb();
  ids = await seedShop(db);
});
const day = new Date("2026-11-09T03:00:00Z"); // 12시
const night = new Date("2026-11-09T13:00:00Z"); // 22시
const base = { channel: "phone" as const, damageTypes: ["긁힘"], damageParts: "문", methods: [], insurance: "self" as const, result: "open" as const };

async function two() {
  await createConsultation(db, ids.advisor, { ...base, newCustomer: { name: "가나다", phone: "010-1111-2222" }, consent: { required: true, photo: false, marketing: false, method: "phone" }, newVehicle: { plateNo: "11가1111", model: "모닝", options: [] } }, day);
  await createConsultation(db, ids.advisor, { ...base, newCustomer: { name: "마바사", phone: "010-3333-4444" }, consent: { required: true, photo: false, marketing: true, method: "phone" }, newVehicle: { plateNo: "22나2222", model: "K5", options: [] } }, day);
}

describe("문자 발송", () => {
  it("문구 규칙", () => {
    expect(finalText("#{고객명}님 할인", "ad", "080-1", { 고객명: "홍" })).toBe("(광고)홍님 할인\n무료수신거부 080-1");
    expect(bodyIssues("#{이름}", "info", "").join()).toMatch(/모르는 바꿈 칸/);
    expect(bodyIssues("행사", "ad", "").join()).toMatch(/수신거부/);
  });

  it("정보성은 필수 동의 고객, 광고는 마케팅 동의 고객만. 밤 광고·수신거부 없음은 막는다", async () => {
    await two();
    expect((await recipients(db, { kind: "all" }, "info")).list.map((r) => r.name)).toEqual(["가나다", "마바사"]);
    const ad = await recipients(db, { kind: "all" }, "ad");
    expect(ad.list.map((r) => r.plateNo)).toEqual(["22나2222"]);
    expect(ad.excluded.marketing).toBe(1);
    await expect(sendMessages(db, ids.advisor, { scope: { kind: "all" }, purpose: "ad", body: "할인", expected: 1 }, day)).rejects.toThrow(/수신거부/);
    await saveSms(db, ids.owner, { provider: "demo", sender: "", optout: "080-123-4567", fields: {}, checklist: [] });
    await expect(sendMessages(db, ids.advisor, { scope: { kind: "all" }, purpose: "ad", body: "할인", expected: 1 }, night)).rejects.toThrow(/오후 9시/);
    await expect(sendMessages(db, ids.advisor, { scope: { kind: "all" }, purpose: "info", body: "휴무", expected: 1 }, day)).rejects.toThrow(/바뀌었습니다/);
    const r = await sendMessages(db, ids.advisor, { scope: { kind: "all" }, purpose: "ad", body: "#{고객명}님 #{차량번호} 광택 할인", expected: 1 }, day);
    expect(r).toMatchObject({ count: 1, ok: 1, demo: true });
    const [log] = await listLogs(db, 1);
    expect(log).toMatchObject({ purpose: "광고", customerName: "마바사" });
    expect(log.body).toBe("(광고)마바사님 22나2222 광택 할인\n무료수신거부 080-123-4567");
  });

  it("서식: 기본 서식, 더하기·지우기, 광고 표기는 직접 못 씀", async () => {
    expect((await listTemplates(db)).length).toBe(3);
    await expect(saveTemplate(db, ids.advisor, { title: "x", purpose: "ad", body: "(광고) 할인" })).rejects.toThrow(/저절로/);
    await saveTemplate(db, ids.advisor, { title: "점검", purpose: "info", body: "#{고객명}님 점검 안내" });
    const all = await listTemplates(db);
    expect(all.length).toBe(4);
    for (const t of all) await removeTemplate(db, ids.advisor, t.id);
    expect((await listTemplates(db)).length).toBe(0);
  });
});
