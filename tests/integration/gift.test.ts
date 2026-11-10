// 기프티콘 발송(데모 모드): 동의·마케팅 규칙, 불만 보상은 대표, 중복 확인, 건당 상한·월 예산, 취소
import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { messageLog } from "@/db/schema";
import { createConsultation } from "@/modules/customer/service";
import {
  cancelGift,
  findGiftCustomers,
  giftTarget,
  listGifts,
  monthSpent,
  sendGift,
} from "@/modules/messaging/gift-send";
import { saveGift } from "@/modules/messaging/service";
import { seedShop, testDb } from "./db";

let db: Db;
let ids: Awaited<ReturnType<typeof seedShop>>;
beforeEach(async () => {
  db = await testDb();
  ids = await seedShop(db);
});
const day = new Date("2026-11-09T03:00:00Z");
const base = {
  channel: "phone" as const,
  damageTypes: ["긁힘"],
  damageParts: "문",
  methods: [],
  insurance: "self" as const,
  result: "open" as const,
};
const adv = () => ({ id: ids.advisor, roles: ["advisor" as const] });
const owner = () => ({ id: ids.owner, roles: ["owner" as const] });
const tech = () => ({ id: ids.tech1, roles: ["technician" as const] });
const gi = (
  customerId: string,
  o: Partial<Parameters<typeof sendGift>[2]> = {},
) => ({
  customerId,
  purpose: "thanks",
  reason: "후기 감사",
  complaintId: "",
  goodsCode: "DEMO-AMERICANO",
  message: "",
  dupOk: false,
  ...o,
});

async function two() {
  await createConsultation(
    db,
    ids.advisor,
    {
      ...base,
      newCustomer: { name: "가나다", phone: "010-1111-2222" },
      consent: {
        required: true,
        photo: false,
        marketing: false,
        method: "phone",
      },
      newVehicle: { plateNo: "11가1111", model: "모닝", options: [] },
    },
    day,
  );
  await createConsultation(
    db,
    ids.advisor,
    {
      ...base,
      newCustomer: { name: "마바사", phone: "010-3333-4444" },
      consent: {
        required: true,
        photo: false,
        marketing: true,
        method: "phone",
      },
      newVehicle: { plateNo: "22나2222", model: "K5", options: [] },
    },
    day,
  );
  const [a] = await findGiftCustomers(db, "가나다");
  const [b] = await findGiftCustomers(db, "4444");
  return { noMkt: a.id, mkt: b.id };
}
const settings = (
  o: { monthLimit?: number; unitLimit?: number; dupDays?: number } = {},
) =>
  saveGift(db, ids.owner, {
    provider: "demo",
    callback: "",
    monthLimit: 0,
    unitLimit: 0,
    dupDays: 30,
    fields: {},
    checklist: [],
    ...o,
  });

describe("기프티콘", () => {
  it("동의·목적 규칙과 권한", async () => {
    const c = await two();
    expect(await giftTarget(db, c.noMkt, day)).toMatchObject({
      required: true,
      marketing: false,
      hasPhone: true,
    });
    await expect(sendGift(db, tech(), gi(c.mkt), day)).rejects.toThrow(
      /대표·공장장·상담/,
    );
    await expect(
      sendGift(db, adv(), gi(c.mkt, { reason: " " }), day),
    ).rejects.toThrow(/이유/);
    await expect(sendGift(db, adv(), gi(c.noMkt), day)).rejects.toThrow(
      /광고 수신/,
    );
    await expect(
      sendGift(db, adv(), gi(c.noMkt, { purpose: "complaint" }), day),
    ).rejects.toThrow(/대표가/);
    await expect(
      sendGift(db, owner(), gi(c.noMkt, { purpose: "complaint" }), day),
    ).rejects.toThrow(/어느 불만/);
    await expect(
      sendGift(db, adv(), gi(c.mkt, { goodsCode: "X" }), day),
    ).rejects.toThrow(/상품/);
    // 마케팅 동의가 없어도 '기타'는 보낼 수 있다
    const r = await sendGift(
      db,
      adv(),
      gi(c.noMkt, { purpose: "other", reason: "수리 지연 사과" }),
      day,
    );
    expect(r).toMatchObject({ demo: true, price: 4700 });
    expect(r.docNo).toMatch(/^GF/);
    const logs = await db.select().from(messageLog);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      channel: "기프티콘",
      amount: 4700,
      status: "성공",
      ref: r.docNo,
    });
    expect(logs[0].toMasked).not.toContain("1111-2222");
  });

  it("중복 확인·건당 상한·월 예산", async () => {
    const c = await two();
    await settings({ unitLimit: 10000, monthLimit: 40000, dupDays: 30 });
    await expect(
      sendGift(db, adv(), gi(c.mkt, { goodsCode: "DEMO-CHICKEN" }), day),
    ).rejects.toThrow(/건당 상한/);
    await sendGift(db, owner(), gi(c.mkt, { goodsCode: "DEMO-GAS" }), day); // 대표는 상한 예외
    expect(await monthSpent(db, day)).toBe(30000);
    await expect(sendGift(db, adv(), gi(c.mkt), day)).rejects.toThrow(
      /이미 보낸/,
    );
    await expect(
      sendGift(
        db,
        adv(),
        gi(c.mkt, { dupOk: true, goodsCode: "DEMO-WASH" }),
        day,
      ),
    ).rejects.toThrow(/건당 상한/);
    await sendGift(
      db,
      adv(),
      gi(c.mkt, { dupOk: true, goodsCode: "DEMO-CAKE" }),
      day,
    );
    await expect(
      sendGift(
        db,
        adv(),
        gi(c.mkt, { dupOk: true, goodsCode: "DEMO-CAKE" }),
        day,
      ),
    ).rejects.toThrow(/예산/);
    // 30일이 지나면 중복 아님, 다음 달은 예산 새로
    const later = new Date("2026-12-15T03:00:00Z");
    expect((await giftTarget(db, c.mkt, later))!.recent).toHaveLength(0);
    await sendGift(db, adv(), gi(c.mkt, { goodsCode: "DEMO-CAKE" }), later);
  });

  it("취소: 보낸 사람이나 대표, 사유 필수, 예산에서 빠짐", async () => {
    const c = await two();
    const r = await sendGift(
      db,
      adv(),
      gi(c.mkt, { goodsCode: "DEMO-CAKE" }),
      day,
    );
    await expect(
      cancelGift(
        db,
        { id: ids.manager, roles: ["plant_manager"] },
        r.id,
        "잘못 보냄",
        day,
      ),
    ).rejects.toThrow(/보낸 사람이나 대표/);
    await expect(cancelGift(db, adv(), r.id, " ", day)).rejects.toThrow(/이유/);
    await cancelGift(db, owner(), r.id, "번호 잘못", day);
    await expect(cancelGift(db, adv(), r.id, "또", day)).rejects.toThrow(
      /보낸 상태/,
    );
    expect(await monthSpent(db, day)).toBe(0);
    const list = await listGifts(db, "2026-11");
    expect(JSON.stringify(list)).toContain("cancelled");
  });
});
