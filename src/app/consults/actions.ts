"use server";
import { guardEdit } from "@/modules/platform/fresh";
import { rolesFor } from "@/modules/auth/permissions";
import { readVehicle } from "./vehicle-form";
import { redirect } from "next/navigation";
import { getDb } from "@/db/runtime";
import { replyToRequest } from "@/modules/site/service";
import { faqFromConsult } from "@/modules/site/content";
import { createConsultation, markReplied, sendReservationConfirm, updateConsultation, type ConsentInput } from "@/modules/customer/service";
import { MessagingError } from "@/modules/messaging/service";
import { errorUrl, noticeUrl, requireUser, userMessage } from "../_lib/session";

const STAFF = rolesFor("repair.write");

/** 폼 → 서비스 입력(상담 내용 칸) */
function readConsultForm(form: FormData) {
  const str = (k: string) => String(form.get(k) ?? "").trim();
  const num = (k: string) => {
    const v = str(k).replace(/[^\d]/g, "");
    return v ? Number(v) : null;
  };
  const all = (k: string) => form.getAll(k).map(String);
  const flag = (k: string) => all(k).includes("1");
  return {
    damageTypes: all("damageTypes"),
    damageParts: str("damageParts"),
    damageZones: (() => {
      try {
        return JSON.parse(str("damageZones") || "[]") as unknown;
      } catch {
        return [];
      }
    })(),
    cause: str("cause"),
    photoCount: num("photoCount") ?? 0,
    methods: all("methods"),
    structural: flag("structural"),
    insurance: (str("insurance") || "self") as "self" | "own" | "other",
    insurer: str("insurer"),
    claimNo: str("claimNo"),
    wantDate: str("wantDate"),
    partsPref: str("partsPref"),
    rental: flag("rental"),
    needs: str("needs"),
    estMin: num("estMin"),
    estMax: num("estMax"),
    estNoticed: flag("estNoticed"),
    result: (str("result") || "open") as "open" | "reserved" | "recontact" | "declined",
    reservedDate: str("reservedDate"),
    reservedTime: str("reservedTime"),
    overCapacityOk: flag("overCapacityOk"),
    recontactOn: str("recontactOn"),
    closeReason: str("closeReason"),
  };
}

export async function readConsent(form: FormData): Promise<ConsentInput | undefined> {
  if (!form.has("consentMethod") || form.get("consentMethod") === "link") return undefined;
  const c = form.getAll("consent").map(String);
  return { required: c.includes("required"), photo: c.includes("photo"), marketing: c.includes("marketing"), method: (String(form.get("consentMethod")) || "phone") as ConsentInput["method"] };
}

export async function createConsultAction(form: FormData) {
  const user = await requireUser([...STAFF]);
  const str = (k: string) => String(form.get(k) ?? "").trim();
  const back = String(form.get("back") || "/consults/new");
  let id: string;
  let msg = "상담 일지를 저장했습니다";
  try {
    const vehicleId = str("vehicleId");
    const row = await createConsultation(await getDb(), user.id, {
      branchId: user.branchId,
      customerId: str("customerId") || undefined,
      newCustomer: str("customerId") ? undefined : { name: str("newName"), phone: str("newPhone") },
      consent: await readConsent(form),
      requestConsent: str("consentMethod") === "link",
      vehicleId: vehicleId && vehicleId !== "new" ? vehicleId : undefined,
      newVehicle: !vehicleId || vehicleId === "new" ? readVehicle(form) : undefined,
      channel: (str("channel") || "phone") as "phone",
      fromId: str("fromId") || undefined,
      ...readConsultForm(form),
    });
    id = row.id;
    const cs = row.consentSent;
    if (cs) msg += cs.ok ? `. 동의 링크를 ${cs.channel}(으)로 보냈습니다${cs.demo ? "(데모라 발송 이력에만 남음)" : ""}` : `. 동의 링크를 보내지 못했습니다(${cs.error ?? "대행사 오류"}) — 고객 화면에서 다시 보내 주세요`;
  } catch (e) {
    redirect(errorUrl(back, userMessage(e)));
  }
  redirect(noticeUrl(`/consults/${id}`, msg));
}

export async function updateConsultAction(form: FormData) {
  const user = await requireUser([...STAFF]);
  const id = String(form.get("id"));
  const vehicleId = String(form.get("vehicleId") ?? "");
  try {
    await guardEdit(await getDb(), user, form, (db) => updateConsultation(db, user.id, id, { ...readConsultForm(form), vehicleId: vehicleId || undefined }));
  } catch (e) {
    redirect(errorUrl(`/consults/${id}/edit`, userMessage(e)));
  }
  redirect(noticeUrl(`/consults/${id}`, "고쳤습니다"));
}

export async function confirmAction(form: FormData) {
  const user = await requireUser([...STAFF]);
  const id = String(form.get("id"));
  let msg: string;
  try {
    const r = await sendReservationConfirm(await getDb(), user.id, id);
    if (!r.ok) throw new MessagingError(`보내지 못했습니다: ${r.error ?? "대행사 오류"}. 전화로 안내해 주세요`);
    msg = `예약 확인을 ${r.channel}(으)로 보냈습니다${r.demo ? " — 데모라 실제로 가지는 않았고 발송 이력에만 남았습니다" : ""}`;
  } catch (e) {
    redirect(errorUrl(`/consults/${id}`, userMessage(e)));
  }
  redirect(noticeUrl(`/consults/${id}`, msg));
}

/** 홈페이지·내 차 수첩 요청에 비밀 답 쓰기(처음이면 손님에게 알림) */
export async function webReplyAction(form: FormData) {
  const user = await requireUser([...STAFF]);
  const id = String(form.get("id"));
  let msg: string;
  try {
    const r = await replyToRequest(await getDb(), user, id, String(form.get("reply") ?? ""), form.getAll("notify").includes("1"));
    msg = !r.sent ? "답을 고쳤습니다. 손님이 내 차 수첩에서 바로 봅니다" : r.sent.ok ? `답을 저장하고 ${r.sent.channel}(으)로 알렸습니다${r.sent.demo ? " — 데모라 실제로 가지는 않았고 발송 이력에만 남았습니다" : ""}` : `답은 저장했지만 알림을 보내지 못했습니다(${r.sent.error ?? "대행사 오류"}). 전화로 알려 주세요`;
  } catch (e) {
    redirect(errorUrl(`/consults/${id}`, userMessage(e)));
  }
  redirect(noticeUrl(`/consults/${id}`, msg));
}

/** 비밀 답변 → 자주 묻는 질문 초안(공개 안 함). 만든 초안을 고치는 화면으로 간다 */
export async function faqDraftAction(form: FormData) {
  const user = await requireUser([...STAFF]);
  const id = String(form.get("id"));
  let faqId: string;
  try {
    faqId = await faqFromConsult(await getDb(), user, id);
  } catch (e) {
    redirect(errorUrl(`/consults/${id}`, userMessage(e)));
  }
  redirect(noticeUrl(`/homepage/faq?edit=${faqId}`, "초안을 만들었습니다. 고친 뒤 '공개'를 켜고 저장하세요"));
}

export async function repliedAction(form: FormData) {
  const user = await requireUser([...STAFF]);
  const id = String(form.get("id"));
  await markReplied(await getDb(), user.id, id);
  redirect(noticeUrl(`/consults/${id}`, "회신한 것으로 표시했습니다"));
}
