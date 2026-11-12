// 사업장 정보 — 법정 서식(자동차점검·정비견적서 별지 제89호의3 등)의 '정비사업자' 칸에 그대로 찍힌다. 한 번만 넣는다.
import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { appConfig } from "@/db/schema";
import { writeAudit } from "./audit";
import { UserError } from "./errors";
import { sniffImage, storeFile } from "./storage";

const KEY = "shop";

/** address 는 도로명 주소(주소 찾기로 채움), addressDetail 은 동·호수 등. sealPath 는 직인 그림(보관 폴더 상대 경로) */
export type ShopInfo = { name: string; ceo: string; bizNo: string; repairRegNo: string; zip: string; address: string; addressDetail: string; phone: string; sealPath: string };
export const EMPTY_SHOP: ShopInfo = { name: "", ceo: "", bizNo: "", repairRegNo: "", zip: "", address: "", addressDetail: "", phone: "", sealPath: "" };
export type ShopInput = Omit<ShopInfo, "sealPath" | "zip" | "addressDetail"> & { zip?: string; addressDetail?: string };

/** 서류에 찍는 주소 한 줄: (우편번호) 도로명 주소, 상세주소. 예전에 고정된 서류(우편번호 없음)도 그대로 보인다 */
export function shopAddressLine(s: Partial<ShopInfo>): string {
  const main = [s.address, s.addressDetail].filter(Boolean).join(", ");
  return s.zip ? `(${s.zip}) ${main}` : main;
}

/** 사업자등록번호 10자리 검증(국세청 검증 숫자) */
export function validBizNo(raw: string): boolean {
  const d = raw.replace(/\D/g, "");
  if (d.length !== 10) return false;
  const w = [1, 3, 7, 1, 3, 7, 1, 3, 5];
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += Number(d[i]) * w[i];
  sum += Math.floor((Number(d[8]) * 5) / 10);
  return (10 - (sum % 10)) % 10 === Number(d[9]);
}

export const formatBizNo = (raw: string) => {
  const d = raw.replace(/\D/g, "");
  return d.length === 10 ? `${d.slice(0, 3)}-${d.slice(3, 5)}-${d.slice(5)}` : raw;
};

export async function loadShopInfo(db: Db): Promise<ShopInfo> {
  const [cfg] = await db.select().from(appConfig).where(eq(appConfig.key, KEY));
  return { ...EMPTY_SHOP, ...((cfg?.data ?? {}) as Partial<ShopInfo>) };
}

/** 법정 서식에 빠진 칸 */
export function shopMissing(s: ShopInfo): string[] {
  const out: string[] = [];
  if (!s.name) out.push("업체명");
  if (!s.ceo) out.push("대표자");
  if (!s.bizNo) out.push("사업자등록번호");
  if (!s.repairRegNo) out.push("정비업 등록번호");
  if (!s.address) out.push("주소");
  if (!s.phone) out.push("전화번호");
  return out;
}

export async function saveShopInfo(db: Db, actorId: string, input: ShopInput) {
  const before = await loadShopInfo(db);
  const s: ShopInfo = {
    name: input.name.trim(),
    ceo: input.ceo.trim(),
    bizNo: input.bizNo.trim() ? formatBizNo(input.bizNo.trim()) : "",
    repairRegNo: input.repairRegNo.trim(),
    zip: (input.zip ?? "").replace(/\D/g, ""),
    address: input.address.trim(),
    addressDetail: (input.addressDetail ?? "").trim(),
    phone: input.phone.trim(),
    sealPath: before.sealPath,
  };
  if (!s.name) throw new UserError("업체명을 적어 주세요");
  if (s.bizNo && !validBizNo(s.bizNo)) throw new UserError("사업자등록번호가 맞지 않습니다. 사업자등록증의 10자리(예: 123-45-67890)를 다시 확인해 주세요");
  if (s.zip && s.zip.length !== 5) throw new UserError("우편번호는 5자리입니다. 우편번호 옆 '찾기'로 넣으면 틀리지 않습니다");
  await write(db, actorId, before, s);
}

async function write(db: Db, actorId: string, before: ShopInfo, s: ShopInfo) {
  await db
    .insert(appConfig)
    .values({ key: KEY, data: s, updatedBy: actorId, updatedAt: new Date() })
    .onConflictDoUpdate({ target: appConfig.key, set: { data: s, updatedBy: actorId, updatedAt: new Date() } });
  await writeAudit(db, { actorId, action: "shop.info", entityType: "app_config", entityId: KEY, before, after: s });
}

/** 직인 등록·바꾸기·지우기(png=null). 예전 그림 파일은 지우지 않는다 — 이미 낸 서류가 그 그림을 가리킨다 */
export async function saveShopSeal(db: Db, actorId: string, png: Uint8Array | null) {
  const before = await loadShopInfo(db);
  let sealPath = "";
  if (png) {
    if (sniffImage(png) !== "image/png" || png.length > 600_000) throw new UserError("직인 그림을 읽지 못했습니다. PNG·JPG 파일로 다시 골라 주세요");
    sealPath = await storeFile("shop/seal", png, "png");
  }
  await write(db, actorId, before, { ...before, sealPath });
}
