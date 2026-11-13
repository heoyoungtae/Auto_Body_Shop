"use server";
// 연간 예산(보고서 센터 5단계): 한 해 금액 → 12달로 나눠 저장, 한 달 고치기
import { redirect } from "next/navigation";
import { getDb } from "@/db/runtime";
import { BUDGET_KEYS, type BudgetVals, saveAnnualBudget, saveMonthBudget } from "@/modules/acct/budget";
import { errorUrl, noticeUrl, requireUser, userMessage } from "../../_lib/session";

const str = (form: FormData) => (k: string) => String(form.get(k) ?? "").trim();
const num = (v: string) => (v === "" ? 0 : Number(v.replace(/[^\d-]/g, "")));

export async function annualAction(form: FormData) {
  const user = await requireUser();
  const s = str(form);
  const year = Number(s("year"));
  const back = `/money/budget?y=${year}`;
  let msg = "";
  try {
    const annual = Object.fromEntries(BUDGET_KEYS.map((k) => [k, num(s(`a_${k}`))])) as BudgetVals;
    const r = await saveAnnualBudget(await getDb(), user, year, { annual, method: s("method") === "last" ? "last" : "even" });
    msg = `${year}년 예산을 12달로 나눠 저장했습니다${r.skipped.length ? `. 월 마감을 올린 ${r.skipped.join(", ")}은 그대로 두었습니다` : ""}`;
  } catch (e) {
    redirect(errorUrl(back, userMessage(e)));
  }
  redirect(noticeUrl(back, msg));
}

export async function monthAction(form: FormData) {
  const user = await requireUser();
  const s = str(form);
  const ym = s("ym");
  const back = `/money/budget?y=${ym.slice(0, 4)}&m=${ym}`;
  try {
    const v = Object.fromEntries(BUDGET_KEYS.map((k) => [k, num(s(`m_${k}`))])) as BudgetVals;
    await saveMonthBudget(await getDb(), user, ym, v);
  } catch (e) {
    redirect(errorUrl(back, userMessage(e)));
  }
  redirect(noticeUrl(back, `${ym} 예산을 고쳤습니다`));
}
