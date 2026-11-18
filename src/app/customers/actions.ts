"use server";
import { rolesFor } from "@/modules/auth/permissions";
import { readVehicle } from "../consults/vehicle-form";
import { redirect } from "next/navigation";
import { getDb } from "@/db/runtime";
import { createBusinessCustomer, updateBusiness, type BusinessInput } from "@/modules/customer/service";
import { changeConsent, findByPhone, moveVehicle, saveVehicle, sendConsentRequest, updateCustomer, type ConsentInput } from "@/modules/customer/service";
import { CustomerError } from "@/modules/customer/service";
import { errorUrl, noticeUrl, requireUser, userMessage } from "../_lib/session";

const STAFF = rolesFor("repair.write");
const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

export async function updateCustomerAction(form: FormData) {
  const user = await requireUser([...STAFF]);
  const id = str(form, "id");
  try {
    await updateCustomer(await getDb(), user.id, id, { name: str(form, "name"), phone: str(form, "phone"), memo: str(form, "memo") });
  } catch (e) {
    redirect(errorUrl(`/customers/${id}`, userMessage(e)));
  }
  redirect(noticeUrl(`/customers/${id}`, "고객 정보를 고쳤습니다"));
}

export async function consentAction(form: FormData) {
  const user = await requireUser([...STAFF]);
  const id = str(form, "id");
  if (str(form, "consentMethod") === "link") {
    let m: string;
    try {
      const r = await sendConsentRequest(await getDb(), user.id, id, null);
      m = r.ok ? `동의 링크를 ${r.channel}(으)로 보냈습니다${r.demo ? "(데모라 발송 이력에만 남음)" : ""}` : `보내지 못했습니다: ${r.error ?? "대행사 오류"}`;
    } catch (e) {
      redirect(errorUrl(`/customers/${id}`, userMessage(e)));
    }
    redirect(noticeUrl(`/customers/${id}`, m));
  }
  const c = form.getAll("consent").map(String);
  const input: ConsentInput = { required: c.includes("required"), photo: c.includes("photo"), marketing: c.includes("marketing"), method: (str(form, "consentMethod") || "phone") as ConsentInput["method"] };
  try {
    await changeConsent(await getDb(), user.id, id, input);
  } catch (e) {
    redirect(errorUrl(`/customers/${id}`, userMessage(e)));
  }
  redirect(noticeUrl(`/customers/${id}`, input.required ? "동의를 기록했습니다" : "필수 동의가 철회되어 연락처를 지웠습니다"));
}

export async function vehicleAction(form: FormData) {
  const user = await requireUser([...STAFF]);
  const id = str(form, "id");
  try {
    await saveVehicle(await getDb(), user.id, id, { id: str(form, "vehicleId") || undefined, ...readVehicle(form) });
  } catch (e) {
    redirect(errorUrl(`/customers/${id}`, userMessage(e)));
  }
  redirect(noticeUrl(`/customers/${id}`, "차량을 저장했습니다"));
}

/** 차량 주인 바꾸기: 새 주인의 전화번호로 찾는다 */
export async function moveVehicleAction(form: FormData) {
  const user = await requireUser([...STAFF]);
  const id = str(form, "id");
  let to: string;
  try {
    const db = await getDb();
    const target = await findByPhone(db, str(form, "toPhone"));
    if (!target) throw new CustomerError("그 번호의 고객이 없습니다. 새 주인을 먼저 상담으로 등록해 주세요");
    if (target.id === id) throw new CustomerError("지금 주인과 같은 고객입니다");
    await moveVehicle(db, user.id, str(form, "vehicleId"), target.id);
    to = target.id;
  } catch (e) {
    redirect(errorUrl(`/customers/${id}`, userMessage(e)));
  }
  redirect(noticeUrl(`/customers/${to}`, "차량을 이 고객에게 옮겼습니다"));
}

const numOf = (f: FormData, k: string) => {
  const d = str(f, k).replace(/[^\d]/g, "");
  return d ? Number(d) : null;
};
const bizInput = (f: FormData): BusinessInput => ({
  bizNo: str(f, "bizNo"),
  contactName: str(f, "contactName"),
  taxEmail: str(f, "taxEmail"),
  payTerm: str(f, "payTerm"),
  payDay: numOf(f, "payDay"),
  creditLimitWon: numOf(f, "creditLimitWon"),
  invoiceMode: str(f, "invoiceMode") || "monthly",
  portal: str(f, "portal") || "none",
  portalUrl: str(f, "portalUrl"),
  portalNote: str(f, "portalNote"),
});

/** 업체 고객 바로 등록(상담 없이) */
export async function createBusinessAction(form: FormData) {
  const user = await requireUser([...STAFF]);
  let id: string;
  try {
    id = await createBusinessCustomer(await getDb(), user.id, { name: str(form, "name"), phone: str(form, "phone"), memo: str(form, "memo"), ...bizInput(form) });
  } catch (e) {
    redirect(errorUrl("/customers/new", userMessage(e)));
  }
  redirect(noticeUrl(`/customers/${id}`, "업체 고객을 등록했습니다"));
}

/** 고객 구분(개인·업체)과 업체 정보 저장 */
export async function businessAction(form: FormData) {
  const user = await requireUser([...STAFF]);
  const id = str(form, "id");
  const kind = str(form, "kind");
  try {
    await updateBusiness(await getDb(), user.id, id, kind, bizInput(form));
  } catch (e) {
    redirect(errorUrl(`/customers/${id}`, userMessage(e)));
  }
  redirect(noticeUrl(`/customers/${id}`, kind === "business" ? "업체 정보를 저장했습니다" : "개인 고객으로 바꿨습니다"));
}
