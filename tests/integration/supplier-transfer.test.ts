// 협력업체 옮기기(대표 요청 2026-11-20): 테스트 서버에서 내보내고 미니 PC 앱에서 가져온다
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { supplier } from "@/db/schema";
import { addSupplierDocFiles, createSupplier, setSupplierBank } from "@/modules/purchase/supplier";
import { exportSuppliers, importSuppliers } from "@/modules/purchase/supplier-transfer";
import { seedShop, testDb } from "./db";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 1, 2, 3]);
const base = { items: "", contactName: "김영업", phone: "031-111-2222", email: "", leadDays: 1, returnTerms: "", note: "" };

describe("협력업체 내보내기·가져오기", () => {
  it("후보를 서류 파일과 함께 옮기고, 계좌·통장 사본은 빼며, 이미 있는 업체는 건너뛴다", async () => {
    const src = await testDb();
    const a = await seedShop(src);
    const owner = { id: a.owner, roles: ["owner" as const] };
    const pm = { id: a.manager, roles: ["plant_manager" as const] };
    const s1 = await createSupplier(src, pm, { ...base, name: "한빛도료", bizNo: "2208162517", kinds: ["paint"], docs: ["biz"] });
    await addSupplierDocFiles(src, pm, s1, [{ doc: "biz", name: "사업자등록증.png", bytes: PNG }]);
    await setSupplierBank(src, owner, s1, { bankName: "국민", accountNo: "12345678901234", holder: "한빛도료" }).catch(() => undefined);
    await createSupplier(src, pm, { ...base, name: "번호없는 외주", bizNo: "", kinds: ["outsource"], docs: [] });
    await expect(exportSuppliers(src, { id: a.tech1, roles: ["technician"] })).rejects.toThrow(/공장장/);
    const pack = await exportSuppliers(src, pm);
    expect(pack.suppliers.map((s) => s.name).sort()).toEqual(["번호없는 외주", "한빛도료"]);
    const text = JSON.stringify(pack);
    expect(text).not.toMatch(/12345678901234|bankAccount|bankbook/);

    const dst = await testDb();
    const b = await seedShop(dst);
    const pm2 = { id: b.manager, roles: ["plant_manager" as const] };
    await createSupplier(dst, pm2, { ...base, name: "이미 있음", bizNo: "", kinds: ["parts"], docs: [] });
    await expect(importSuppliers(dst, pm2, "{nope")).rejects.toThrow(/내보내기 파일/);
    const r = await importSuppliers(dst, pm2, text);
    expect(r.added.map((x) => [x.name, x.files])).toEqual([
      ["번호없는 외주", 0],
      ["한빛도료", 1],
    ]);
    const [got] = await dst.select().from(supplier).where(eq(supplier.name, "한빛도료"));
    expect(got).toMatchObject({ status: "candidate", bizNo: "220-81-62517", contactName: "김영업", bankAccountEnc: null, docs: ["biz"] });
    expect(got.docFiles).toHaveLength(1);
    // 두 번 올려도 겹치지 않는다
    const again = await importSuppliers(dst, pm2, text);
    expect(again.added).toHaveLength(0);
    expect(again.skipped.map((s) => s.why)).toEqual([expect.stringMatching(/같은 이름/), expect.stringMatching(/사업자등록번호/)]);
  });
});
