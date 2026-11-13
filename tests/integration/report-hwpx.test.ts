// 보고서 한글(HWPX) 내보내기: zip 구조(mimetype 첫 칸·무압축), XML 짝 맞음, 그림 등록, 표 내용
import { inflateRawSync } from "node:zlib";
import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { REPORTS } from "@/modules/report/catalog";
import { runHwpx } from "@/modules/report/hwpx/build";
import { periodOf } from "@/modules/report/period";
import { runReport } from "@/modules/report/run";
import { seedShop, testDb } from "./db";

function unzip(buf: Buffer) {
  const out: { name: string; method: number; data: Buffer }[] = [];
  let o = 0;
  while (buf.readUInt32LE(o) === 0x04034b50) {
    const method = buf.readUInt16LE(o + 8);
    const csize = buf.readUInt32LE(o + 18);
    const nlen = buf.readUInt16LE(o + 26);
    const xlen = buf.readUInt16LE(o + 28);
    const name = buf.subarray(o + 30, o + 30 + nlen).toString("utf8");
    const body = buf.subarray(o + 30 + nlen + xlen, o + 30 + nlen + xlen + csize);
    out.push({ name, method, data: method === 0 ? Buffer.from(body) : inflateRawSync(body) });
    o += 30 + nlen + xlen + csize;
  }
  return out;
}

/** 여는·닫는 태그 짝이 맞는지(간이 검사) */
function balanced(xml: string) {
  const stack: string[] = [];
  const re = /<(\/?)([A-Za-z_][\w:.-]*)[^>]*?(\/?)>/g;
  const body = xml.replace(/<\?[\s\S]*?\?>/g, "").replace(/<!--[\s\S]*?-->/g, "");
  for (const m of body.matchAll(re)) {
    if (m[3]) continue;
    if (m[1]) {
      if (stack.pop() !== m[2]) return false;
    } else stack.push(m[2]);
  }
  return stack.length === 0 && !/&(?!amp;|lt;|gt;|quot;|apos;|#)/.test(body);
}

let db: Db;
let ids: Awaited<ReturnType<typeof seedShop>>;
beforeEach(async () => {
  db = await testDb();
  ids = await seedShop(db);
});

describe("한글(HWPX) 내보내기", () => {
  it("만든 보고서는 모두 HWPX 로 나오고 구조가 맞다", async () => {
    const owner = { id: ids.owner, roles: ["owner" as const] };
    const now = new Date("2026-11-11T03:00:00Z");
    const p = periodOf("month", "2026-11-11");
    for (const def of REPORTS.filter((x) => !x.phase)) {
      const r = await runReport(db, owner, def.id, p, "prev", now);
      const files = unzip(runHwpx(r, { family: "가족", printedOn: "2026-11-13", printedBy: "대표 <&>" }));
      expect(files[0].name, def.id).toBe("mimetype");
      expect(files[0].method).toBe(0);
      expect(files[0].data.toString()).toBe("application/hwp+zip");
      const names = files.map((f) => f.name);
      for (const n of ["version.xml", "Contents/header.xml", "Contents/section0.xml", "Contents/content.hpf", "META-INF/container.xml"]) expect(names, `${def.id} ${n}`).toContain(n);
      for (const f of files.filter((f) => /\.(xml|hpf|rdf)$/.test(f.name))) expect(balanced(f.data.toString("utf8")), `${def.id} ${f.name}`).toBe(true);
      const sec = files.find((f) => f.name === "Contents/section0.xml")!.data.toString("utf8");
      const hpf = files.find((f) => f.name === "Contents/content.hpf")!.data.toString("utf8");
      expect(sec).toContain(def.title);
      expect(sec).toContain("대표 &lt;&amp;&gt;");
      const pngs = files.filter((f) => f.name.startsWith("BinData/"));
      for (const png of pngs) {
        expect(png.data.subarray(1, 4).toString("ascii")).toBe("PNG");
        const id = png.name.replace(/^BinData\//, "").replace(/\.png$/, "");
        expect(hpf).toContain(`href="${png.name}"`);
        expect(sec).toContain(`binaryItemIDRef="${id}"`);
      }
      if (r.trend) expect(pngs.length, def.id).toBe(r.trend.series.length);
    }
  });
});
