import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { auditLog, customer, messageLog, policySetting } from "@/db/schema";
import {
  capacity,
  changeConsent,
  createConsultation,
  CustomerError,
  getCustomer,
  listConsultations,
  revealPhone,
  searchCustomers,
  sendReminders,
  sendReservationConfirm,
  type ConsultInput,
} from "@/modules/customer/service";
import { addBusinessDays } from "@/modules/customer/rules";
import { addShopDay, saveCalendarRules } from "@/modules/platform/calendar";
import { seedShop, testDb } from "./db";

let db: Db;
let ids: Awaited<ReturnType<typeof seedShop>>;
beforeEach(async () => {
  db = await testDb();
  ids = await seedShop(db);
});

const now = new Date("2026-11-09T01:00:00Z"); // 월 10:00 KST
const yes = { required: true, photo: false, marketing: false, method: "phone" as const };
const base = (o: Partial<ConsultInput> = {}): ConsultInput => ({
  newCustomer: { name: "홍길동", phone: "010-1234-5678" },
  consent: yes,
  newVehicle: { plateNo: "12가 3456", model: "아반떼", year: 2021, colorCode: "swp" },
  channel: "phone",
  damageTypes: ["찌그러짐"],
  damageParts: "앞 범퍼",
  methods: ["덴트"],
  insurance: "self",
  result: "open",
  ...o,
});

