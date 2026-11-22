// 홈페이지 믿음 자료(대표 2026-11-21 "제안대로 전부"): 손님 후기·바깥 후기 바로 가기, 공업사 실제 사진, 자격·인증.
// 한 곳(app_config 'site_trust')에 모아 둔다. 상담을 쓸 수 있는 직원(consult.write)이 '홈페이지 글 › 후기·사진·인증'에서 고친다.
// - 후기: 네이버·카카오·구글 등 바깥 후기를 옮겨 적는다(이름은 첫 글자만 남기고 가림). 별점 요약은 바깥 사이트 숫자를 그대로 적는다.
// - 사진: 화면에서 줄여 새로 그린 그림(위치정보 없음)만 받는다. 직원 얼굴이 나오면 그 직원의 동의를 먼저 받는다.
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { appConfig } from "@/db/schema";
import type { Role } from "@/modules/auth/roles";
import { can } from "@/modules/auth/permissions";
import { maskName } from "@/modules/carbook/rules";
import { writeAudit } from "@/modules/platform/audit";
import { IMAGE_TYPES, MAX_IMAGE_BYTES, removeStored, sniffImage, storeFile } from "@/modules/platform/storage";
import { maskPersonal } from "./rules";
import { SiteError } from "./service";

type Actor = { id: string; roles: readonly Role[] };
const KEY = "site_trust";

export const REVIEW_SOURCES = ["네이버", "카카오맵", "구글", "직접 받은 후기"] as const;
export const PHOTO_KINDS = { outside: "외관", shop: "작업장", gear: "장비", team: "사람들" } as const;
export type PhotoKind = keyof typeof PHOTO_KINDS;
export const TRUST_LIMIT = { reviews: 12, certs: 8, photos: 12 } as const;

export type SiteReview = { id: string; name: string; rating: number; text: string; source: string; date: string };
export type SiteCert = { id: string; name: string; desc: string };
export type SitePhoto = { id: string; path: string; caption: string; kind: PhotoKind; width?: number; height?: number };
export type SiteTrust = {
  links: { naver: string; kakao: string; google: string };
  /** 바깥 별점 요약(예: 네이버 4.9점·후기 128개). 비우면 안 보인다 */
  rating: { score: number | null; count: number | null; source: string };
  reviews: SiteReview[];
  certs: SiteCert[];
  photos: SitePhoto[];
  /** 첫 화면 배경으로 쓸 공업사 사진(사진 id). 비우면 기본 그림(/site-art/hero.svg) */
  hero: string;
};
export const EMPTY_TRUST: SiteTrust = { links: { naver: "", kakao: "", google: "" }, rating: { score: null, count: null, source: "" }, reviews: [], certs: [], photos: [], hero: "" };

export async function siteTrust(db: Db): Promise<SiteTrust> {
  const [r] = await db.select({ data: appConfig.data }).from(appConfig).where(eq(appConfig.key, KEY));
  const d = (r?.data as Partial<SiteTrust>) ?? {};
  return { ...EMPTY_TRUST, ...d, links: { ...EMPTY_TRUST.links, ...(d.links ?? {}) }, rating: { ...EMPTY_TRUST.rating, ...(d.rating ?? {}) } };
}

async function put(db: Db, actor: Actor, data: SiteTrust, action: string, after: Record<string, unknown>, now = new Date()) {
  await db
    .insert(appConfig)
    .values({ key: KEY, data, updatedBy: actor.id, updatedAt: now })
    .onConflictDoUpdate({ target: appConfig.key, set: { data, updatedBy: actor.id, updatedAt: now } });
  await writeAudit(db, { actorId: actor.id, action, entityType: "app_config", entityId: KEY, after });
}

function mustWrite(actor: Actor) {
  if (!can(actor, "consult.write")) throw new SiteError("홈페이지 글은 상담을 쓸 수 있는 사람(상담원·공장장·대표)이 씁니다");
}
const cut = (s: unknown, n: number) =>
  String(s ?? "")
    .trim()
    .slice(0, n);

