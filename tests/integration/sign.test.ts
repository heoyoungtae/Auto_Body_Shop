// 직인(사업장 정보)·내 서명: 발급 때 서류에 고정, 사업장 정보를 다시 저장해도 직인 유지, 주소 한 줄
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { saveUserSignature, userSignature } from "@/modules/auth/signature";
import { loadShopInfo, saveShopInfo, saveShopSeal, shopAddressLine } from "@/modules/platform/shop";
import { getEstimate } from "@/modules/repair/estimate";
import { approvedRepair, PNG, WEBP } from "./flow";
import { seedShop, testDb } from "./db";

beforeAll(() => {
  process.env.STORAGE_DIR = mkdtempSync(join(tmpdir(), "abs-files-"));
});
let db: Db;
let ids: Awaited<ReturnType<typeof seedShop>>;
beforeEach(async () => {
  db = await testDb();
  ids = await seedShop(db);
});
const now = new Date("2026-11-09T01:00:00Z");

describe("직인·서명", () => {
  it("주소는 '(우편번호) 주소, 상세주소' 한 줄, 우편번호는 5자리", async () => {
    expect(shopAddressLine({ zip: "12345", address: "경기도 ○○시 ○○로 12 (○○동)", addressDetail: "1층" })).toBe("(12345) 경기도 ○○시 ○○로 12 (○○동), 1층");
    expect(shopAddressLine({ address: "경기도" })).toBe("경기도");
    const base = { name: "외관수리", ceo: "김대표", bizNo: "", repairRegNo: "", address: "경기도", phone: "031" };
    await expect(saveShopInfo(db, ids.owner, { ...base, zip: "1234" })).rejects.toThrow(/5자리/);
    await saveShopInfo(db, ids.owner, { ...base, zip: "12345", addressDetail: "1층" });
    expect((await loadShopInfo(db)).zip).toBe("12345");
  });

  it("PNG 만 받고, 발급 때의 직인·작성자 서명이 견적서에 고정된다", async () => {
    await expect(saveShopSeal(db, ids.owner, WEBP)).rejects.toThrow(/직인/);
    await expect(saveUserSignature(db, ids.advisor, WEBP)).rejects.toThrow(/서명/);
    await saveShopSeal(db, ids.owner, PNG);
    await saveUserSignature(db, ids.advisor, PNG);
    const seal = (await loadShopInfo(db)).sealPath;
    const sign = await userSignature(db, ids.advisor);
    expect(seal).toMatch(/^shop\/seal\/.+\.png$/);
    expect(sign).toMatch(new RegExp(`^sign/${ids.advisor}/.+\\.png$`));

    // 견적 흐름 안에서 사업장 정보를 다시 저장해도 직인은 그대로
    const { estimateId } = await approvedRepair(db, ids, now);
    const snap = (await getEstimate(db, estimateId)).snapshot as { shop: { sealPath: string }; writerSign: string | null };
    expect(snap.shop.sealPath).toBe(seal);
    expect(snap.writerSign).toBe(sign);

    // 바꾸거나 지워도 이미 낸 서류는 그대로
    await saveShopSeal(db, ids.owner, null);
    await saveUserSignature(db, ids.advisor, null);
    expect((await loadShopInfo(db)).sealPath).toBe("");
    expect(await userSignature(db, ids.advisor)).toBeNull();
    const again = (await getEstimate(db, estimateId)).snapshot as { shop: { sealPath: string }; writerSign: string | null };
    expect(again.shop.sealPath).toBe(seal);
    expect(again.writerSign).toBe(sign);
  });
});
