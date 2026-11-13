// 재고 원가(이동평균법, 보고서 센터 3단계, 사용자 결정 2026-11-13).
// 들어올 때(입고·처음 등록)는 매입 공급가로 금액을 더하고, 나갈 때(사용·폐기·실사 부족)는 그때의 평균 단가로 뺀다.
// 실사로 늘어난 것은 평균 단가(없으면 최근 매입 단가)로 더한다. 수량이 0이 되면 금액도 0(끝전이 남지 않게).
// 움직임마다 단가·금액을 남겨 과거 시점 재고 금액·사용 금액(매출원가 재료비)·회전율을 다시 계산할 수 있다.
import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { stockItem, stockMove } from "@/db/schema";

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/** 평균 단가(공급가, 원). 수량이 없으면 최근 매입 단가 */
export const avgUnit = (i: { qty: number; valueWon: number; unitWon: number }) => (i.qty > 0 ? i.valueWon / i.qty : i.unitWon);

/**
 * 움직임 하나의 금액. before = 움직이기 전 장부(수량·금액·최근 매입 단가), qty = +들어옴 / −나감,
 * inUnit = 들어올 때 매입 공급가(입고·처음 등록). 없으면 평균 단가로 계산한다.
 */
export function moveCost(before: { qty: number; valueWon: number; unitWon: number }, qty: number, inUnit?: number | null) {
  const bq = Math.max(0, before.qty);
  const bv = bq > 0 ? before.valueWon : 0;
  let amount: number;
  if (qty >= 0) amount = Math.round(qty * (inUnit != null ? inUnit : avgUnit({ qty: bq, valueWon: bv, unitWon: before.unitWon })));
  else if (bq + qty <= 0) amount = -bv;
  else amount = -Math.round((bv * -qty) / bq);
  const balQty = Math.max(0, bq + qty);
  const balWon = balQty > 0 ? bv + amount : 0;
  return { unitWon: qty ? Math.round(Math.abs(amount / qty)) : Math.round(avgUnit({ qty: bq, valueWon: bv, unitWon: before.unitWon })), amountWon: amount, balQty, balWon };
}

export type MoveInput = { qty: number; reason: "receive" | "use" | "count" | "discard"; ref?: string | null; repairOrderId?: string | null; lot?: string | null; note?: string | null; by: string; at: Date };

/**
 * 움직임 기록 + 장부 금액 맞추기. item 은 움직이기 전 장부(수량·금액·최근 매입 단가).
 * 수량(qty)은 부르는 쪽이 따로 바꾼다(로트·사용 중지 처리와 같이 하므로). 돌려준 값으로 item 을 이어 쓸 수 있다.
 */
export async function postMove(tx: Tx | Db, item: { id: string; qty: number; valueWon: number; unitWon: number }, mv: MoveInput, inUnit?: number | null) {
  const c = moveCost(item, mv.qty, inUnit);
  await tx.update(stockItem).set({ valueWon: c.balWon }).where(eq(stockItem.id, item.id));
  await tx.insert(stockMove).values({ itemId: item.id, qty: mv.qty, reason: mv.reason, ref: mv.ref ?? null, repairOrderId: mv.repairOrderId ?? null, lot: mv.lot ?? null, note: mv.note ?? null, unitWon: c.unitWon, amountWon: c.amountWon, by: mv.by, at: mv.at });
  return c;
}
