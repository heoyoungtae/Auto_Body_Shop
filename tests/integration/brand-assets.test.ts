// 로고·앱 아이콘 등록(대표 결정 2026-11-21): PNG만, 칸마다 모양·크기 확인, 대표만, 되돌리면 기본 그림
import { beforeEach, describe, expect, it } from "vitest";
import { deflateSync } from "node:zlib";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Db } from "@/db/client";
import { brandSize, brandUrl, checkBrandFile, loadBrand, pngSize, saveBrandAsset } from "@/modules/platform/brand-assets";
import { readStored } from "@/modules/platform/storage";
import { seedShop, testDb } from "./db";

/** w×h 크기의 진짜 PNG(투명 한 색) */
function png(w: number, h: number): Uint8Array {
  const crc = (b: Buffer) => {
    let c = ~0;
    for (const x of b) {
      c ^= x;
      for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
    }
    return ~c >>> 0;
  };
  const chunk = (t: string, d: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(d.length);
    const td = Buffer.concat([Buffer.from(t), d]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  return new Uint8Array(Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]));
}

let db: Db;
let ids: Awaited<ReturnType<typeof seedShop>>;
beforeEach(async () => {
  process.env.STORAGE_DIR = mkdtempSync(join(tmpdir(), "abs-files-"));
  db = await testDb();
  ids = await seedShop(db);
});
const owner = () => ({ id: ids.owner, roles: ["owner"] });

describe("로고·앱 아이콘", () => {
  it("PNG 크기를 읽고 칸마다 모양을 확인한다", () => {
    expect(pngSize(png(512, 512))).toEqual([512, 512]);
    expect(() => checkBrandFile("app-icon", png(512, 300))).toThrow(/정사각형/);
    expect(() => checkBrandFile("app-icon", png(100, 100))).toThrow(/192px/);
    expect(() => checkBrandFile("logo-light", png(400, 300))).toThrow(/가로로 긴/);
    expect(() => checkBrandFile("small-icon", new Uint8Array([0xff, 0xd8, 0xff, 0, 0]))).toThrow(/PNG 파일만/);
    expect(checkBrandFile("logo-dark", png(1400, 300))).toEqual([1400, 300]);
  });

  it("등록하면 주소가 /brand 로 바뀌고, 되돌리면 기본 그림", async () => {
    const t = new Date("2026-11-21T02:00:00Z");
    expect(brandUrl(await loadBrand(db), "small-icon")).toBe("/brand-default/small-icon.png");
    await saveBrandAsset(db, owner(), "small-icon", { bytes: png(96, 96), fileName: "j.png" }, t);
    const cfg = await loadBrand(db);
    expect(brandUrl(cfg, "small-icon")).toBe(`/brand/small-icon.png?v=${t.getTime()}`);
    expect(brandSize(cfg, "small-icon")).toEqual([96, 96]);
    expect(pngSize(new Uint8Array(await readStored(cfg["small-icon"]!.path)))).toEqual([96, 96]);
    await saveBrandAsset(db, owner(), "small-icon", null);
    expect(brandUrl(await loadBrand(db), "small-icon")).toBe("/brand-default/small-icon.png");
  });

  it("대표만 바꾼다", async () => {
    await expect(saveBrandAsset(db, { id: ids.advisor, roles: ["advisor"] }, "app-icon", { bytes: png(512, 512), fileName: "a.png" })).rejects.toThrow(/대표만/);
  });
});
