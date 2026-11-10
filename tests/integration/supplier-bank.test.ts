// 협력업체 입금 계좌(사용자 지시 2026-11-10): 암호화 저장, 권한별 열람, 변경 시 확인 풀림·대표 알림, 다른 사람이 전화 확인
import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { auditLog, notification, supplier } from "@/db/schema";
import { myTodos } from "@/modules/dashboard/todo";
import { holderMismatch, maskAccount } from "@/modules/purchase/rules";
import { addSupplierDocFiles, createSupplier, getSupplier, removeSupplierDocFile, setSupplierBank, storedFileAllowed, supplierBank, verifySupplierBank } from "@/modules/purchase/supplier";
import { seedShop, testDb } from "./db";

let db: Db;
let ids: Awaited<ReturnType<typeof seedShop>>;
beforeEach(async () => {
  db = await testDb();
  ids = await seedShop(db);
});
const now = new Date("2026-11-10T00:00:00Z");
const owner = () => ({ id: ids.owner, roles: ["owner" as const] });
const manager = () => ({ id: ids.manager, roles: ["plant_manager" as const] });
const acct = () => ({ id: ids.account, roles: ["accounting" as const] });
const tech = () => ({ id: ids.tech1, roles: ["technician" as const] });

describe("협력업체 입금 계좌", () => {
  it("규칙", () => {
    expect(maskAccount("123456789012")).toBe("123*****9012");
    expect(holderMismatch("(주)한빛 도료", "한빛도료")).toBe(false);
    expect(holderMismatch("김철수", "한빛도료")).toBe(true);
  });

  it("넣기·보기·바꾸기·확인", async () => {
    const id = await createSupplier(db, manager(), { name: "한빛도료", bizNo: "", kinds: ["paint"], items: "", contactName: "", phone: "", email: "", leadDays: 2, returnTerms: "", docs: [], note: "" }, now);
    await expect(setSupplierBank(db, manager(), id, { bankName: "KB국민", accountNo: "123-456-789012", holder: "한빛도료" }, now)).rejects.toThrow(/회계/);
    await expect(setSupplierBank(db, acct(), id, { bankName: "KB국민", accountNo: "12-34", holder: "한빛도료" }, now)).rejects.toThrow(/10~16/);
    const r = await setSupplierBank(db, acct(), id, { bankName: "KB국민", accountNo: "123-456-789012", holder: "(주)한빛도료" }, now);
    expect(r).toEqual({ changed: true, mismatch: false });

    // 저장은 암호문, 화면 데이터에는 암호문이 없음
    const [row] = await db.select().from(supplier).where(eq(supplier.id, id));
    expect(row.bankAccountEnc).toMatch(/^s1\./);
    expect(row.bankAccountMasked).toBe("123*****9012");
    expect((await getSupplier(db, id, now)).s.bankAccountEnc).toBeNull();

    // 권한별 열람
    expect((await supplierBank(db, acct(), id))?.full).toBe("123456789012");
    expect((await supplierBank(db, manager(), id))?.full).toBeNull();
    expect((await supplierBank(db, manager(), id))?.masked).toBe("123*****9012");

    // 넣은 사람은 확인 못 함, 대표가 확인
    await expect(verifySupplierBank(db, acct(), id, "전화", now)).rejects.toThrow(/다른 사람/);
    expect((await myTodos(db, owner(), now)).some((t) => t.key === `sup-bank-${id}`)).toBe(true);
    await expect(verifySupplierBank(db, owner(), id, "", now)).rejects.toThrow(/적어/);
    await verifySupplierBank(db, owner(), id, "업체 대표 번호로 전화", now);
    expect((await supplierBank(db, acct(), id))?.verified).toBe(true);

    // 같은 값이면 그대로, 번호 칸 비우고 예금주만 바꿔도 확인이 풀리고 대표 알림
    expect((await setSupplierBank(db, acct(), id, { bankName: "KB국민", accountNo: "", holder: "(주)한빛도료" }, now)).changed).toBe(false);
    const r2 = await setSupplierBank(db, acct(), id, { bankName: "신한", accountNo: "", holder: "김철수" }, new Date(now.getTime() + 1000));
    expect(r2).toEqual({ changed: true, mismatch: true });
    const b = await supplierBank(db, acct(), id);
    expect(b?.full).toBe("123456789012");
    expect(b?.verified).toBe(false);
    const n = await db.select().from(notification).where(eq(notification.userId, ids.owner));
    expect(n.some((x) => x.title.includes("입금 계좌 변경") && x.title.includes("한빛도료"))).toBe(true);

    // 감사 기록·알림에 전체 번호가 남지 않음
    const logs = await db.select().from(auditLog).where(eq(auditLog.entityId, id));
    expect(JSON.stringify(logs)).not.toContain("123456789012");
    expect(JSON.stringify(n)).not.toContain("123456789012");

    // 후보 등록 때 같이 넣기(공장장): 확인 전, 공장장은 가린 번호만, 회계가 확인
    const base = { bizNo: "", kinds: ["parts"], items: "", contactName: "", phone: "", email: "", leadDays: 2, returnTerms: "", docs: [], note: "" };
    await expect(createSupplier(db, manager(), { ...base, name: "가나부품" }, now, { bankName: "신한", accountNo: "", holder: "" })).rejects.toThrow(/계좌번호/);
    const id2 = await createSupplier(db, manager(), { ...base, name: "다라부품" }, now, { bankName: "신한", accountNo: "110-123-456789", holder: "다라부품" });
    expect((await supplierBank(db, manager(), id2))).toMatchObject({ full: null, masked: "110*****6789", verified: false });
    const id3 = await createSupplier(db, manager(), { ...base, name: "마바부품" }, now, { bankName: "", accountNo: "", holder: "" });
    expect(await supplierBank(db, owner(), id3)).toBeNull();
    await expect(verifySupplierBank(db, manager(), id2, "전화", now)).rejects.toThrow(/회계/);
    await verifySupplierBank(db, acct(), id2, "업체 대표 번호로 전화", now);
    expect((await supplierBank(db, acct(), id2))?.full).toBe("110123456789");

    await setSupplierBank(db, owner(), id, { bankName: "", accountNo: "", holder: "", remove: true }, new Date(now.getTime() + 2000));
    expect(await supplierBank(db, owner(), id)).toBeNull();
  });

  it("서류 파일: 사진·PDF만, 붙이면 체크, 통장 사본은 회계·대표만 열람", async () => {
    const id = await createSupplier(db, manager(), { name: "사아부품", bizNo: "", kinds: ["parts"], items: "", contactName: "", phone: "", email: "", leadDays: 2, returnTerms: "", docs: [], note: "" }, now);
    const pdf = new TextEncoder().encode("%PDF-1.4\n%%EOF");
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
    await expect(addSupplierDocFiles(db, manager(), id, [{ doc: "biz", name: "a.txt", bytes: new TextEncoder().encode("hello") }], now)).rejects.toThrow(/PDF/);
    await expect(addSupplierDocFiles(db, tech(), id, [{ doc: "biz", name: "a.pdf", bytes: pdf }], now)).rejects.toThrow(/공장장/);
    expect(await addSupplierDocFiles(db, manager(), id, [{ doc: "biz", name: "사업자등록증.pdf", bytes: pdf }, { doc: "bankbook", name: "통장.png", bytes: png }], now)).toBe(2);
    const { s } = await getSupplier(db, id, now);
    expect(s.docs).toEqual(expect.arrayContaining(["biz", "bankbook"]));
    expect(s.docFiles.map((f) => f.path.split(".").pop())).toEqual(["pdf", "png"]);
    const bankbook = s.docFiles.find((f) => f.doc === "bankbook")!.path;
    expect(storedFileAllowed(manager(), bankbook)).toBe(false);
    expect(storedFileAllowed(acct(), bankbook)).toBe(true);
    expect(storedFileAllowed(manager(), s.docFiles[0].path)).toBe(true);
    await removeSupplierDocFile(db, manager(), id, s.docFiles[0].path, now);
    expect((await getSupplier(db, id, now)).s.docFiles.length).toBe(1);
  });
});