/** 바깥 후기 주소: 네이버(map.naver.com·naver.me·m.place.naver.com), 카카오(place.map.kakao.com·kko.to), 구글(g.page·maps.app.goo.gl·google.com/maps) */
const LINK_RE = {
  naver: /^https:\/\/((m\.)?place\.naver\.com|map\.naver\.com|naver\.me)\//,
  kakao: /^https:\/\/(place\.map\.kakao\.com|kko\.to|map\.kakao\.com)\//,
  google: /^https:\/\/(g\.page|maps\.app\.goo\.gl|(www\.)?google\.com\/maps|goo\.gl\/maps)\//,
} as const;

export async function saveTrustLinks(db: Db, actor: Actor, input: { naver: string; kakao: string; google: string; score: string; count: string; source: string }) {
  mustWrite(actor);
  const t = await siteTrust(db);
  const links = { naver: cut(input.naver, 300), kakao: cut(input.kakao, 300), google: cut(input.google, 300) };
  const names = { naver: "네이버", kakao: "카카오맵", google: "구글" } as const;
  for (const k of ["naver", "kakao", "google"] as const)
    if (links[k] && !LINK_RE[k].test(links[k])) throw new SiteError(`${names[k]} 주소가 아닙니다. ${names[k]} 지도에서 제이모터스를 찾아 열고 '공유 › 주소 복사'로 붙여 주세요`);
  const score = input.score.trim() ? Number(input.score) : null;
  if (score != null && !(score >= 1 && score <= 5)) throw new SiteError("별점은 1~5 사이 숫자입니다(예: 4.9)");
  const count = input.count.trim() ? Math.round(Number(input.count.replace(/[^\d]/g, ""))) : null;
  const rating = { score: score == null ? null : Math.round(score * 10) / 10, count: count && count > 0 ? count : null, source: cut(input.source, 20) };
  await put(db, actor, { ...t, links, rating }, "site.trust_links", { links, rating });
}

export async function addReview(db: Db, actor: Actor, input: { name: string; rating: number; text: string; source: string; date: string }) {
  mustWrite(actor);
  const t = await siteTrust(db);
  if (t.reviews.length >= TRUST_LIMIT.reviews) throw new SiteError(`후기는 ${TRUST_LIMIT.reviews}개까지 둡니다. 오래된 것을 지우고 넣어 주세요`);
  const raw = cut(input.name, 20);
  const text = cut(input.text, 400);
  if (text.length < 5) throw new SiteError("후기 내용을 적어 주세요");
  if (maskPersonal(text) !== text) throw new SiteError("후기에 휴대폰 번호나 차량번호가 있습니다. 지우고 넣어 주세요");
  const rating = Math.round(Number(input.rating));
  if (!(rating >= 1 && rating <= 5)) throw new SiteError("별점을 골라 주세요");
  const source = (REVIEW_SOURCES as readonly string[]).includes(input.source) ? input.source : "직접 받은 후기";
  const date = /^\d{4}-\d{2}-\d{2}$/.test(input.date) ? input.date : "";
  const r: SiteReview = { id: randomUUID(), name: raw ? maskName(raw.replace(/\*+$/, "")) : "고객", rating, text, source, date };
  await put(db, actor, { ...t, reviews: [r, ...t.reviews] }, "site.review", { source, rating });
}

export async function removeReview(db: Db, actor: Actor, id: string) {
  mustWrite(actor);
  const t = await siteTrust(db);
  await put(db, actor, { ...t, reviews: t.reviews.filter((r) => r.id !== id) }, "site.review_delete", { id });
}

