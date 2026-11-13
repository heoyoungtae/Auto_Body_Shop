// 목록 공통 조회줄(보고서 센터 2단계): 기간·기준 날짜·찾기·합계·쪽 나눔·엑셀, 모든 목록 정의가 실제로 돈다
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { applyLQ, listCsv, type ListDef, PAGE_SIZE, parseLQ, runList } from "@/modules/listq/core";
import { LIST_DEFS, LISTS } from "@/modules/listq/registry";
import { FIELD_HELP } from "@/modules/help/fields";
import { PANEL_HELP } from "@/modules/help/panels";
import * as money from "@/modules/listq/defs/money";
import * as purchase from "@/modules/listq/defs/purchase";
import * as quality from "@/modules/listq/defs/quality";
import * as repair from "@/modules/listq/defs/repair";
import * as work from "@/modules/listq/defs/work";
import { seedShop, testDb } from "./db";

type Row = { no: string; on: string | null; won: number; name: string };
const def: ListDef<Row> = {
  key: "t",
  title: "시험",
  href: "/t",
  allowed: () => true,
  load: async () => [],
  tabs: { param: "f", options: [{ v: "open", label: "진행 중" }, { v: "all", label: "전체" }] },
  dates: [{ key: "on", label: "날짜", get: (r) => r.on }],
  text: (r) => [r.no, r.name],
  cols: [
    { label: "번호", get: (r) => r.no },
    { label: "금액", get: (r) => r.won, sum: true, unit: "원" },
  ],
};
const rows: Row[] = Array.from({ length: 120 }, (_, i) => ({ no: `T-${i}`, on: i < 100 ? `2026-11-${String((i % 28) + 1).padStart(2, "0")}` : i < 110 ? "2026-10-15" : null, won: 1000, name: i % 2 ? "현대 아반떼" : "기아 K5" }));

describe("조회 조건", () => {
  it("기간 고르기: 이번 달·지난 달·올해·직접 지정(거꾸로 넣으면 바꿈)", () => {
    expect(parseLQ({}, def, "2026-11-13")).toMatchObject({ preset: "all", from: null, to: null, page: 1 });
    expect(parseLQ({ p: "month" }, def, "2026-11-13")).toMatchObject({ from: "2026-11-01", to: "2026-11-30" });
    expect(parseLQ({ p: "lastmonth" }, def, "2026-11-13")).toMatchObject({ from: "2026-10-01", to: "2026-10-31" });
    expect(parseLQ({ p: "lastmonth" }, def, "2026-01-05")).toMatchObject({ from: "2025-12-01", to: "2025-12-31" });
    expect(parseLQ({ p: "year" }, def, "2026-11-13")).toMatchObject({ from: "2026-01-01", to: "2026-12-31" });
    expect(parseLQ({ p: "custom", from: "2026-11-30", to: "2026-11-01" }, def, "2026-11-13")).toMatchObject({ from: "2026-11-01", to: "2026-11-30" });
    expect(parseLQ({ p: "custom", from: "2026-11-05" }, def, "2026-11-13")).toMatchObject({ from: "2026-11-05", to: null });
    expect(parseLQ({ p: "nope", pg: "-3", dk: "zz" }, def, "2026-11-13")).toMatchObject({ preset: "all", page: 1, dateKey: "on" });
  });

  it("거르기·합계는 조건에 맞는 모든 줄, 화면은 50줄씩", () => {
    const all = applyLQ(def, rows, parseLQ({}, def, "2026-11-13"));
    expect(all.count).toBe(120);
    expect(all.rows).toHaveLength(PAGE_SIZE);
    expect(all.pages).toBe(3);
    expect(all.totals).toEqual([{ label: "금액", unit: "원", value: 120000 }]);
    const nov = applyLQ(def, rows, parseLQ({ p: "month" }, def, "2026-11-13"));
    expect(nov.count).toBe(100); // 날짜 없는 줄은 기간을 고르면 빠짐
    const p3 = applyLQ(def, rows, parseLQ({ pg: "3" }, def, "2026-11-13"));
    expect(p3.rows).toHaveLength(20);
    const over = applyLQ(def, rows, parseLQ({ pg: "99" }, def, "2026-11-13"));
    expect(over.lq.page).toBe(3);
    const s = applyLQ(def, rows, parseLQ({ s: "아 반떼" }, def, "2026-11-13"));
    expect(s.count).toBe(60); // 띄어쓰기·대소문자 무시
  });

  it("주소 조각은 기본값을 빼고 조건을 남긴다(쪽 번호 빼고)", () => {
    const r = applyLQ(def, rows, parseLQ({ p: "month", s: "K5", pg: "2", f: "all" }, def, "2026-11-13"), { p: "month", s: "K5", pg: "2", f: "all" });
    expect(r.qs()).toBe("?f=all&p=month&s=K5");
    expect(r.qs({ f: null, pg: 2 })).toBe("?p=month&s=K5&pg=2");
    const d = applyLQ(def, rows, parseLQ({ f: "open" }, def), { f: "open" });
    expect(d.qs()).toBe("");
  });

  it("엑셀: 조건 줄·머리줄·모든 줄·합계", () => {
    const r = applyLQ(def, rows, parseLQ({ p: "month", f: "all" }, def, "2026-11-13"), { f: "all" });
    const csv = listCsv(r, { f: "all" });
    expect(csv.startsWith("﻿시험,날짜 2026-11-01 ~ 2026-11-30,보기: 전체,100건")).toBe(true);
    expect(csv).toContain("번호,금액(원)");
    expect(csv.trim().split("\r\n")).toHaveLength(3 + 100 + 1);
    expect(csv).toContain("합계,100000");
  });
});

