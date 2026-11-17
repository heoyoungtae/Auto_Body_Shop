"use server";
import { redirect } from "next/navigation";
import { getDb } from "@/db/runtime";
import { linkCreated } from "@/modules/bank/service";
import { cancelBill, createBill, recordBillPayment, setBillInvoice } from "@/modules/money/credit";
import { errorUrl, noticeUrl, requireUser, userMessage } from "../../_lib/session";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;

/** 거래처 원장에서 고른 외상 출고 건으로 청구서 만들기 */
export async function createBillAction(form: FormData) {
  const user = await requireUser();
  const customerId = str(form, "customerId");
  let id: string;
  let msg: string;
  try {
    const r = await createBill(await getDb(), user, customerId, form.getAll("st").map(String), str(form, "note"));
    id = r.id;
    msg = `청구서 ${r.docNo}(${won(r.total)})를 만들었습니다. 받을 날 ${r.dueOn}`;
  } catch (e) {
    redirect(errorUrl(`/money/accounts/${customerId}`, userMessage(e)));
  }
  redirect(noticeUrl(`/money/accounts/bills/${id}`, msg));
}

/** 청구서 화면: 세금계산서 번호·입금 적기·취소 */
export async function billAction(form: FormData) {
  const user = await requireUser();
  const id = str(form, "billId");
  const back = `/money/accounts/bills/${id}`;
  let msg = "";
  let to = back;
  try {
    const db = await getDb();
    switch (str(form, "intent")) {
      case "invoice":
        await setBillInvoice(db, user, id, { no: str(form, "taxInvoiceNo"), on: str(form, "taxInvoiceOn") });
        msg = "세금계산서 번호를 적었습니다";
        break;
      case "pay": {
        const d = str(form, "amountWon").replace(/[^\d]/g, "");
        const r = await recordBillPayment(db, user, id, { amountWon: d ? Number(d) : null, receivedOn: str(form, "receivedOn"), method: str(form, "method"), payerName: str(form, "payerName"), note: str(form, "note") });
        // 통장 입금에서 열었으면 그 거래와 잇는다
        const tx = str(form, "tx");
        if (tx) await linkCreated(db, user, tx, "bill", id, r.billNo, new Date());
        msg = `입금을 적었습니다(입금 전표 ${r.vouchers.map((v) => v.docNo).join(", ")})${r.remain > 0 ? ` · 남은 ${won(r.remain)}` : " · 다 받았습니다"}`;
        break;
      }
      case "cancel": {
        await cancelBill(db, user, id, str(form, "reason"));
        msg = "청구서를 취소했습니다. 묶였던 출고 건은 다시 '청구 안 함'입니다";
        to = `/money/accounts/${str(form, "customerId")}`;
        break;
      }
      default:
        throw new Error("알 수 없는 동작입니다");
    }
  } catch (e) {
    redirect(errorUrl(back, userMessage(e)));
  }
  redirect(noticeUrl(to, msg));
}
