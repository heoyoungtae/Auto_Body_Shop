// 공휴일 자동 갱신(특일 정보 API) — 가짜 응답으로 확인
import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { notification, shopDay } from "@/db/schema";
import { myTodos } from "@/modules/dashboard/todo";
import { closedReason } from "@/modules/platform/business-days";
import { loadShopCalendar } from "@/modules/platform/calendar";
import { apiReason, holidayTodo, normalizeKey, parseHolidayJson, saveHolidayKey, syncHolidays } from "@/modules/platform/holidays";
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
    await db.insert(shopDay).values({ date: "2028-05-02", kind: "closed", name: "정비소 창립일", createdBy: ids.owner });
    const f = fake({
      "2027": { item: [{ locdate: 20270101, dateName: "1월1일", isHoliday: "Y" }, { locdate: 20270603, dateName: "임시공휴일", isHoliday: "Y" }] },
      "2028": { item: [{ locdate: 20280101, dateName: "1월1일", isHoliday: "Y" }, { locdate: 20280502, dateName: "어린이날 대체", isHoliday: "Y" }, { locdate: 20280405, dateName: "식목일", isHoliday: "N" }] },
    });
    const r = await syncHolidays(db, sep, { f });
    expect(r.status).toBe("done");
    const cal = await loadShopCalendar(db);
    // 받은 해(2027)는 받은 목록만: 예비 목록의 설날(2027-02-07)은 더 이상 공휴일이 아님
    expect(closedReason(cal, "2027-06-03")).toMatch(/임시공휴일/);
    expect(closedReason(cal, "2027-02-08")).toBeNull(); // 월요일, 받은 목록에 없음
    expect(closedReason(cal, "2028-01-01")).toMatch(/1월1일/);
    expect(closedReason(cal, "2028-04-05")).toBeNull(); // 수요일, isHoliday N
    // 직접 넣은 날은 그대로
    expect((await db.select().from(shopDay)).find((d) => d.date === "2028-05-02")?.kind).toBe("closed");
    expect(r.message).toMatch(/\+06-03 임시공휴일/);
    // 못 받은 해(2026)는 예비 목록 그대로
    expect(closedReason(cal, "2026-12-25")).toMatch(/성탄절/);
    expect(await holidayTodo(db, "2027-09-02")).toBeNull();
    // 1일이 아니고 내년 것이 있으면 건너뜀
    expect((await syncHolidays(db, new Date("2027-09-03T00:00:00Z"), { f })).status).toBe("skipped");
  });

  it("https 403이면 http로 다시, 실패 이유를 보여 줌, Encoding 키는 풀어서", async () => {
    expect(normalizeKey("ab%2Bcd%3D%3D")).toBe("ab+cd==");
    expect(apiReason("<OpenAPI_ServiceResponse><cmmMsgHeader><returnAuthMsg>SERVICE_KEY_IS_NOT_REGISTERED_ERROR</returnAuthMsg></cmmMsgHeader></OpenAPI_ServiceResponse>")).toMatch(/등록되지 않음/);
    await saveHolidayKey(db, ids.owner, "abcdefghijklmnopqrstuvwxyz%2B0123456789");
    const seen: string[] = [];
    const f = (async (url: string | URL | Request) => {
      const u = String(url);
      seen.push(u);
      if (u.startsWith("https")) return new Response("Forbidden", { status: 403 });
      return new Response(res(""), { status: 200 });
    }) as typeof fetch;
    const r = await syncHolidays(db, new Date("2027-09-02T00:00:00Z"), { force: true, f });
    expect(r.status).toBe("done");
    expect(seen.some((u) => u.startsWith("http://"))).toBe(true);
    expect(seen[0]).toContain("serviceKey=abcdefghijklmnopqrstuvwxyz%2B0123456789");
    const bad = (async () => new Response("<html>Forbidden</html>", { status: 403 })) as unknown as typeof fetch;
    const r2 = await syncHolidays(db, new Date("2027-09-02T00:00:00Z"), { force: true, f: bad });
    expect(r2.message).toMatch(/https 403 .*http 403/);
  });
});
