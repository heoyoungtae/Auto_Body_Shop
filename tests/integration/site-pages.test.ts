// 설정 › 홈페이지에서 홈페이지 전체 고치기(대표 2026-11-22): 화면 글(처음 문구·자리표시·되돌리기), 첫 화면 단락 차례·보이기, 메뉴·바닥글
import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { loadPolicy } from "@/modules/platform/policy";
import { discardDraft, draftState, loadEditing, loadSitePages, orderFromNumbers, pagesHistory, pagesView, publishPages, resetTexts, restoreVersion, saveHomeLayout, saveMenu, saveTexts, sitePages } from "@/modules/site/pages";
import { ALL_TEXT, DEFAULT_FOOT, DEFAULT_NAV, fillTokens, groupKeys, HOME_SECTIONS, normalizeOrder, PAGE_TEXT, SECTION_KEYS, TEXT_GROUPS, unknownTokens } from "@/modules/site/page-text";
import { servicePagesView } from "@/modules/site/service-text";
import { seedShop, testDb } from "./db";

let db: Db;
let ids: Awaited<ReturnType<typeof seedShop>>;
beforeEach(async () => {
  db = await testDb();
  ids = await seedShop(db);
});
const owner = () => ({ id: ids.owner, roles: ["owner"] as const });
const advisor = () => ({ id: ids.advisor, roles: ["advisor"] as const });

describe("화면 글", () => {
  it("처음 문구에는 모르는 자리표시가 없고, 단락마다 고칠 글이 있다", () => {
    for (const [k, d] of Object.entries(ALL_TEXT)) {
      const all = d.kind === "text" ? d.def : d.kind === "lines" ? d.def.join(" ") : d.kind === "rows" ? d.def.map((x) => Object.values(x).join(" ")).join(" ") : d.def.map((x) => `${x.t} ${x.d}`).join(" ");
      expect(unknownTokens(all), k).toEqual([]);
    }
    for (const s of HOME_SECTIONS) expect(groupKeys(`home.${s.key}`).length, s.key).toBeGreaterThan(0);
    // 설정 '화면 글'에 모든 칸이 한 번씩 나온다(첫 화면 칸은 '첫 화면' 탭)
    const shown = TEXT_GROUPS.flatMap((g) => (g.parts ? g.parts.flatMap((x) => x.keys) : groupKeys(g.id)));
    expect(new Set(shown).size).toBe(shown.length);
    expect(Object.keys(ALL_TEXT).filter((k) => !k.startsWith("home.") && !shown.includes(k))).toEqual([]);
  });

  it("고친 칸만 남고, 자리표시는 정책값으로, 비우거나 되돌리면 처음 문구", async () => {
    const p = await loadPolicy(db);
    expect((await sitePages(db)).t("home.cta.lead")).toContain(`영업일 ${p["consult.reply_business_days"]}일`);
    expect((await sitePages(db)).lines("guide.after.items")[0]).toContain(`${p["delivery.no_wash_days"]}일 동안`);

    const n = await saveTexts(db, owner(), {
      text: { "home.why.title": "꼼꼼하게\n고칩니다", "home.services.title": PAGE_TEXT["home.services.title"].def },
      pairs: { "home.why.items": [{ t: "보증 {도장보증}개월", d: "도장 보증" }, { t: "", d: "" }, { t: "기록", d: "" }] },
      lines: { "insurance.wedo.items": ["보험사 협의", "", "대차 요청"] },
    });
    expect(n).toBe(3); // 처음 문구와 같은 칸은 '고친 것'이 아니다
    expect(Object.keys((await loadSitePages(db)).text ?? {})).toEqual([]); // 공개 전 고침이라 손님 화면은 그대로
    const raw = await loadEditing(db);
    expect(Object.keys(raw.text ?? {})).toEqual(["home.why.title"]);
    const v = pagesView(raw, p);
    expect(v.t("home.why.title")).toBe("꼼꼼하게\n고칩니다");
    expect(v.pairs("home.why.items")).toEqual([{ t: `보증 ${p["warranty.paint_months"]}개월`, d: "도장 보증" }, { t: "기록", d: "" }]);
    expect(v.lines("insurance.wedo.items")).toEqual(["보험사 협의", "대차 요청"]);

    await saveTexts(db, owner(), { text: { "home.why.title": "  " } });
    expect((await sitePages(db, true)).t("home.why.title")).toBe(PAGE_TEXT["home.why.title"].def);
    expect(await resetTexts(db, owner(), ["home.why.items", "insurance.wedo.items"])).toBe(2);
    expect(await loadEditing(db)).toMatchObject({ pairs: {}, lines: {} });
  });

  it("모르는 자리표시·제목 없는 줄·너무 긴 글·최소 개수는 막고, 대표만 고친다", async () => {
    await expect(saveTexts(db, owner(), { text: { "home.cta.lead": "{보증기간}개월" } })).rejects.toThrow(/모르는 자리표시 \{보증기간\}/);
    await expect(saveTexts(db, owner(), { pairs: { "home.why.items": [{ t: "", d: "설명만" }] } })).rejects.toThrow(/1번째 줄에 제목/);
    await expect(saveTexts(db, owner(), { text: { "home.services.title": "가".repeat(41) } })).rejects.toThrow(/40자까지/);
    await expect(saveTexts(db, owner(), { pairs: { "home.process.items": [{ t: "상담", d: "" }, { t: "출고", d: "" }] } })).rejects.toThrow(/3개 이상/);
    await expect(saveTexts(db, owner(), { text: { "nope.key": "x" } })).rejects.toThrow(/없는 칸/);
    await expect(saveTexts(db, advisor(), { text: { "home.services.title": "수리" } })).rejects.toThrow(/대표만/);
    expect(fillTokens("{모름} {도장보증}", await loadPolicy(db))).toMatch(/^\{모름\} \d+$/);
  });
});

