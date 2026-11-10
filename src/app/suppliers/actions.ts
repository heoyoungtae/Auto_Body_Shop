"use server";
// 협력업체 등록·평가(STD-07 4절, F-07-01) 화면의 서버 동작
import { redirect } from "next/navigation";
import { getDb } from "@/db/runtime";
import { EVAL_ITEMS } from "@/modules/purchase/rules";
import { confirmAnnual, createSupplier, decideSupplier, evaluateAnnual, evaluateInitial, setSupplierBank, stopSupplier, updateSupplier, verifySupplierBank, type SupplierInput } from "@/modules/purchase/supplier";
import { UserError } from "@/modules/platform/errors";
import { errorUrl, noticeUrl, requireUser, userMessage } from "../_lib/session";

const str = (form: FormData) => (k: string) => String(form.get(k) ?? "").trim();

function input(form: FormData): SupplierInput {
  const s = str(form);
  const lead = s("leadDays").replace(/[^\d]/g, "");
  return {
    name: s("name"),
    bizNo: s("bizNo"),
    kinds: form.getAll("kinds").map(String),
    items: s("items"),
    contactName: s("contactName"),
    phone: s("phone"),
    email: s("email"),
    leadDays: lead ? Number(lead) : null,
    returnTerms: s("returnTerms"),
    docs: form.getAll("docs").map(String),
    note: s("note"),
  };
}

const scores = (form: FormData) => Object.fromEntries(EVAL_ITEMS.map((i) => [i.key, Number(String(form.get(`score_${i.key}`) ?? "").replace(/[^\d]/g, "") || NaN)]));

export async function createSupplierAction(form: FormData) {
  const user = await requireUser();
  let id = "";
  try {
    id = await createSupplier(await getDb(), user, input(form));
  } catch (e) {
    redirect(errorUrl("/suppliers/new", userMessage(e)));
  }
  redirect(noticeUrl(`/suppliers/${id}`, "후보로 등록했습니다. 서류를 확인하고 등록 평가를 하세요"));
}

export async function supplierAction(form: FormData) {
  const user = await requireUser();
  const s = str(form);
  const id = s("id");
  const back = `/suppliers/${id}`;
  const anchor = ["bank", "bankVerify"].includes(s("intent")) ? "#bank" : "";
  let msg = "저장했습니다";
  try {
    const db = await getDb();
    const intent = s("intent");
    if (intent === "update") await updateSupplier(db, user, id, input(form));
    else if (intent === "evaluate") {
      const r = await evaluateInitial(db, user, id, { scores: scores(form), note: s("evalNote") });
      msg = r.pass ? `${r.total}점: 대표에게 등록 승인을 요청했습니다` : `${r.total}점: 등록 기준(70점)에 못 미쳐 후보로 남습니다`;
    } else if (intent === "decide") {
      const ok = s("ok") === "1";
      await decideSupplier(db, user, id, ok, s("reason"));
      msg = ok ? "등록했습니다. 이제 발주·외주에 쓸 수 있습니다" : "등록하지 않기로 했습니다";
    } else if (intent === "annual") {
      const total = await evaluateAnnual(db, user, id, { year: Number(s("year")), scores: scores(form), note: s("evalNote") });
      msg = `정기 평가 ${total}점을 저장했습니다. 대표가 확정합니다`;
    } else if (intent === "confirm") {
      const outcome = await confirmAnnual(db, user, s("evalId"));
      msg = outcome === "ok" ? "확정했습니다(유지)" : outcome === "improve" ? "확정했습니다(개선 요청). 공장장이 업체에 알립니다" : "확정했습니다(2년 연속 기준 미만 — 거래 중지)";
    } else if (intent === "stop") {
      const stop = s("stop") === "1";
      await stopSupplier(db, user, id, stop, s("stopReason"));
      msg = stop ? "거래를 중지했습니다" : "거래를 다시 엽니다";
    } else if (intent === "bank") {
      const remove = s("remove") === "1";
      const r = await setSupplierBank(db, user, id, { bankName: s("bankName"), accountNo: s("accountNo"), holder: s("holder"), remove });
      msg = remove
        ? "입금 계좌를 지웠습니다. 대표에게 알렸습니다"
        : !r.changed
          ? "바뀐 것이 없습니다"
          : `입금 계좌를 저장했습니다. 다른 사람(대표)이 업체에 전화로 확인하면 지급에 씁니다${r.mismatch ? " — 예금주가 업체 이름과 다릅니다. 통장 사본을 다시 보세요" : ""}`;
    } else if (intent === "bankVerify") {
      await verifySupplierBank(db, user, id, s("verifyNote"));
      msg = "계좌를 확인했습니다. 이제 지급 화면에 '확인됨'으로 나옵니다";
    } else throw new UserError("알 수 없는 요청");
  } catch (e) {
    redirect(errorUrl(back, userMessage(e)));
  }
  redirect(noticeUrl(back, msg) + anchor);
}
