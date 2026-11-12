// 메뉴 찾기 칸의 '바로 가기'(UI 개선 11, 2026-11-12): 차량번호·전화번호·고객 이름으로 수리 건·고객 화면에 바로 간다.
// 차량번호는 모든 직원(기술자가 차를 찾아 작업 지시서로 감), 전화번호·이름은 고객 정보를 다루는 사람(customer.write)만 찾는다.
// 전화번호는 가린 번호만 보인다.
import { and, desc, eq, ilike, inArray, ne } from "drizzle-orm";
import type { Db } from "@/db/client";
import { repairOrder, vehicle } from "@/db/schema";
import { RO_STATUS_LABEL } from "@/modules/repair/rules";
import { normalizePlate } from "./rules";
import { searchCustomers } from "./service";

export type QuickHit = { href: string; label: string; sub: string };

/** 차량번호처럼 보이나(숫자 2자리 이상, 한글 섞여도 됨) */
export const looksLikePlate = (s: string) => /\d{2,}/.test(s) && /^[0-9가-힣\s]+$/.test(s.trim());

export async function quickFind(db: Db, q: string, canCustomer: boolean): Promise<QuickHit[]> {
  const s = q.trim();
  if (s.length < 2) return [];
  const out: QuickHit[] = [];
  if (canCustomer) {
    for (const c of await searchCustomers(db, s, 5)) {
      const plates = c.vehicles.map((v) => v.plateNo);
      const ros = plates.length
        ? await db.select({ id: repairOrder.id, docNo: repairOrder.docNo, status: repairOrder.status, plateNo: vehicle.plateNo }).from(repairOrder).innerJoin(vehicle, eq(vehicle.id, repairOrder.vehicleId)).where(and(eq(repairOrder.customerId, c.id), ne(repairOrder.status, "cancelled"))).orderBy(desc(repairOrder.createdAt)).limit(3)
        : [];
      for (const r of ros) out.push({ href: `/repairs/${r.id}`, label: `${r.plateNo} · ${c.name}`, sub: `수리 건 ${r.docNo} · ${RO_STATUS_LABEL[r.status]}` });
      out.push({ href: `/customers/${c.id}`, label: c.name, sub: `고객 · ${c.phone ?? "연락처 없음"}${plates.length ? ` · ${plates.join(", ")}` : ""}` });
    }
    return out.slice(0, 8);
  }
  if (!looksLikePlate(s)) return [];
  const plate = normalizePlate(s);
  const vs = await db.select({ id: vehicle.id }).from(vehicle).where(eq(vehicle.plateNo, plate));
  // 정확히 맞는 차가 없으면 일부(예: 끝 4자리 3456)로 찾는다
  const like = vs.length ? vs : await db.select({ id: vehicle.id }).from(vehicle).where(ilike(vehicle.plateNo, `%${plate}%`)).limit(5);
  if (!like.length) return [];
  const ros = await db
    .select({ id: repairOrder.id, docNo: repairOrder.docNo, status: repairOrder.status, plateNo: vehicle.plateNo })
    .from(repairOrder)
    .innerJoin(vehicle, eq(vehicle.id, repairOrder.vehicleId))
    .where(and(inArray(repairOrder.vehicleId, like.map((v) => v.id)), ne(repairOrder.status, "cancelled")))
    .orderBy(desc(repairOrder.createdAt))
    .limit(5);
  return ros.map((r) => ({ href: `/repairs/${r.id}`, label: r.plateNo, sub: `수리 건 ${r.docNo} · ${RO_STATUS_LABEL[r.status]}` }));
}