export async function addCert(db: Db, actor: Actor, input: { name: string; desc: string }) {
  mustWrite(actor);
  const t = await siteTrust(db);
  if (t.certs.length >= TRUST_LIMIT.certs) throw new SiteError(`자격·인증은 ${TRUST_LIMIT.certs}개까지 둡니다`);
  const name = cut(input.name, 40);
  const desc = cut(input.desc, 120);
  if (name.length < 2) throw new SiteError("자격·인증 이름을 적어 주세요");
  if (desc.length < 5) throw new SiteError("손님이 알아듣게 한 줄 설명을 적어 주세요(예: 국토교통부에 등록한 자동차 정비업체입니다)");
  await put(db, actor, { ...t, certs: [...t.certs, { id: randomUUID(), name, desc }] }, "site.cert", { name });
}

export async function removeCert(db: Db, actor: Actor, id: string) {
  mustWrite(actor);
  const t = await siteTrust(db);
  await put(db, actor, { ...t, certs: t.certs.filter((c) => c.id !== id) }, "site.cert_delete", { id });
}

/** 공업사 사진 올리기: 화면에서 긴 변 1600px 로 새로 그린 그림(위치정보 없음) */
export async function addShopPhoto(db: Db, actor: Actor, bytes: Uint8Array, input: { caption: string; kind: string; width?: number; height?: number }) {
  mustWrite(actor);
  const t = await siteTrust(db);
  if (t.photos.length >= TRUST_LIMIT.photos) throw new SiteError(`사진은 ${TRUST_LIMIT.photos}장까지 둡니다. 한 장을 빼고 올려 주세요`);
  if (!(input.kind in PHOTO_KINDS)) throw new SiteError("사진 종류를 골라 주세요");
  if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) throw new SiteError("사진이 비었거나 너무 큽니다(6MB까지)");
  const type = sniffImage(bytes);
  if (!type) throw new SiteError("사진 파일만 올릴 수 있습니다");
  const path = await storeFile("site/shop", bytes, IMAGE_TYPES[type]);
  const p: SitePhoto = {
    id: randomUUID(),
    path,
    caption: cut(input.caption, 60),
    kind: input.kind as PhotoKind,
    width: input.width && input.width > 0 ? Math.round(input.width) : undefined,
    height: input.height && input.height > 0 ? Math.round(input.height) : undefined,
  };
  await put(db, actor, { ...t, photos: [...t.photos, p] }, "site.photo", { kind: p.kind });
  return path;
}

export async function removeShopPhoto(db: Db, actor: Actor, id: string) {
  mustWrite(actor);
  const t = await siteTrust(db);
  const p = t.photos.find((x) => x.id === id);
  if (!p) return;
  await put(db, actor, { ...t, photos: t.photos.filter((x) => x.id !== id), hero: t.hero === id ? "" : t.hero }, "site.photo_delete", { kind: p.kind });
  await removeStored(p.path);
}

/** 첫 화면 배경 사진 고르기(빈 값이면 기본 그림으로 되돌림) */
export async function setHeroPhoto(db: Db, actor: Actor, id: string) {
  mustWrite(actor);
  const t = await siteTrust(db);
  if (id && !t.photos.some((p) => p.id === id)) throw new SiteError("없는 사진입니다");
  await put(db, actor, { ...t, hero: id }, "site.hero", { hero: id ? "photo" : "default" });
}

export const DEFAULT_HERO = "/site-art/hero.svg";

/** 첫 화면 배경 주소: 고른 공업사 사진, 없으면 기본 그림 */
export function heroImage(t: SiteTrust) {
  const p = t.hero ? t.photos.find((x) => x.id === t.hero) : undefined;
  return p ? `/api/site-file/${p.path}` : DEFAULT_HERO;
}

/** 홈페이지에서 누구나 여는 공업사 사진인지(지금 걸려 있는 것만) */
export async function publicShopFile(db: Db, rel: string) {
  if (!/^site\/shop\/[0-9a-f-]{36}\.(jpg|webp|png)$/.test(rel)) return false;
  return (await siteTrust(db)).photos.some((p) => p.path === rel);
}
