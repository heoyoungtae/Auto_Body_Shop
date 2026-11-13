"use server";
// 회계 장부(보고서 센터 4단계): 기초 잔액 저장, 자금 전표 쓰기·취소
import { redirect } from "next/navigation";
import { getDb } from "@/db/runtime";
import { OPENING_CODES } from "@/modules/acct/accounts";
import { cancelFundSlip, createFundSlip, saveOpening } from "@/modules/acct/service";
import { errorUrl, noticeUrl, requireUser, userMessage } from "../../_lib/session";

const str = (form: FormData) => (k: string) => String(form.get(k) ?? "").trim();
const num = (v: string) => (v === "" ? 0 : Number(v.replace(/[^\d-]/g, "")));
const BACK = "/money/books";

export async function openingAction(form: FormData) {
  const user = await requireUser();
  const s = str(form);
  try {
    await saveOpening(await getDb(), user, { on: s("openOn"), lines: OPENING_CODES.map((code) => ({ code, won: num(s(`o_${code}`)) })) });
  } catch (e) {
    redirect(errorUrl(BACK, userMessage(e)));
  }
  redirect(noticeUrl(BACK, "기초 잔액을 저장했습니다. 자본금은 자산 − 부채로 맞췄습니다"));
}

export async function fundAction(form: FormData) {
  const user = await requireUser();
  const s = str(form);
  let msg = "";
  try {
    const db = await getDb();
    if (s("intent") === "cancel") msg = `취소 전표 ${await cancelFundSlip(db, user, s("id"), s("reason"))}를 적었습니다`;
    else {
      const r = await createFundSlip(db, user, { on: s("on"), kind: s("kind"), amountWon: num(s("amountWon")), memo: s("memo"), drCode: s("drCode"), crCode: s("crCode"), bankTxId: s("tx") || null });
      msg = `자금 전표 ${r.docNo}를 적었습니다${s("tx") ? ". 통장 거래와 이었습니다" : ""}`;
    }
  } catch (e) {
    redirect(errorUrl(s("tx") ? `${BACK}?tx=${encodeURIComponent(s("tx"))}` : BACK, userMessage(e)));
  }
  redirect(noticeUrl(BACK, msg));
}
