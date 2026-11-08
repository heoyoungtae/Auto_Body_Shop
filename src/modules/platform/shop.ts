// 사업장 정보 — 법정 서식(자동차점검·정비견적서 별지 제89호의3 등)의 '정비사업자' 칸에 그대로 찍힌다. 한 번만 넣는다.
import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { appConfig } from "@/db/schema";
import { writeAudit } from "./audit";
import { UserError } from "./errors";

const KEY = "shop";

export type ShopInfo = { name: string; ceo: string; bizNo: string; repairRegNo: string; address: string; phone: string };
export const EMPTY_SHOP: ShopInfo = { name: "", ceo: "", bizNo: "", repairRegNo: "", address: "", phone: "" };

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

export async function saveShopInfo(db: Db, actorId: string, input: ShopInfo) {
  const s: ShopInfo = {
    name: input.name.trim(),
    ceo: input.ceo.trim(),
    bizNo: input.bizNo.trim() ? formatBizNo(input.bizNo.trim()) : "",
    repairRegNo: input.repairRegNo.trim(),
    address: input.address.trim(),
    phone: input.phone.trim(),
  };
  if (!s.name) throw new UserError("업체명을 적어 주세요");
  if (s.bizNo && !validBizNo(s.bizNo)) throw new UserError("사업자등록번호가 맞지 않습니다. 사업자등록증의 10자리(예: 123-45-67890)를 다시 확인해 주세요");
  const before = await loadShopInfo(db);
  await db
    .insert(appConfig)
    .values({ key: KEY, data: s, updatedBy: actorId, updatedAt: new Date() })
    .onConflictDoUpdate({ target: appConfig.key, set: { data: s, updatedBy: actorId, updatedAt: new Date() } });
  await writeAudit(db, { actorId, action: "shop.info", entityType: "app_config", entityId: KEY, before, after: s });
}
