// 홈페이지 3단계: 이용약관·처리방침 판 관리(시행 중인 판·예정 판·지난 판, 7일 앞서 알리기, 지금 내용과 비교)
import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { cancelLegal, issueLegal, legalState, legalVersions, sameDoc } from "@/modules/site/legal";
import { legalPage, liveLegalDoc } from "@/modules/site/legal-live";
import { publishPages, saveTexts } from "@/modules/site/pages";
import { PAGE_TEXT } from "@/modules/site/page-text";
import { seedShop, testDb } from "./db";

let db: Db;
let ids: Awaited<ReturnType<typeof seedShop>>;
beforeEach(async () => {
  db = await testDb();
  ids = await seedShop(db);
});
const owner = () => ({ id: ids.owner, roles: ["owner"] as const });
const advisor = () => ({ id: ids.advisor, roles: ["advisor"] as const });
const at = (d: string) => new Date(`${d}T03:00:00Z`);

describe("이용약관·처리방침 판", () => {
  it("판이 없으면 지금 내용, 첫 판은 오늘부터, 바꿀 때는 7일 앞서·같은 내용은 막고 예정 판은 하나만", async () => {
    const first = await legalPage(db, "terms", undefined, at("2026-11-22"));
    expect(first.viewing).toBeNull();
    expect(first.doc.sections[0].t).toBe(PAGE_TEXT["terms.items"].def[0].t);

    await expect(issueLegal(db, advisor(), "terms", "2026-11-22", first.doc, "2026-11-22")).rejects.toThrow(/대표만/);
    await expect(issueLegal(db, owner(), "terms", "2026-11-21", first.doc, "2026-11-22")).rejects.toThrow(/오늘 이후/);
    const v1 = await issueLegal(db, owner(), "terms", "2026-11-22", first.doc, "2026-11-22", at("2026-11-22"));

    // 문구를 고쳐 공개해도 새 판 전에는 손님 화면은 그대로
    const items = [...PAGE_TEXT["terms.items"].def, { t: "환불", d: "승인 전 작업은 청구하지 않습니다." }];
    await saveTexts(db, owner(), { pairs: { "terms.items": items } });
    await publishPages(db, owner());
    const live = await liveLegalDoc(db, "terms");
    expect(live.sections).toHaveLength(9);
    expect((await legalPage(db, "terms", undefined, at("2026-11-23"))).doc.sections).toHaveLength(8);

    await expect(issueLegal(db, owner(), "terms", "2026-11-25", live, "2026-11-23")).rejects.toThrow(/7일 앞서.*2026-11-30/);
    await expect(issueLegal(db, owner(), "terms", "2026-11-30", first.doc, "2026-11-23")).rejects.toThrow(/바뀐 것이 없습니다/);
    await issueLegal(db, owner(), "terms", "2026-12-05", live, "2026-11-23", at("2026-11-23"));
    const v2 = await issueLegal(db, owner(), "terms", "2026-12-01", live, "2026-11-23", new Date("2026-11-23T04:00:00Z"));
    expect(await legalVersions(db, "terms")).toHaveLength(2); // 예정 판은 바뀌고 하나만

    // 시행 전: 지금 판 + 예정 알림, 예정 판을 골라 볼 수 있다
    const before = await legalPage(db, "terms", undefined, at("2026-11-30"));
    expect(before).toMatchObject({ from: "2026-11-22", other: null });
    expect(before.state.next?.id).toBe(v2.id);
    expect((await legalPage(db, "terms", v2.id, at("2026-11-30"))).other).toBe("next");
    // 시행일부터 새 판, 지난 판은 남아 볼 수 있다
    const after = await legalPage(db, "terms", undefined, at("2026-12-01"));
    expect(after.doc.sections).toHaveLength(9);
    expect(after.state.past.map((x) => x.id)).toEqual([v1.id]);
    expect((await legalPage(db, "terms", v1.id, at("2026-12-01"))).other).toBe("past");
    expect(sameDoc(after.doc, live)).toBe(true);
  });

  it("처리방침은 보호책임자 등 지금 값을 찍어 두고, 예정 판만 거둘 수 있다", async () => {
    const doc = await liveLegalDoc(db, "privacy");
    expect(doc.sections.map((s) => s.t)).toContain("개인정보 보호책임자");
    const v1 = await issueLegal(db, owner(), "privacy", "2026-11-22", doc, "2026-11-22");
    await expect(cancelLegal(db, owner(), v1.id, "2026-11-22")).rejects.toThrow(/이미 시행한 판/);
    const changed = { ...doc, sign: `${doc.sign} (고침)` };
    const v2 = await issueLegal(db, owner(), "privacy", "2026-11-29", changed, "2026-11-22");
    await cancelLegal(db, owner(), v2.id, "2026-11-22");
    expect(legalState(await legalVersions(db, "privacy"), "2026-12-30").now?.id).toBe(v1.id);
    expect(await legalVersions(db, "terms")).toHaveLength(0);
  });
});
