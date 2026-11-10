"use server";
// 협력업체 등록·평가(STD-07 4절, F-07-01) 화면의 서버 동작
import { redirect } from "next/navigation";
import { getDb } from "@/db/runtime";
import { EVAL_ITEMS } from "@/modules/purchase/rules";
import { addSupplierDocFiles, confirmAnnual, createSupplier, removeSupplierDocFile, type DocUpload, decideSupplier, evaluateAnnual, evaluateInitial, setSupplierBank, stopSupplier, updateSupplier, verifySupplierBank, type SupplierInput } from "@/modules/purchase/supplier";
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

/** 서류마다 붙인 파일(file_<서류>) */
async function docUploads(form: FormData): Promise<DocUpload[]> {
  const out: DocUpload[] = [];
  for (const [k, v] of form.entries()) {
    if (!k.startsWith("file_") || !(v instanceof File) || !v.size) continue;
    out.push({ doc: k.slice(5), name: v.name, bytes: new Uint8Array(await v.arrayBuffer()) });
  }
  return out;
}

const scores = (form: FormData) => Object.fromEntries(EVAL_ITEMS.map((i) => [i.key, Number(String(form.get(`score_${i.key}`) ?? "").replace(/[^\d]/g, "") || NaN)]));

export async function createSupplierAction(form: FormData) {
  const user = await requireUser();
  let id = "";
  let fileError = "";
  try {
    const f = str(form);
    const db = await getDb();
    const files = await docUploads(form);
    id = await createSupplier(db, user, input(form), new Date(), { bankName: f("bankName"), accountNo: f("accountNo"), holder: f("holder") });
    // 업체는 등록됐으니 파일이 안 올라가도 업체 화면으로 가서 알린다
    fileError = await addSupplierDocFiles(db, user, id, files).then(
      () => "",
      (e) => userMessage(e),
    );
  } catch (e) {
    redirect(errorUrl("/suppliers/new", userMessage(e)));
  }
  if (fileError) redirect(errorUrl(`/suppliers/${id}`, `업체는 등록했지만 서류 파일을 올리지 못했습니다: ${fileError}. 업체 정보 › 정보·서류 고치기에서 다시 올려 주세요`));
  redirect(noticeUrl(`/suppliers/${id}`, form.get("accountNo") ? "후보로 등록했습니다. 입금 계좌는 회계 담당·대표가 업체에 전화로 확인하면 지급에 씁니다. 서류를 확인하고 등록 평가를 하세요" : "후보로 등록했습니다. 서류를 확인하고 등록 평가를 하세요"));
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
    if (intent === "update") {
      await updateSupplier(db, user, id, input(form));
      const n = await addSupplierDocFiles(db, user, id, await docUploads(form));
      if (n) msg = `저장했습니다. 서류 파일 ${n}개를 올렸습니다`;
    } else if (intent === "docRemove") {
      await removeSupplierDocFile(db, user, id, s("path"));
      msg = "파일을 지웠습니다";
    }
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