describe("첫 화면 단락", () => {
  it("숫자로 차례를 바꾸고 숨긴다. 뒤에 늘린 단락은 처음 자리에 끼운다", async () => {
    const cur = normalizeOrder(undefined);
    expect(cur).toEqual(SECTION_KEYS);
    const order = orderFromNumbers(cur, { carbook: 0, faq: 2.5 });
    expect(order.slice(0, 4)).toEqual(["carbook", "services", "why", "faq"]);
    await saveHomeLayout(db, owner(), { order, off: ["reviews", "tech"], shade: 20, stats: false });
    const v = await sitePages(db, true);
    expect(v.home.order[0]).toBe("carbook");
    expect(v.home.shade).toBe(40); // 40 아래는 글자가 안 읽혀 막는다
    expect(v.home.stats).toBe(false);
    expect(v.shows("tech")).toBe(false);
    expect(v.home.order.filter(v.shows)).not.toContain("reviews");
    // 모르는 단락·겹친 단락은 빼고, 빠진 단락은 처음 차례에서 바로 앞 단락 뒤에 끼운다
    expect(normalizeOrder(["faq", "없는단락", "services", "faq"])).toEqual(["faq", "notice", "cta", "services", "why", "quality", "photos", "process", "carbook", "cases", "reviews", "insurance", "tech"]);
    await expect(saveHomeLayout(db, owner(), { order, off: [...SECTION_KEYS], shade: 100, stats: true })).rejects.toThrow(/하나 이상/);
  });
});

