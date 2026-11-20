// 협력업체 옮기기(대표 요청 2026-11-20): 테스트 서버에서 내보내고 미니 PC 앱에서 가져온다
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { supplier } from "@/db/schema";
import { decrypt } from "@/modules/auth/crypto";
import { addSupplierDocFiles, createSupplier, setSupplierBank, verifySupplierBank } from "@/modules/purchase/supplier";
import { exportSuppliers, importSuppliers } from "@/modules/purchase/supplier-transfer";
import { seedShop, testDb } from "./db";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 1, 2, 3]);
const base = { items: "", contactName: "김영업", phone: "031-111-2222", email: "", leadDays: 1, returnTerms: "", note: "" };

describe("협력업체 내보내기·가져오기", () => {
  it("후보를 서류 파일·계좌·통장 사본과 함께 옮기고(계좌 권한자만), 계좌는 확인 전으로, 이미 있는 업체는 건너뛴다", async () => {
    const src = await testDb();
    const a = await seedShop(src);
    const owner = { id: a.owner, roles: ["owner" as const] };
    const pm = { id: a.manager, roles: ["plant_manager" as const] };
    const s1 = await createSupplier(src, pm, { ...base, name: "한빛도료", bizNo: "2208162517", kinds: ["paint"], docs: ["biz"] });
    await addSupplierDocFiles(src, pm, s1, [{ doc: "biz", name: "사업자등록증.png", bytes: PNG }]);
    await setSupplierBank(src, owner, s1, { bankName: "국민", accountNo: "12345678901234", holder: "한빛도료" });
    await addSupplierDocFiles(src, owner, s1, [{ doc: "bankbook", name: "통장.png", bytes: PNG }]);
    await createSupplier(src, pm, { ...base, name: "번호없는 외주", bizNo: "", kinds: ["outsource"], docs: [] });
    await expect(exportSuppliers(src, { id: a.tech1, roles: ["technician"] })).rejects.toThrow(/공장장/);
    // 공장장이 내보내면 계좌·통장 사본은 빠진다
    expect(JSON.stringify(await exportSuppliers(src, pm))).not.toMatch(/12345678901234|bankbook/);
    const pack = await exportSuppliers(src, owner);
    expect(pack.suppliers.map((s) => s.name).sort()).toEqual(["번호없는 외주", "한빛도료"]);
    const text = JSON.stringify(pack);
    expect(text).toMatch(/12345678901234/);

    const dst = await testDb();
    const b = await seedShop(dst);
    const pm2 = { id: b.manager, roles: ["plant_manager" as const] };
    const owner2 = { id: b.owner, roles: ["owner" as const] };
    await createSupplier(dst, pm2, { ...base, name: "이미 있음", bizNo: "", kinds: ["parts"], docs: [] });
    await expect(importSuppliers(dst, pm2, "{nope")).rejects.toThrow(/내보내기 파일/);
    const r = await importSuppliers(dst, owner2, text);
    expect(r.added.map((x) => [x.name, x.files, x.bank])).toEqual([
      ["번호없는 외주", 0, false],
      ["한빛도료", 2, true],
    ]);
    const [got] = await dst.select().from(supplier).where(eq(supplier.name, "한빛도료"));
    expect(got).toMatchObject({ status: "candidate", bizNo: "220-81-62517", contactName: "김영업", bankName: "국민", bankHolder: "한빛도료", bankChangedBy: b.owner, bankVerifiedAt: null });
    expect(decrypt(got.bankAccountEnc!)).toBe("12345678901234");
    expect(got.docFiles.map((f) => f.doc).sort()).toEqual(["bankbook", "biz"]);
    // 앞서 계좌 없이(공장장 파일로) 가져온 업체에 대표 파일로 다시 가져오면 비어 있는 계좌·통장 사본만 채운다
    const dst2 = await testDb();
    const c = await seedShop(dst2);
    const noBank = JSON.stringify(await exportSuppliers(src, pm));
    await importSuppliers(dst2, { id: c.owner, roles: ["owner"] }, noBank);
    const [before] = await dst2.select().from(supplier).where(eq(supplier.name, "한빛도료"));
    expect(before.bankAccountEnc).toBeNull();
    const fill = await importSuppliers(dst2, { id: c.owner, roles: ["owner"] }, text);
    expect(fill.added).toHaveLength(0);
    expect(fill.filled).toEqual([{ name: "한빛도료", bank: true, files: 1, verified: false }]);
    const [after] = await dst2.select().from(supplier).where(eq(supplier.name, "한빛도료"));
    expect(decrypt(after.bankAccountEnc!)).toBe("12345678901234");
    expect(after.docFiles.map((f) => f.doc).sort()).toEqual(["bankbook", "biz"]);
    // 두 번 올려도 겹치지 않는다
    const again = await importSuppliers(dst, pm2, text);
    expect(again.added).toHaveLength(0);
    expect(again.skipped.map((s) => s.why)).toEqual([expect.stringMatching(/같은 이름/), expect.stringMatching(/사업자등록번호/)]);

    // 보내는 쪽에서 확인한 계좌는 확인한 그대로 옮긴다(대표 2026-11-20). 이미 확인 없이 가져온 곳은 같은 번호면 확인만 채운다
    await verifySupplierBank(src, owner, s1, "업체 대표 번호로 전화, 김부장 확인", new Date("2026-11-19T10:00:00+09:00"));
    const vtext = JSON.stringify(await exportSuppliers(src, owner));
    const re = await importSuppliers(dst, owner2, vtext);
    expect(re.filled).toEqual([{ name: "한빛도료", bank: false, files: 0, verified: true }]);
    const [v] = await dst.select().from(supplier).where(eq(supplier.name, "한빛도료"));
    expect(v.bankVerifiedBy).toBe(b.owner);
    expect(v.bankVerifiedAt?.toISOString()).toBe("2026-11-19T01:00:00.000Z");
    expect(v.bankVerifyNote).toMatch(/테스트 서버에서 확인됨.*김부장 확인/);
    // 새로 가져오는 곳도 확인된 채로
    const dst3 = await testDb();
    const d = await seedShop(dst3);
    const r3 = await importSuppliers(dst3, { id: d.owner, roles: ["owner"] }, vtext);
    expect(r3.added.find((x) => x.name === "한빛도료")).toMatchObject({ bank: true, verified: true });
    const [v3] = await dst3.select().from(supplier).where(eq(supplier.name, "한빛도료"));
    expect(v3.bankVerifiedAt).not.toBeNull();
  });
});
