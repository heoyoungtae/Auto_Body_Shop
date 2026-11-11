"use server";
// 재고(STD-07 7절) 화면의 서버 동작
import { redirect } from "next/navigation";
import { getDb } from "@/db/runtime";
import { createSupplier } from "@/modules/purchase/supplier";
import { addItemDoc, discardLot, orderLowStock, recordCount, resumeItem, retireItemDoc, saveItem, stopItem, useStock, type ItemInput } from "@/modules/purchase/stock";
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
    vatMode: s("vatMode") || "excluded",
    packAmount: s("packAmount") ? num(s("packAmount")) : null,
    packUnit: s("packUnit"),
    expCategory: s("expCategory"),
    chemicalId: s("chemicalId"),
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
    } else if (intent === "stop") {
      const r = await stopItem(db, user, id, { reason: s("stopReason"), note: s("stopNote"), replacedById: s("replacedById") });
      msg = r === "stopped" ? "사용 중지했습니다. 재고 목록의 '사용 중지'에서 볼 수 있습니다" : "소진 후 중지로 바꿨습니다. 새 발주는 막고, 남은 것을 다 쓰면 저절로 사용 중지됩니다";
    } else if (intent === "resume") {
      await resumeItem(db, user, id);
      msg = "다시 쓰는 품목으로 되돌렸습니다";
    } else if (intent === "doc") {
      const f = form.get("docFile");
      await addItemDoc(
        db,
        user,
        id,
        { kind: s("docKind"), title: s("docTitle"), issuer: s("issuer"), issuedOn: s("issuedOn"), expiresOn: s("docExpiresOn"), result: s("result"), lot: s("docLot"), note: s("docNote"), replaceId: s("replaceId") || undefined },
        f instanceof File && f.size ? { name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) } : null,
      );
      msg = "문서를 올렸습니다";
    } else if (intent === "docRetire") {
      await retireItemDoc(db, user, s("docId"));
      msg = "문서를 지난 판으로 뺐습니다";
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

/** 품목 등록 중 새 업체 간이 등록(후보). 화면을 떠나지 않도록 결과를 돌려준다. 계좌는 받지 않는다 */
export async function quickSupplierAction(form: FormData): Promise<{ ok: true; id: string; name: string } | { ok: false; error: string }> {
  const user = await requireUser();
  const s = str(form);
  try {
    const name = s("name");
    const id = await createSupplier(await getDb(), user, {
      name,
      bizNo: s("bizNo"),
      kinds: form.getAll("kinds").map(String),
      items: s("items"),
      contactName: s("contactName"),
      phone: s("phone"),
      email: "",
      leadDays: null,
      returnTerms: "",
      docs: [],
      note: "재고 품목 등록 중 간이 등록",
    });
    return { ok: true, id, name };
  } catch (e) {
    return { ok: false, error: userMessage(e) };
  }
}
