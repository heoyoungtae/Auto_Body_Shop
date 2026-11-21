// 홈페이지 믿음 자료: 바깥 후기 주소·별점, 후기(이름 가림·번호 막기), 자격·인증, 정비소 사진(공개 주소), 검색 확인 값
import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { addCert, addReview, addShopPhoto, publicShopFile, removeShopPhoto, saveTrustLinks, siteTrust } from "@/modules/site/trust";
import { saveSiteConfig, siteConfig } from "@/modules/site/service";
import { routeFor } from "@/modules/site/rules";
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

describe("후기·사진·인증", () => {
  it("바깥 후기 주소는 그 지도 주소만, 별점은 1~5", async () => {
    await expect(saveTrustLinks(db, advisor(), { naver: "https://evil.example/x", kakao: "", google: "", score: "", count: "", source: "" })).rejects.toThrow(/네이버 주소가 아닙니다/);
    await expect(saveTrustLinks(db, advisor(), { naver: "", kakao: "", google: "", score: "7", count: "", source: "" })).rejects.toThrow(/1~5/);
    await saveTrustLinks(db, advisor(), { naver: "https://naver.me/abc", kakao: "https://place.map.kakao.com/123", google: "https://maps.app.goo.gl/xyz", score: "4.86", count: "1,280", source: "네이버" });
    const t = await siteTrust(db);
    expect(t.links.kakao).toBe("https://place.map.kakao.com/123");
    expect(t.rating).toEqual({ score: 4.9, count: 1280, source: "네이버" });
    await expect(saveTrustLinks(db, tech(), { naver: "", kakao: "", google: "", score: "", count: "", source: "" })).rejects.toThrow(/상담을 쓸 수 있는/);
  });

  it("후기: 이름은 첫 글자만, 전화·차량번호는 막는다, 새 후기가 위", async () => {
    await addReview(db, advisor(), { name: "김민수", rating: 5, text: "색 맞춤이 완벽했어요", source: "네이버", date: "2026-11-20" });
    await addReview(db, advisor(), { name: "", rating: 4, text: "설명을 자세히 해 주셨습니다", source: "아무데나", date: "x" });
    await expect(addReview(db, advisor(), { name: "이", rating: 5, text: "12가3456 차 잘 고쳤어요", source: "네이버", date: "" })).rejects.toThrow(/차량번호/);
    await expect(addReview(db, advisor(), { name: "이", rating: 0, text: "좋아요 좋아요", source: "네이버", date: "" })).rejects.toThrow(/별점/);
    const t = await siteTrust(db);
    expect(t.reviews.map((r) => [r.name, r.source, r.date])).toEqual([
      ["고객", "직접 받은 후기", ""],
      ["김**", "네이버", "2026-11-20"],
    ]);
  });

  it("자격·인증은 한 줄 설명이 있어야, 정비소 사진은 걸려 있는 것만 누구나 연다", async () => {
    await expect(addCert(db, advisor(), { name: "정비업 등록", desc: "" })).rejects.toThrow(/한 줄 설명/);
    await addCert(db, advisor(), { name: "자동차 종합정비업 등록", desc: "관할 구청에 등록한 정식 정비업체입니다." });
    expect((await siteTrust(db)).certs).toHaveLength(1);
    await expect(addShopPhoto(db, advisor(), WEBP, { caption: "", kind: "nope" })).rejects.toThrow(/종류/);
    await expect(addShopPhoto(db, advisor(), new Uint8Array([1, 2, 3]), { caption: "", kind: "shop" })).rejects.toThrow(/사진 파일만/);
    const path = await addShopPhoto(db, advisor(), WEBP, { caption: "도장 부스", kind: "shop", width: 1600, height: 1200 });
    expect(await publicShopFile(db, path)).toBe(true);
    expect(await publicShopFile(db, "site/shop/../../ro/x.webp")).toBe(false);
    const [p] = (await siteTrust(db)).photos;
    expect(p).toMatchObject({ caption: "도장 부스", kind: "shop", width: 1600 });
    await removeShopPhoto(db, advisor(), p.id);
    expect(await publicShopFile(db, path)).toBe(false);
  });
});

describe("검색 등록·새 화면 주소", () => {
  it("확인 값은 태그를 통째로 붙여도 값만, 이상한 값은 막는다", async () => {
    const owner = { id: ids.owner, roles: ["owner"] as const };
    const base = { ...(await siteConfig(db)) };
    await saveSiteConfig(db, owner, { ...base, verifyNaver: '<meta name="naver-site-verification" content="abc123def456ghi789" />', verifyGoogle: "Gg-1234567890_abcdefXYZ", insurers: "삼성화재, 현대해상" });
    const c = await siteConfig(db);
    expect([c.verifyNaver, c.verifyGoogle, c.insurers]).toEqual(["abc123def456ghi789", "Gg-1234567890_abcdefXYZ", "삼성화재, 현대해상"]);
    await expect(saveSiteConfig(db, owner, { ...base, verifyNaver: '"><script>' })).rejects.toThrow(/네이버 확인 값/);
    expect(routeFor("/insurance", true)).toEqual({ kind: "rewrite", to: "/site/insurance" });
    expect(routeFor("/guide", false)).toEqual({ kind: "rewrite", to: "/site/guide" });
    for (const p of ["/robots.txt", "/sitemap.xml", "/fonts/pretendard/pretendard.css"]) expect(routeFor(p, true), p).toEqual({ kind: "pass" });
  });
});
