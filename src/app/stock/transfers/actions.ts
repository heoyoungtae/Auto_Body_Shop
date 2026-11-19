"use server";
// 재고 이동 전표(본점·지점 3단계): 보내기·받음 확인·취소
import { redirect } from "next/navigation";
import { getDb } from "@/db/runtime";
import { cancelTransfer, receiveTransfer, sendTransfer } from "@/modules/purchase/transfer";
import { errorUrl, noticeUrl, requireUser, userMessage } from "../../_lib/session";

const str = (form: FormData) => (k: string) => String(form.get(k) ?? "").trim();
const num = (v: string) => {
  const d = v.replace(/[^\d]/g, "");
  return d ? Number(d) : NaN;
};

export async function sendTransferAction(form: FormData) {
  const user = await requireUser();
  const s = str(form);
  const ids = form.getAll("itemId").map(String);
  let r: { id: string; docNo: string };
  try {
    r = await sendTransfer(await getDb(), user, {
      toBranchId: s("toBranchId"),
      lines: ids.filter((i) => s(`qty_${i}`) !== "" && num(s(`qty_${i}`)) > 0).map((itemId) => ({ itemId, qty: num(s(`qty_${itemId}`)) })),
      note: s("note"),
    });
  } catch (e) {
    redirect(errorUrl("/stock/transfers", userMessage(e)));
  }
  redirect(noticeUrl(`/stock/transfers/${r.id}`, `${r.docNo}로 보냈습니다. 받는 지점이 '받음 확인'을 누르면 그 지점 재고에 들어갑니다`));
}

export async function receiveTransferAction(form: FormData) {
  const user = await requireUser();
  const s = str(form);
  const id = s("id");
  const got: Record<string, number> = {};
  for (const k of form.keys()) if (k.startsWith("got_") && s(k) !== "") got[k.slice(4)] = num(s(k));
  try {
    await receiveTransfer(await getDb(), user, id, { got, note: s("receivedNote") });
  } catch (e) {
    redirect(errorUrl(`/stock/transfers/${id}`, userMessage(e)));
  }
  redirect(noticeUrl(`/stock/transfers/${id}`, "받음 확인을 했습니다. 이 지점 재고에 들어갔습니다"));
}

export async function cancelTransferAction(form: FormData) {
  const user = await requireUser();
  const s = str(form);
  const id = s("id");
  try {
    await cancelTransfer(await getDb(), user, id, s("cancelReason"));
  } catch (e) {
    redirect(errorUrl(`/stock/transfers/${id}`, userMessage(e)));
  }
  redirect(noticeUrl(`/stock/transfers/${id}`, "이동을 취소하고 보낸 지점 재고로 되돌렸습니다"));
}
