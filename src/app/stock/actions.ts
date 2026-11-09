"use server";
// 재고(STD-07 7절) 화면의 서버 동작
import { redirect } from "next/navigation";
import { getDb } from "@/db/runtime";
import { deactivateItem, discardLot, orderLowStock, recordCount, saveItem, useStock, type ItemInput } from "@/modules/purchase/stock";
import { UserError } from "@/modules/platform/errors";
import { errorUrl, noticeUrl, requireUser, userMessage } from "../_lib/session";

const str = (form: FormData) => (k: string) => String(form.get(k) ?? "").trim();
const num = (v: string) => {
  const d = v.replace(/[^\d]/g, "");
  return d ? Number(d) : NaN;
};

function itemInput(form: FormData): ItemInput {
  const s = str(form);
  return {
    name: s("name"),
    kind: s("kind"),
    spec: s("spec"),
    unit: s("unit"),
    location: s("location"),
    safetyQty: num(s("safetyQty")) || 0,
    unitWon: num(s("unitWon")) || 0,
    expiryTracked: s("expiryTracked") === "1",
    supplierId: s("supplierId"),
    openingQty: num(s("openingQty")) || 0,
    openingExpiresOn: s("openingExpiresOn"),
  };
}

export async function saveItemAction(form: FormData) {
  const user = await requireUser();
  const s = str(form);
  const id = s("id") || null;
  let newId = "";
  try {
    newId = await saveItem(await getDb(), user, id, itemInput(form));
  } catch (e) {
    redirect(errorUrl(id ? `/stock/${id}` : "/stock/new", userMessage(e)));
  }
  redirect(noticeUrl(`/stock/${newId}`, id ? "품목을 고쳤습니다" : "재고 품목을 등록했습니다"));
}

export async function stockAction(form: FormData) {
  const user = await requireUser();
  const s = str(form);
  const id = s("id");
  const back = s("back") || `/stock/${id}`;
  let msg = "저장했습니다";
  let to = back;
  try {
    const db = await getDb();
    const intent = s("intent");
    if (intent === "use") {
      const r = await useStock(db, user, { itemId: s("itemId"), qty: num(s("qty")), repairOrderId: s("repairOrderId") || null, note: s("useNote") });
      msg = `사용을 기록했습니다. 남은 수량 ${r.left}${r.low ? " — 안전 재고 아래라 공장장에게 알렸습니다" : ""}`;
    } else if (intent === "discard") {
      await discardLot(db, user, s("lotId"), s("discardNote"));
      msg = "폐기 처리했습니다. 지정 폐기물로 보관하세요(STD-10)";
    } else if (intent === "deactivate") {
      await deactivateItem(db, user, id);
      msg = "품목을 뺐습니다";
      to = "/stock";
    } else if (intent === "orderLow") {
      const ids = await orderLowStock(db, user, form.getAll("itemIds").map(String));
      msg = `발주 요청 ${ids.length}장을 만들었습니다. 업체·단가를 확인하고 승인을 요청하세요`;
      to = ids.length === 1 ? `/purchases/${ids[0]}` : "/purchases?f=review";
    } else throw new UserError("알 수 없는 요청");
  } catch (e) {
    redirect(errorUrl(back, userMessage(e)));
  }
  redirect(noticeUrl(to, msg));
}

export async function countAction(form: FormData) {
  const user = await requireUser();
  const s = str(form);
  const ids = form.getAll("itemId").map(String);
  let msg = "";
  try {
    const r = await recordCount(await getDb(), user, {
      kind: s("kind"),
      lines: ids.filter((i) => s(`actual_${i}`) !== "").map((itemId) => ({ itemId, actual: num(s(`actual_${itemId}`)) })),
      note: s("countNote"),
    });
    msg = r.over ? `차이 ${r.pct}%로 기준을 넘어 부적합 ${r.nc?.docNo}을(를) 발행했습니다. 장부를 실물에 맞췄습니다` : `실사를 저장하고 장부를 실물에 맞췄습니다(차이 ${r.pct}%)`;
  } catch (e) {
    redirect(errorUrl(`/stock/count?kind=${s("kind")}`, userMessage(e)));
  }
  redirect(noticeUrl("/stock", msg));
}
