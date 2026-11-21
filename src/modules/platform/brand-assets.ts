// 로고·앱 아이콘(대표 결정 2026-11-21): PNG 파일을 설정 › 로고·앱 아이콘에 등록해 앱 전체가 쓴다.
// 등록하지 않은 칸은 앱에 들어 있는 기본 그림(public/brand-default)을 쓴다.
// 화면·파비콘·홈 화면 아이콘은 /brand/<종류>.png?v=<바꾼 시각> 으로 받는다(로그인 없이 — 로그인 화면·브라우저 탭에도 나와야 하므로).
import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { appConfig } from "@/db/schema";
import { writeAudit } from "./audit";
import { UserError } from "./errors";
import { removeStored, sniffImage, storeFile } from "./storage";

const KEY = "brand";

export const BRAND_KINDS = ["original", "logo-light", "logo-dark", "app-icon", "small-icon"] as const;
export type BrandKind = (typeof BRAND_KINDS)[number];

type Rule = {
  label: string;
  /** 어디에 쓰이는지(설정 화면·도움말에 그대로 보임) */
  usedIn: string;
  shape: "square" | "wide";
  minSide: number;
  /** 권장 크기(안내 문구) */
  advice: string;
  /** 기본 그림의 크기 */
  defaultSize: [number, number];
};

export const BRAND_RULES: Record<BrandKind, Rule> = {
  original: {
    label: "원본 로고(글자 포함)",
    usedIn: "내 차 수첩(고객용) 들어가는 화면. 간판·명함·스티커 제작용 기준 그림",
    shape: "square",
    minSide: 256,
    advice: "정사각형, 1024×1024 권장",
    defaultSize: [1024, 1024],
  },
  "logo-light": {
    label: "가로 로고 · 밝은 화면용",
    usedIn: "직원 로그인 화면(밝은 화면)",
    shape: "wide",
    minSide: 120,
    advice: "가로가 세로의 3배 이상, 가로 1400px 정도, 투명 바탕",
    defaultSize: [1400, 309],
  },
  "logo-dark": {
    label: "가로 로고 · 어두운 화면용",
    usedIn: "직원 로그인 화면(휴대폰·PC가 어두운 화면일 때)",
    shape: "wide",
    minSide: 120,
    advice: "가로가 세로의 3배 이상, 가로 1400px 정도, 투명 바탕(흰 글자)",
    defaultSize: [1400, 309],
  },
  "app-icon": {
    label: "앱 아이콘(홈 화면)",
    usedIn: "휴대폰 홈 화면 바로가기, 설치한 앱 아이콘(48px보다 큰 곳)",
    shape: "square",
    minSide: 192,
    advice: "정사각형, 512×512 권장",
    defaultSize: [512, 512],
  },
  "small-icon": {
    label: "작은 아이콘(48px 이하)",
    usedIn: "브라우저 탭(파비콘), 화면 맨 위 머리줄",
    shape: "square",
    minSide: 32,
    advice: "정사각형, 96×96~256×256 권장. 작게 줄여도 알아보는 단순한 그림",
    defaultSize: [96, 96],
  },
};

export const MAX_BRAND_BYTES = 5 * 1024 * 1024;

export type BrandEntry = { path: string; width: number; height: number; fileName: string; updatedAt: string };
export type BrandConfig = Partial<Record<BrandKind, BrandEntry>>;

export const isBrandKind = (k: string): k is BrandKind => (BRAND_KINDS as readonly string[]).includes(k);

export async function loadBrand(db: Db): Promise<BrandConfig> {
  const [cfg] = await db.select().from(appConfig).where(eq(appConfig.key, KEY));
  return (cfg?.data ?? {}) as BrandConfig;
}

/** 기본 그림 주소(public/brand-default) */
export const brandDefaultUrl = (k: BrandKind) => `/brand-default/${k}.png`;

