// 홈페이지 3단계: 기술자료(초안 불러오기·공개·찾기·주소 이름·번호 막기), 첫 화면 배경 사진, 새 화면 주소
import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { ARTICLE_STARTERS } from "@/modules/site/article-starters";
import { featuredArticles, listArticles, loadArticleStarters, parseBody, publicArticles, readArticle, saveArticle } from "@/modules/site/articles";
import { routeFor } from "@/modules/site/rules";
import { SERVICE_PAGES } from "@/modules/site/service-pages";
import { addShopPhoto, DEFAULT_HERO, heroImage, removeShopPhoto, setHeroPhoto, siteTrust } from "@/modules/site/trust";
import { seedShop, testDb } from "./db";
import { WEBP } from "./flow";

let db: Db;
let ids: Awaited<ReturnType<typeof seedShop>>;
beforeEach(async () => {
  db = await testDb();
  ids = await seedShop(db);
});
const advisor = () => ({ id: ids.advisor, roles: ["advisor"] as const });
const tech = () => ({ id: ids.tech1, roles: ["technician"] as const });

describe("기술자료", () => {
  it("처음 글은 홈페이지를 처음 열 때 정책값을 넣어 저절로 공개, 지우면 단추로 되살린다", async () => {
    expect(await publicArticles(db)).toHaveLength(ARTICLE_STARTERS.length);
    const rows = await listArticles(db);
    expect(rows.every((r) => r.published)).toBe(true);
    expect(rows.find((r) => r.slug === "paint-process")!.body).toMatch(/\d+~\d+μm/);
    expect(await loadArticleStarters(db, advisor())).toBe(0);
    const rust = rows.find((r) => r.slug === "rust-stages")!;
    await saveArticle(db, advisor(), { ...rust, published: false });
    expect(await publicArticles(db)).toHaveLength(ARTICLE_STARTERS.length - 1); // 내린 글은 다시 올리지 않는다
    await expect(loadArticleStarters(db, tech())).rejects.toThrow(/상담을 쓸 수 있는/);
  });

  it("공개한 글만 보이고, 낱말로 찾고, 분야마다 하나씩 홈에 띄운다", async () => {
    expect((await publicArticles(db)).length).toBe(ARTICLE_STARTERS.length);
    expect((await publicArticles(db, "염화 칼슘")).map((a) => a.slug)).toEqual(["winter-salt"]);
    expect((await publicArticles(db, "", "부식 예방")).every((a) => a.category === "부식 예방")).toBe(true);
    const home = await featuredArticles(db, 3);
    expect(home.map((a) => a.category)).toEqual(["차량 관리", "부식 예방", "수리 방법"]);
    const a = await readArticle(db, "rust-stages");
    expect(a!.related).toHaveLength(3);
    expect(a!.related[0].category).toBe("부식 예방");
    expect((await listArticles(db)).find((r) => r.slug === "rust-stages")!.views).toBe(1);
  });

  it("주소 이름은 영문만·겹치면 안 됨, 공개 글에 번호가 있으면 막는다", async () => {
    const base = { category: "차량 관리", title: "타이어 공기압", summary: "한 달에 한 번 확인하세요. 계절마다 달라집니다.", body: "## 왜\n\n공기압이 낮으면 연비가 나빠지고 타이어가 빨리 닳습니다. 주유할 때 함께 보세요.\n- 한 달에 한 번\n- 장거리 전", sort: 10, published: true };
    await expect(saveArticle(db, advisor(), { ...base, slug: "타이어" })).rejects.toThrow(/영문 소문자/);
    const id = await saveArticle(db, advisor(), { ...base, slug: "tire-pressure" });
    await expect(saveArticle(db, advisor(), { ...base, slug: "tire-pressure" })).rejects.toThrow(/같은 주소 이름/);
    await expect(saveArticle(db, advisor(), { ...base, id, slug: "tire-pressure", body: `${base.body}\n문의 010-1234-5678` })).rejects.toThrow(/휴대폰 번호/);
    expect(parseBody(base.body)).toEqual([
      { kind: "h", text: "왜" },
      { kind: "p", text: "공기압이 낮으면 연비가 나빠지고 타이어가 빨리 닳습니다. 주유할 때 함께 보세요." },
      { kind: "ul", items: ["한 달에 한 번", "장거리 전"] },
    ]);
  });
});

describe("첫 화면 배경·새 화면 주소", () => {
  it("고른 정비소 사진이 배경, 사진을 빼면 기본 그림으로", async () => {
    expect(heroImage(await siteTrust(db))).toBe(DEFAULT_HERO);
    await addShopPhoto(db, advisor(), WEBP, { caption: "외관", kind: "outside" });
    const p = (await siteTrust(db)).photos[0];
    await setHeroPhoto(db, advisor(), p.id);
    expect(heroImage(await siteTrust(db))).toBe(`/api/site-file/${p.path}`);
    await expect(setHeroPhoto(db, advisor(), "nope")).rejects.toThrow(/없는 사진/);
    await removeShopPhoto(db, advisor(), p.id);
    expect((await siteTrust(db)).hero).toBe("");
    expect(heroImage(await siteTrust(db))).toBe(DEFAULT_HERO);
  });

  it("수리 안내·기술자료·수첩 설명서는 홈페이지 화면으로", () => {
    expect(routeFor("/services", true)).toEqual({ kind: "rewrite", to: "/site/services" });
    for (const s of SERVICE_PAGES) expect(routeFor(`/services/${s.slug}`, true)).toEqual({ kind: "rewrite", to: `/site/services/${s.slug}` });
    expect(routeFor("/tech/rust-stages", true)).toEqual({ kind: "rewrite", to: "/site/tech/rust-stages" });
    expect(routeFor("/tech/../admin", true).kind).not.toBe("rewrite");
    expect(routeFor("/carbook-guide", false)).toEqual({ kind: "rewrite", to: "/site/carbook-guide" });
    expect(routeFor("/site-art/hero.svg", true)).toEqual({ kind: "pass" });
  });
});
