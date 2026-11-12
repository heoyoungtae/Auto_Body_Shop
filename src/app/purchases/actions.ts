"use server";
// 발주·입고 검수(STD-07 5·6절, F-07-02) 화면의 서버 동작
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/db/runtime";
import {
  addOrderLines,
  addReceiptPhoto,
  approveOrder,
  cancelOrder,
  createOrder,
  linkInvoice,
  receiveOrder,
  recordReply,
  removeOrderLine,
  removeReceiptPhoto,
  returnDone,
  saveOrderHeader,
  saveOrderLine,
  sendOrder,
  submitOrder,
} from "@/modules/purchase/order";
import { UserError } from "@/modules/platform/errors";
import { errorUrl, noticeUrl, requireUser, userMessage } from "../_lib/session";

const str = (form: FormData) => (k: string) => String(form.get(k) ?? "").trim();
const num = (v: string) => {
  const d = v.replace(/[^\d]/g, "");
  return d ? Number(d) : NaN;
};

export async function createOrderAction(form: FormData) {
  const user = await requireUser();
  const s = str(form);
  let id = "";
  try {
    id = await createOrder(await getDb(), user, { kind: s("kind") === "repair" ? "repair" : "stock", repairOrderId: s("repairOrderId") || null, supplierId: s("supplierId") || null, dueOn: s("dueOn") || null, note: s("note") });
  } catch (e) {
    redirect(errorUrl(`/purchases/new${s("repairOrderId") ? `?ro=${s("repairOrderId")}` : ""}`, userMessage(e)));
  }
  redirect(noticeUrl(`/purchases/${id}`, "발주서를 만들었습니다. 품목을 넣고 승인을 요청하세요"));
}

export async function orderAction(form: FormData) {
  const user = await requireUser();
  const s = str(form);
  const id = s("id");
  const back = `/purchases/${id}`;
  let msg = "저장했습니다";
  try {
    const db = await getDb();
    // 같은 양식에 '줄 지우기' 같은 다른 단추가 있으면 누른 단추 값이 맨 뒤에 온다
    const intent = form.getAll("intent").map(String).pop();
    if (intent === "header") await saveOrderHeader(db, user, id, { supplierId: s("supplierId"), dueOn: s("dueOn"), note: s("note"), payTerm: s("payTerm"), payDay: s("payDay") ? num(s("payDay")) : null });
    else if (intent === "line") {
      await saveOrderLine(db, user, id, s("lineId") || null, { name: s("name"), partNo: s("partNo"), spec: s("spec"), partCode: s("partCode") || null, qty: num(s("qty")), unitWon: num(s("unitWon")), stockItemId: s("stockItemId") || null });
      msg = s("lineId") ? "줄을 고쳤습니다" : "품목을 넣었습니다";
    } else if (intent === "lines") {
      // 한꺼번에 넣기: r{번호}_name 처럼 줄 번호가 붙은 칸을 줄마다 모은다
      const idx = [...new Set([...form.keys()].map((k) => /^r(\d+)_name$/.exec(k)?.[1]).filter((x): x is string => !!x))].sort((a, b) => Number(a) - Number(b));
      const n = await addOrderLines(
        db,
        user,
        id,
        idx.map((i) => {
          const g = (k: string) => s(`r${i}_${k}`);
          return { name: g("name"), partNo: g("partNo"), spec: g("spec"), partCode: g("partCode") || null, qty: num(g("qty")), unitWon: num(g("unitWon")), stockItemId: g("stockItemId") || null };
        }),
      );
      msg = `품목 ${n}줄을 넣었습니다`;
    } else if (intent === "removeLine") {
      await removeOrderLine(db, user, id, s("lineId"));
      msg = "줄을 지웠습니다";
    } else if (intent === "submit") {
      const role = await submitOrder(db, user, id, s("emergency") === "1");
      msg = `승인을 요청했습니다(${role === "owner" ? "대표" : "공장장"} 승인)`;
    } else if (intent === "approve") {
      const ok = s("ok") === "1";
      await approveOrder(db, user, id, ok, s("decideNote"));
      msg = ok ? "승인했습니다. 공장장이 발주서를 보냅니다" : "되돌렸습니다";
    } else if (intent === "send") {
      await sendOrder(db, user, id, { via: s("via"), replyDueOn: s("replyDueOn") });
      msg = "발주서를 보냈다고 기록했습니다";
    } else if (intent === "reply") {
      const late = await recordReply(db, user, id, s("replyDueOn"));
      msg = late ? "납기를 적었습니다. 출고 약속일보다 늦어 상담원에게 고객 안내를 알렸습니다" : "납기를 적었습니다";
    } else if (intent === "receive") {
      const lineIds = form.getAll("lineId").map(String);
      const r = await receiveOrder(db, user, id, {
        lines: lineIds.map((lineId) => ({ lineId, ok: num(s(`ok_${lineId}`)) || 0, bad: num(s(`bad_${lineId}`)) || 0, lot: s(`lot_${lineId}`), expiresOn: s(`exp_${lineId}`), location: s(`loc_${lineId}`) })),
        checks: form.getAll("checks").map(String),
        badNote: s("badNote"),
        needNc: s("needNc") === "1",
      });
      msg = r.all ? "입고 검수를 마쳤습니다(전량 입고)" : "입고 검수를 기록했습니다. 남은 수량은 다음 입고 때 검수합니다";
    } else if (intent === "returnDone") {
      await returnDone(db, user, s("receiptId"), s("returnNote"));
      msg = "반품·교환 처리를 기록했습니다";
    } else if (intent === "invoice") {
      await linkInvoice(db, user, id, { invoiceNo: s("invoiceNo"), invoiceOn: s("invoiceOn") });
      msg = "세금계산서를 연결했습니다";
    } else if (intent === "cancel") {
      await cancelOrder(db, user, id, s("cancelReason"));
      msg = "발주를 취소했습니다";
    } else throw new UserError("알 수 없는 요청");
  } catch (e) {
    redirect(errorUrl(back, userMessage(e)));
  }
  redirect(noticeUrl(back, msg));
}

type R = { ok: true } | { ok: false; error: string };

export async function uploadReceiptPhotoAction(form: FormData): Promise<R> {
  const user = await requireUser();
  const file = form.get("file");
  try {
    if (!(file instanceof Blob)) throw new UserError("사진을 고르지 않았습니다");
    const orderId = await addReceiptPhoto(await getDb(), user, String(form.get("receiptId") ?? ""), new Uint8Array(await file.arrayBuffer()));
    revalidatePath(`/purchases/${orderId}`);
  } catch (e) {
    return { ok: false, error: userMessage(e) };
  }
  return { ok: true };
}

export async function removeReceiptPhotoAction(form: FormData): Promise<R> {
  const user = await requireUser();
  try {
    const orderId = await removeReceiptPhoto(await getDb(), user, String(form.get("receiptId") ?? ""), String(form.get("path") ?? ""));
    if (orderId) revalidatePath(`/purchases/${orderId}`);
  } catch (e) {
    return { ok: false, error: userMessage(e) };
  }
  return { ok: true };
}
