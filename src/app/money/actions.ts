"use server";
// 회계(STD-12) 화면의 서버 동작: 수납·취소 전표·독촉, 지출 결의·증빙·지급·취소, 일일·월 마감
import { redirect } from "next/navigation";
import { getDb } from "@/db/runtime";
import { closeDay, decideMonth, prepareMonth } from "@/modules/money/close";
import {
  attachEvidence,
  cancelExpense,
  createExpense,
  payExpense,
  type Upload,
} from "@/modules/money/expense";
import {
  recordFollow,
  recordPayment,
  reversePayment,
} from "@/modules/money/receipts";
import { errorUrl, noticeUrl, requireUser, userMessage } from "../_lib/session";

const str = (form: FormData) => (k: string) => String(form.get(k) ?? "").trim();
const num = (v: string) => (v === "" ? null : Number(v.replace(/[^\d-]/g, "")));
const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;

async function uploads(form: FormData): Promise<Upload[]> {
  const out: Upload[] = [];
  for (const v of form.getAll("files"))
    if (v instanceof File && v.size)
      out.push({ name: v.name, bytes: new Uint8Array(await v.arrayBuffer()) });
  return out;
}

export async function paymentAction(form: FormData) {
  const user = await requireUser();
  const s = str(form);
  const roId = s("roId");
  const back = `/money/ro/${roId}`;
  let msg = "";
  try {
    const db = await getDb();
    const intent = s("intent");
    if (intent === "pay") {
      const r = await recordPayment(db, user, roId, {
        method: s("method"),
        amountWon: num(s("amountWon")),
        receivedOn: s("receivedOn"),
        receiptKind: s("receiptKind"),
        receiptNo: s("receiptNo"),
        payerName: s("payerName"),
        note: s("note"),
      });
      msg = `${r.docNo} 수납을 적었습니다${r.remain > 0 ? `. 남은 금액 ${won(r.remain)}` : ". 다 받았습니다"}`;
    } else if (intent === "reverse") {
      msg = `취소 전표 ${await reversePayment(db, user, s("paymentId"), s("reason"))}를 적었습니다`;
    } else if (intent === "follow") {
      await recordFollow(db, user, roId, {
        note: s("note"),
        promisedOn: s("promisedOn"),
      });
      msg = "독촉 기록을 남겼습니다";
    }
  } catch (e) {
    redirect(errorUrl(back, userMessage(e)));
  }
  redirect(noticeUrl(back, msg));
}

export async function createExpenseAction(form: FormData) {
  const user = await requireUser();
  const s = str(form);
  let id = "";
  let docNo = "";
  try {
    const r = await createExpense(await getDb(), user, {
      category: s("category"),
      supplierId: s("supplierId"),
      payeeName: s("payeeName"),
      sourceKind: s("sourceKind"),
      sourceId: s("sourceId"),
      purpose: s("purpose"),
      supplyWon: num(s("supplyWon")),
      vatWon: num(s("vatWon")),
      evidenceKind: s("evidenceKind"),
      evidenceNo: s("evidenceNo"),
      evidenceOn: s("evidenceOn"),
      dueOn: s("dueOn"),
      payMethod: s("payMethod"),
      files: await uploads(form),
      fromId: s("fromId") || undefined,
    });
    id = r.id;
    docNo = r.docNo;
  } catch (e) {
    const q = new URLSearchParams();
    for (const k of ["src", "from"]) if (s(k)) q.set(k, s(k));
    redirect(
      errorUrl(`/money/expenses/new${q.size ? `?${q}` : ""}`, userMessage(e)),
    );
  }
  redirect(
    noticeUrl(
      `/money/expenses/${id}`,
      `${docNo}을(를) 결재에 올렸습니다. 승인되면 회계 담당이 지급합니다`,
    ),
  );
}

export async function expenseAction(form: FormData) {
  const user = await requireUser();
  const s = str(form);
  const id = s("id");
  const back = `/money/expenses/${id}`;
  let msg = "";
  try {
    const db = await getDb();
    const intent = s("intent");
    if (intent === "evidence") {
      await attachEvidence(db, user, id, {
        evidenceKind: s("evidenceKind"),
        evidenceNo: s("evidenceNo"),
        evidenceOn: s("evidenceOn"),
        files: await uploads(form),
      });
      msg = "증빙을 저장했습니다";
    } else if (intent === "pay") {
      await payExpense(db, user, id, { paidOn: s("paidOn"), note: s("note") });
      msg = "지급을 적었습니다";
    } else if (intent === "cancel") {
      await cancelExpense(db, user, id, s("reason"));
      msg = "결의를 취소했습니다";
    }
  } catch (e) {
    redirect(errorUrl(back, userMessage(e)));
  }
  redirect(noticeUrl(back, msg));
}

export async function closeDayAction(form: FormData) {
  const user = await requireUser();
  const s = str(form);
  const day = s("day");
  try {
    await closeDay(await getDb(), user, day, {
      cardTerminalWon: num(s("cardTerminalWon")),
      cashCountedWon: num(s("cashCountedWon")),
      note: s("note"),
    });
  } catch (e) {
    redirect(errorUrl(`/money/close?day=${day}`, userMessage(e)));
  }
  redirect(noticeUrl(`/money/close?day=${day}`, `${day} 일일 마감을 했습니다`));
}

export async function monthAction(form: FormData) {
  const user = await requireUser();
  const s = str(form);
  const ym = s("ym");
  const back = `/money/close/${ym}`;
  let msg = "";
  try {
    const db = await getDb();
    const intent = s("intent");
    if (intent === "prepare") {
      await prepareMonth(db, user, ym, s("note"));
      msg = "월 마감을 대표에게 올렸습니다";
    } else {
      await decideMonth(db, user, ym, intent === "approve", s("returnNote"));
      msg =
        intent === "approve"
          ? "월 마감을 승인했습니다. 이 달 날짜로는 더 적지 않습니다"
          : "돌려보냈습니다";
    }
  } catch (e) {
    redirect(errorUrl(back, userMessage(e)));
  }
  redirect(noticeUrl(back, msg));
}