/** 화면에서 쓰는 주소. 바꿀 때마다 v 가 달라져 브라우저가 새 그림을 받는다 */
export function brandUrl(cfg: BrandConfig, k: BrandKind): string {
  const e = cfg[k];
  return e ? `/brand/${k}.png?v=${Date.parse(e.updatedAt) || 0}` : brandDefaultUrl(k);
}

/** 그림 크기(가로·세로) */
export function brandSize(cfg: BrandConfig, k: BrandKind): [number, number] {
  const e = cfg[k];
  return e ? [e.width, e.height] : BRAND_RULES[k].defaultSize;
}

/** PNG 머리(IHDR)에서 가로·세로를 읽는다 */
export function pngSize(b: Uint8Array): [number, number] | null {
  if (sniffImage(b) !== "image/png" || b.length < 24) return null;
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  return [v.getUint32(16), v.getUint32(20)];
}

/** 올린 파일이 그 칸에 맞는지 확인하고, 틀리면 무엇을 고치면 되는지 알려 준다 */
export function checkBrandFile(k: BrandKind, bytes: Uint8Array): [number, number] {
  const r = BRAND_RULES[k];
  if (!bytes.length) throw new UserError("PNG 파일을 골라 주세요");
  if (bytes.length > MAX_BRAND_BYTES) throw new UserError("파일이 5MB보다 큽니다. 그림 크기를 줄여 다시 저장해 주세요");
  const size = pngSize(bytes);
  if (!size) throw new UserError("PNG 파일만 받습니다. 그림을 PNG로 저장해 다시 골라 주세요(JPG는 투명 바탕이 없어 로고에 맞지 않습니다)");
  const [w, h] = size;
  if (Math.min(w, h) < r.minSide) throw new UserError(`${r.label}은(는) 짧은 변이 ${r.minSide}px 이상이어야 합니다(올린 그림 ${w}×${h}). 권장: ${r.advice}`);
  if (r.shape === "square" && Math.abs(w - h) > Math.max(2, Math.round(Math.max(w, h) * 0.02)))
    throw new UserError(`${r.label}은(는) 정사각형이어야 합니다(올린 그림 ${w}×${h}). 권장: ${r.advice}`);
  if (r.shape === "wide" && w < h * 2) throw new UserError(`${r.label}은(는) 가로로 긴 그림이어야 합니다(가로가 세로의 2배 이상, 올린 그림 ${w}×${h}). 권장: ${r.advice}`);
  return size;
}

/** 등록(png 있음) 또는 기본으로 되돌리기(png 없음). 대표만 */
export async function saveBrandAsset(db: Db, actor: { id: string; roles: string[] }, k: BrandKind, file: { bytes: Uint8Array; fileName: string } | null, now = new Date()) {
  if (!actor.roles.includes("owner")) throw new UserError("로고·앱 아이콘은 대표만 바꿉니다");
  const before = await loadBrand(db);
  const next: BrandConfig = { ...before };
  if (file) {
    const [width, height] = checkBrandFile(k, file.bytes);
    const path = await storeFile("brand", file.bytes, "png");
    next[k] = { path, width, height, fileName: file.fileName.slice(0, 120), updatedAt: now.toISOString() };
  } else {
    delete next[k];
  }
  await db
    .insert(appConfig)
    .values({ key: KEY, data: next, updatedBy: actor.id, updatedAt: now })
    .onConflictDoUpdate({ target: appConfig.key, set: { data: next, updatedBy: actor.id, updatedAt: now } });
  await writeAudit(db, { actorId: actor.id, action: file ? "brand.upload" : "brand.reset", entityType: "app_config", entityId: `${KEY}.${k}`, before: before[k] ?? null, after: next[k] ?? null });
  // 예전 파일은 지운다(감사 기록에 경로는 남음)
  const old = before[k]?.path;
  if (old && old !== next[k]?.path) await removeStored(old).catch(() => {});
}
