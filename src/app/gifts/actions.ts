"use server";
// 기프티콘 발송·취소
import { redirect } from "next/navigation";
import { getDb } from "@/db/runtime";
import { cancelGift, sendGift } from "@/modules/messaging/gift-send";
import { errorUrl, noticeUrl, requireUser, userMessage } from "../_lib/session";

const str = (form: FormData) => (k: string) => String(form.get(k) ?? "").trim();

export async function sendGiftAction(form: FormData) {
  const user = await requireUser();
  const s = str(form);
  let r = { docNo: "", demo: false, price: 0 };
  try {
    r = await sendGift(await getDb(), user, {
      customerId: s("customerId"),
      purpose: s("purpose"),
      reason: s("reason"),
      complaintId: s("complaintId"),
      goodsCode: s("goodsCode"),
      message: s("message"),
      dupOk: s("dupOk") === "1",
    });
  } catch (e) {
    redirect(
      errorUrl(`/gifts/send?customer=${s("customerId")}`, userMessage(e)),
    );
  }
  redirect(
    noticeUrl(
      "/gifts",
      `${r.docNo} ${r.price.toLocaleString("ko-KR")}원 기프티콘을 보냈습니다${r.demo ? "(데모 모드라 실제로는 보내지지 않았습니다)" : ""}`,
    ),
  );
}

export async function cancelGiftAction(form: FormData) {
  const user = await requireUser();
  const s = str(form);
  const back = `/gifts?ym=${s("ym")}`;
  try {
    await cancelGift(await getDb(), user, Number(s("id")), s("reason"));
  } catch (e) {
    redirect(errorUrl(back, userMessage(e)));
  }
  redirect(noticeUrl(back, "취소했습니다. 비즈머니로 돌아옵니다"));
}