describe("메뉴·바닥글", () => {
  it("이름·차례·숨기기·NEW, 비운 이름은 화면 이름, 위 메뉴는 8개까지", async () => {
    expect((await sitePages(db)).nav).toEqual(DEFAULT_NAV);
    const nav = DEFAULT_NAV.map((x) => (x.href === "/faq" ? { ...x, label: "궁금해요", isNew: true } : x.href === "/notice" ? { ...x, on: false, isNew: true } : x.href === "/about" ? { ...x, label: " " } : x));
    await saveMenu(db, owner(), { nav: [nav[5], ...nav.filter((_, i) => i !== 5)], foot: DEFAULT_FOOT.map((x) => ({ ...x, on: x.href === "/terms" })) });
    const v = await sitePages(db, true);
    expect(v.nav[0]).toEqual({ href: "/faq", label: "궁금해요", on: true, isNew: true });
    expect(v.nav.find((x) => x.href === "/notice")).toMatchObject({ on: false, isNew: false }); // 숨긴 메뉴엔 NEW 없음
    expect(v.nav.find((x) => x.href === "/about")!.label).toBe("정비소 소개");
    expect(v.foot.filter((x) => x.on).map((x) => x.href)).toEqual(["/terms"]);
    await expect(saveMenu(db, owner(), { nav: DEFAULT_NAV.map((x) => ({ ...x, on: true })), foot: DEFAULT_FOOT })).rejects.toThrow(/8개까지/);
    await expect(saveMenu(db, owner(), { nav: DEFAULT_NAV.map((x) => ({ ...x, on: false })), foot: DEFAULT_FOOT })).rejects.toThrow(/하나 이상/);
  });
});

describe("수리 안내·공개하기·이력", () => {
  it("수리 방법(칸 여럿 목록)을 고치고, 보증 한 줄 자리표시가 정책값으로", async () => {
    const p = await loadPolicy(db);
    const base = servicePagesView(await sitePages(db));
    expect(base.find((s) => s.slug === "paint")!.warranty).toBe(`도장 ${p["warranty.paint_months"]}개월 보증 · 도막 ${p["inspect.film_min_um"]}~${p["inspect.film_max_um"]}μm 검사`);
    await saveTexts(db, owner(), { rows: { "services.rust.methods": [{ name: "녹 제거 도색", when: "녹이 보일 때", how: "갈아내고 칠합니다", time: "보통 {도장보증}일" }, { name: "", when: "", how: "", time: "" }] } });
    const rust = servicePagesView(await sitePages(db, true)).find((s) => s.slug === "rust")!;
    expect(rust.methods).toEqual([{ name: "녹 제거 도색", when: "녹이 보일 때", how: "갈아내고 칠합니다", time: `보통 ${p["warranty.paint_months"]}일` }]);
    await expect(saveTexts(db, owner(), { rows: { "services.rust.methods": [{ name: "", when: "설명만", how: "", time: "" }] } })).rejects.toThrow(/1번째 줄에 방법/);
  });

  it("공개하기 → 손님 화면에 보이고 지난 판이 남는다. 버리기·지난 판 가져오기", async () => {
    expect(await draftState(db)).toBeNull();
    await saveTexts(db, owner(), { text: { "home.services.title": "이런 일을 합니다" } });
    await saveMenu(db, owner(), { nav: DEFAULT_NAV.map((x) => (x.href === "/faq" ? { ...x, label: "질문" } : x)), foot: DEFAULT_FOOT });
    expect(await draftState(db)).toEqual(["home.services.title", "nav"]);
    expect((await sitePages(db)).t("home.services.title")).toBe("이런 수리를 합니다");
    await expect(publishPages(db, advisor())).rejects.toThrow(/대표만/);
    expect(await publishPages(db, owner())).toBe(2);
    expect((await sitePages(db)).t("home.services.title")).toBe("이런 일을 합니다");
    expect(await draftState(db)).toBeNull();
    const [v1] = await pagesHistory(db);
    expect(v1.changed).toEqual(["home.services.title", "nav"]);
    expect(v1.data).toEqual({});

    await saveTexts(db, owner(), { text: { "home.services.title": "또 고침" } });
    expect(await discardDraft(db, owner())).toBe(1);
    expect((await loadEditing(db)).text?.["home.services.title"]).toBe("이런 일을 합니다");

    await restoreVersion(db, owner(), v1.id); // 처음 판(고친 것 없음)으로
    await publishPages(db, owner());
    expect((await sitePages(db)).t("home.services.title")).toBe("이런 수리를 합니다");
    expect(await pagesHistory(db)).toHaveLength(2);
    await expect(publishPages(db, owner())).rejects.toThrow(/공개할 고침이 없습니다/);
  });
});