let db: Db;
let ids: Awaited<ReturnType<typeof seedShop>>;
beforeEach(async () => {
  db = await testDb();
  ids = await seedShop(db);
});

describe("목록 정의", () => {
  it("모든 목록이 대표 권한으로 돌고, 엑셀 칸 계산이 깨지지 않는다", async () => {
    const owner = { id: ids.owner, name: "대표", roles: ["owner" as const] };
    expect(new Set(LIST_DEFS.map((d) => d.key)).size).toBe(LIST_DEFS.length);
    for (const d of LIST_DEFS) {
      for (const tab of d.tabs?.options ?? [{ v: undefined }]) {
        const q = tab.v ? { [d.tabs!.param]: tab.v, p: "year" } : { p: "year" };
        const r = await runList(db, d, owner, q, "2026-11-13");
        expect(r.count, d.key).toBeGreaterThanOrEqual(0);
        expect(listCsv(r, q).startsWith(`﻿${d.title}`), d.key).toBe(true);
      }
    }
  });

  it("조회줄이 있는 화면은 모두 엑셀 주소(목록 등록)가 있고, 도움말이 있다", () => {
    expect(PANEL_HELP["list.bar"]).toBeTruthy();
    for (const k of ["list.date", "list.from", "list.to"] as const) expect(FIELD_HELP[k]).toBeTruthy();
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const f of readdirSync(dir)) {
        const p = join(dir, f);
        if (statSync(p).isDirectory()) walk(p);
        else if (f === "page.tsx") files.push(p);
      }
    };
    walk(join(process.cwd(), "src/app"));
    const mods = { money, purchase, quality, repair, work } as Record<string, Record<string, unknown>>;
    const used = new Set<unknown>();
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      for (const m of src.matchAll(/import \{ ([^}]*) \} from "@\/modules\/listq\/defs\/(\w+)"/g)) {
        for (const name of m[1].split(",").map((x) => x.trim()).filter((x) => x.endsWith("List"))) {
          const d = mods[m[2]][name] as { key: string };
          expect(LISTS[d.key], `${f}: ${name} 이 registry.ts 에 없음(엑셀 주소 404)`).toBe(d);
          used.add(d);
        }
      }
    }
    expect(used.size).toBe(LIST_DEFS.length);
  });
});