describe("고객·상담(STD-01, STD-13)", () => {
  it("동의 없이 연락처를 저장할 수 없다", async () => {
    await expect(createConsultation(db, ids.advisor, base({ consent: undefined }), now)).rejects.toThrow(/필수 동의/);
    expect(await db.select().from(customer)).toHaveLength(0);
  });

  it("상담 번호는 CS-연월-순번, 연락처는 암호화하고 목록에는 가린 번호", async () => {
    const c = await createConsultation(db, ids.advisor, base(), now);
    expect(c.docNo).toBe("CS-2611-0001");
    const [row] = await db.select().from(customer);
    expect(row.phoneEnc).not.toContain("01012345678");
    expect(row.phoneMasked).toBe("010-****-5678");
    expect(await revealPhone(db, ids.advisor, row.id)).toBe("01012345678");
    expect((await db.select().from(auditLog)).some((a) => a.action === "customer.view_phone")).toBe(true);
  });

  it("같은 전화번호·차량번호는 새로 만들지 않고 다시 쓴다", async () => {
    await createConsultation(db, ids.advisor, base(), now);
    const again = await createConsultation(db, ids.advisor, base({ newCustomer: { name: "홍길동", phone: "01012345678" }, consent: undefined, newVehicle: { plateNo: "12가3456" } }), now);
    expect(await db.select().from(customer)).toHaveLength(1);
    const found = await searchCustomers(db, "5678");
    expect(found).toHaveLength(1);
    expect(found[0].vehicles[0].plateNo).toBe("12가3456");
    expect(found[0].vehicles[0].model).toBe("아반떼"); // 두 번째 상담에서 비운 차종이 지워지지 않음은 아래에서
    expect((await searchCustomers(db, "3456"))[0].id).toBe(again.customerId);
    expect((await searchCustomers(db, "홍길"))[0].id).toBe(again.customerId);
  });

  it("다른 고객의 차량번호는 막는다", async () => {
    await createConsultation(db, ids.advisor, base(), now);
    await expect(createConsultation(db, ids.advisor, base({ newCustomer: { name: "김철수", phone: "010-9999-0000" } }), now)).rejects.toThrow(/다른 고객의 차량/);
  });

  it("예상 금액을 적으면 '실차 진단 후 확정' 안내 체크가 있어야 한다", async () => {
    await expect(createConsultation(db, ids.advisor, base({ estMin: 100000, estMax: 200000 }), now)).rejects.toBeInstanceOf(CustomerError);
    await expect(createConsultation(db, ids.advisor, base({ estMin: 100000, estMax: 200000, estNoticed: true }), now)).resolves.toBeTruthy();
  });

  it("보험 건은 사고접수번호 없이 예약할 수 없다", async () => {
    await expect(createConsultation(db, ids.advisor, base({ insurance: "other", insurer: "가나화재", result: "reserved", reservedDate: "2026-11-10", reservedTime: "10:00" }), now)).rejects.toThrow(/사고접수번호/);
  });

  it("입고 한도가 차면 공장장 동의 표시 없이는 예약되지 않는다", async () => {
    await db.insert(policySetting).values({ key: "intake.daily_capacity", value: 1, effectiveFrom: "2026-11-01", reason: "시험", changedBy: ids.owner });
    const r = { result: "reserved" as const, reservedDate: "2026-11-10", reservedTime: "10:00" };
    await createConsultation(db, ids.advisor, base(r), now);
    expect(await capacity(db, "2026-11-10")).toMatchObject({ count: 1, cap: 1, full: true });
    const other = { newCustomer: { name: "김철수", phone: "010-2222-3333" }, newVehicle: { plateNo: "34나5678" } };
    await expect(createConsultation(db, ids.advisor, base({ ...other, ...r }), now)).rejects.toThrow(/한도/);
    const ok = await createConsultation(db, ids.advisor, base({ ...other, ...r, overCapacityOk: true }), now);
    expect(ok.overCapacityOk).toBe(true);
  });

  it("재연락 날은 정책값(3일 뒤)으로 채우고, 그날 '챙길 상담'에 나온다", async () => {
    const c = await createConsultation(db, ids.advisor, base({ result: "recontact" }), now);
    expect(c.recontactOn).toBe("2026-11-12");
    expect(await listConsultations(db, "due", now)).toHaveLength(0);
    expect((await listConsultations(db, "due", new Date("2026-11-12T01:00:00Z"))).map((x) => x.id)).toEqual([c.id]);
  });

  it("문자·화면으로 온 상담은 회신 기한(영업일)이 있고 지나면 표시된다", async () => {
    const c = await createConsultation(db, ids.advisor, base({ channel: "online" }), new Date("2026-11-13T01:00:00Z")); // 금
    expect(c.replyDue).toBe("2026-11-16"); // 다음 영업일 월
    const late = await listConsultations(db, "active", new Date("2026-11-17T01:00:00Z"));
    expect(late[0].flags.map((f) => f.label)).toContain("회신 기한 지남");
  });

  it("예약 확인과 전날 안내를 보내고 이력에 남긴다(데모)", async () => {
    const c = await createConsultation(db, ids.advisor, base({ result: "reserved", reservedDate: "2026-11-10", reservedTime: "10:30" }), now);
    const r = await sendReservationConfirm(db, ids.advisor, c.id, now);
    expect(r.ok).toBe(true);
    expect(r.text).toContain("홍길동 고객님");
    expect(r.text).toContain("11월 10일");
    expect(await sendReminders(db, now)).toBe("전날 안내 1건");
    expect(await sendReminders(db, now)).toBe("전날 안내 0건"); // 두 번 보내지 않음
    const logs = await db.select().from(messageLog);
    expect(logs.map((l) => l.purpose)).toEqual(["예약 확인", "예약 전날 안내"]);
    expect(logs[0].customerName).toBe("홍길동");
  });

  it("필수 동의를 철회하면 연락처를 지운다", async () => {
    const c = await createConsultation(db, ids.advisor, base(), now);
    await changeConsent(db, ids.advisor, c.customerId, { required: false, photo: false, marketing: false, method: "phone" });
    const [row] = await db.select().from(customer).where(eq(customer.id, c.customerId));
    expect(row.phoneEnc).toBeNull();
    const g = await getCustomer(db, c.customerId);
    expect(g.consents[0].withdrawal).toBe(true);
  });

  it("영업일 계산은 주말을 건너뛴다", () => {
    expect(addBusinessDays("2026-11-13", 1)).toBe("2026-11-16");
    expect(addBusinessDays("2026-11-09", 3)).toBe("2026-11-12");
  });
});

