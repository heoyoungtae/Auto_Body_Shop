// 공휴일 자동 갱신(특일 정보 API) — 가짜 응답으로 확인
import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { notification, shopDay } from "@/db/schema";
import { myTodos } from "@/modules/dashboard/todo";
import { closedReason } from "@/modules/platform/business-days";
import { loadShopCalendar } from "@/modules/platform/calendar";
import { holidayTodo, parseHolidayJson, saveHolidayKey, syncHolidays } from "@/modules/platform/holidays";
import { seedShop, testDb } from "./db";

let db: Db;
let ids: Awaited<ReturnType<typeof seedShop>>;
beforeEach(async () => {
  db = await testDb();
  ids = await seedShop(db);
});

const res = (items: unknown) => JSON.stringify({ response: { header: { resultCode: "00", resultMsg: "NORMAL SERVICE." }, body: { items, numOfRows: 100, pageNo: 1, totalCount: 1 } } });
const fake = (byYear: Record<string, unknown>): typeof fetch =>
  (async (url: string | URL | Request) => {
    const y = new URL(String(url)).searchParams.get("solYear")!;
    return new Response(res(byYear[y] ?? ""), { status: 200 });
  }) as typeof fetch;

describe("공휴일 자동 갱신", () => {
  it("응답 읽기", () => {
    expect(parseHolidayJson(JSON.parse(res({ item: { locdate: 20280101, dateName: "1월1일", isHoliday: "Y" } })))).toEqual([{ date: "2028-01-01", name: "1월1일" }]);
    expect(parseHolidayJson(JSON.parse(res("")))).toEqual([]);
    expect(parseHolidayJson({ response: { header: { resultCode: "30" } } })).toBeNull();
  });

  it("키가 없으면 대표 할 일, 가져오면 빠진 날만 넣고 직접 넣은 날은 그대로", async () => {
    const sep = new Date("2027-09-02T00:00:00Z");
    expect(await holidayTodo(db, "2027-09-02")).toMatchObject({ next: 2028, hasKey: false });
    const owner = { id: ids.owner, roles: ["owner" as const] };
    expect((await myTodos(db, owner, sep)).some((t) => t.key === "set-hol")).toBe(true);
    expect((await syncHolidays(db, sep)).status).toBe("nokey");
    expect((await db.select().from(notification).where(eq(notification.userId, ids.owner))).some((n) => n.title.includes("2028년 공휴일"))).toBe(true);

    await saveHolidayKey(db, ids.owner, "abcdefghijklmnopqrstuvwxyz0123456789");
    await db.insert(shopDay).values({ date: "2028-05-02", kind: "closed", name: "정비소 창립일" });
    const f = fake({
      "2027": { item: [{ locdate: 20270101, dateName: "1월1일", isHoliday: "Y" }, { locdate: 20270603, dateName: "임시공휴일", isHoliday: "Y" }] },
      "2028": { item: [{ locdate: 20280101, dateName: "1월1일", isHoliday: "Y" }, { locdate: 20280502, dateName: "어린이날 대체", isHoliday: "Y" }, { locdate: 20280405, dateName: "식목일", isHoliday: "N" }] },
    });
    const r = await syncHolidays(db, sep, { f });
    expect(r.status).toBe("done");
    expect(r.added).toBe(2);
    const rows = await db.select().from(shopDay);
    expect(rows.find((d) => d.date === "2027-06-03")?.kind).toBe("holiday");
    expect(rows.find((d) => d.date === "2028-01-01")?.name).toBe("1월1일");
    expect(rows.find((d) => d.date === "2028-05-02")?.kind).toBe("closed");
    expect(rows.some((d) => d.date === "2027-01-01" || d.date === "2028-04-05")).toBe(false);
    const cal = await loadShopCalendar(db);
    expect(closedReason(cal, "2028-01-01")).toMatch(/1월1일/);
    expect(await holidayTodo(db, "2027-09-02")).toBeNull();
    // 1일이 아니고 내년 것이 있으면 건너뜀
    expect((await syncHolidays(db, new Date("2027-09-03T00:00:00Z"), { f })).status).toBe("skipped");
  });
});
