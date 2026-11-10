"use server";
// 급여대장(F-11-05) 화면의 서버 동작
import { redirect } from "next/navigation";
import { getDb } from "@/db/runtime";
import {
  approvePayroll,
  markPayrollPaid,
  preparePayroll,
  recalcPayroll,
  returnPayroll,
  setSlipInputs,
  submitPayroll,
} from "@/modules/staff/payroll";
import type { Extra } from "@/modules/staff/payroll-rules";
import { errorUrl, noticeUrl, requireUser, userMessage } from "../_lib/session";

const str = (form: FormData) => (k: string) => String(form.get(k) ?? "").trim();
const int = (v: string) => (v === "" ? 0 : Number(v.replace(/[,\s원]/g, "")));

export async function preparePayrollAction(form: FormData) {
  const user = await requireUser();
  const ym = str(form)("ym");
  let skipped: string[] = [];
  try {
    skipped = (await preparePayroll(await getDb(), user, ym)).skipped;
  } catch (e) {
    redirect(errorUrl(`/payroll?ym=${ym}`, userMessage(e)));
  }
  redirect(
    noticeUrl(
      `/payroll/${ym}`,
      `${ym} 급여를 계산했습니다.${skipped.length ? ` 서명한 근로계약서가 없어 빠진 사람: ${skipped.join(", ")}` : ""} 사람마다 소득세를 확인하세요`,
    ),
  );
}

export async function payrollAction(form: FormData) {
  const user = await requireUser();
  const s = str(form);
  const id = s("id");
  const ym = s("ym");
  const back = `/payroll/${ym}`;
  let msg = "저장했습니다";
  try {
    const db = await getDb();
    const intent = s("intent");
    if (intent === "recalc") {
      const r = await recalcPayroll(db, user, id);
      msg = `다시 계산했습니다${r.skipped.length ? `(계약서 없음: ${r.skipped.join(", ")})` : ""}`;
    } else if (intent === "slip") {
      const extras: Extra[] = [0, 1, 2].map((i) => ({
        kind: s(`extraKind${i}`) === "deduct" ? "deduct" : "pay",
        name: s(`extraName${i}`),
        amount: int(s(`extraAmount${i}`)),
        reason: s(`extraReason${i}`),
        taxable: s(`extraTaxfree${i}`) !== "1",
      }));
      await setSlipInputs(db, user, s("slipId"), {
        incomeTax: int(s("incomeTax")),
        family: int(s("family")) || 1,
        extras,
      });
      msg = `${s("who")} 명세서를 고쳤습니다`;
    } else if (intent === "submit") {
      await submitPayroll(db, user, id);
      msg = "대표에게 승인을 요청했습니다";
    } else if (intent === "approve") {
      await approvePayroll(db, user, id);
      msg = "승인했습니다. 회계 담당이 지급일에 지급합니다";
    } else if (intent === "return") {
      await returnPayroll(db, user, id, s("returnReason"));
      msg = "회계 담당에게 돌려보냈습니다";
    } else if (intent === "paid") {
      await markPayrollPaid(db, user, id, s("paidOn"));
      msg = "지급 기록을 남기고 직원들에게 임금명세서를 보냈습니다";
    }
  } catch (e) {
    redirect(errorUrl(back, userMessage(e)));
  }
  redirect(noticeUrl(back, msg));
}