describe("동의 링크·차대번호·주행거리", () => {
  it("동의를 링크로 요청하면 저장되고, 고객이 링크에서 동의하면 기록된다", async () => {
    const { acceptConsentRequest, consentRequestView, consentState } = await import("@/modules/customer/service");
    const c = await createConsultation(db, ids.advisor, base({ consent: undefined, requestConsent: true }), now);
    expect(c.consentSent?.ok).toBe(true);
    expect((await consentState(db, c.customerId)).required).toBe(false);
    const token = c.consentSent!.token;
    expect((await consentRequestView(db, token, now)).state).toBe("open");
    await acceptConsentRequest(db, token, { required: true, photo: false, marketing: true }, {}, now);
    const st = await consentState(db, c.customerId);
    expect(st).toMatchObject({ required: true, marketing: true, method: "online" });
    expect((await consentRequestView(db, token, now)).state).toBe("used");
  });

  it("기한 안에 동의가 없으면 연락처를 지운다", async () => {
    const { purgeUnconsented } = await import("@/modules/customer/service");
    const c = await createConsultation(db, ids.advisor, base({ consent: undefined, requestConsent: true }), now);
    expect(await purgeUnconsented(db, new Date("2026-11-11T01:00:00Z"))).toBe("동의 없는 연락처 0건 삭제");
    expect(await purgeUnconsented(db, new Date("2026-11-12T02:00:00Z"))).toBe("동의 없는 연락처 1건 삭제");
    const [row] = await db.select().from(customer).where(eq(customer.id, c.customerId));
    expect(row.phoneEnc).toBeNull();
  });

  it("차대번호에서 제조사·연식을 채우고, 주행거리가 줄면 막는다", async () => {
    const { vehicle } = await import("@/db/schema");
    await createConsultation(db, ids.advisor, base({ newVehicle: { plateNo: "12가3456", vin: "KMHL341CBRA123456", model: "쏘나타" }, mileage: 45000 }), now);
    const [v] = await db.select().from(vehicle);
    expect(v).toMatchObject({ maker: "현대", year: 2024, mileage: 45000 });
    await expect(createConsultation(db, ids.advisor, base({ newVehicle: { plateNo: "12가3456" }, mileage: 40000, consent: undefined, newCustomer: { name: "홍길동", phone: "01012345678" } }), now)).rejects.toThrow(/주행거리/);
  });

  it("쉬는 날에는 예약할 수 없고, 회신 기한은 설정의 영업일로 센다", async () => {
    await addShopDay(db, ids.owner, { date: "2026-11-10", kind: "closed", name: "설비 점검" });
    await expect(createConsultation(db, ids.advisor, base({ result: "reserved", reservedDate: "2026-11-10", reservedTime: "10:00" }), now)).rejects.toThrow(/쉬는 날/);
    await expect(createConsultation(db, ids.advisor, base({ result: "reserved", reservedDate: "2026-11-14", reservedTime: "10:00" }), now)).rejects.toThrow(/토요일 휴무/);
    const c = await createConsultation(db, ids.advisor, base({ channel: "message" }), now);
    expect(c.replyDue).toBe("2026-11-11"); // 11/10 휴무를 건너뜀
    await saveCalendarRules(db, ids.owner, { workdays: [1, 2, 3, 4, 5, 6], excludeHolidays: true });
    const r = await createConsultation(db, ids.advisor, base({ newCustomer: { name: "김토", phone: "010-2222-3333" }, newVehicle: { plateNo: "34나5678" }, result: "reserved", reservedDate: "2026-11-14", reservedTime: "10:00" }), now);
    expect(r.result).toBe("reserved");
  });
});
