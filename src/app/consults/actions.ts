"use server";
import { redirect } from "next/navigation";
import { getDb } from "@/db/runtime";
import { createConsultation, markReplied, sendReservationConfirm, updateConsultation, type ConsentInput } from "@/modules/customer/service";
import { MessagingError } from "@/modules/messaging/service";
import { errorUrl, noticeUrl, requireUser, userMessage } from "../_lib/session";

const STAFF = ["owner", "plant_manager", "advisor"] as const;

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
  if (!form.has("consentMethod")) return undefined;
  const c = form.getAll("consent").map(String);
  return { required: c.includes("required"), photo: c.includes("photo"), marketing: c.includes("marketing"), method: (String(form.get("consentMethod")) || "phone") as ConsentInput["method"] };
}

export async function createConsultAction(form: FormData) {
  const user = await requireUser([...STAFF]);
  const str = (k: string) => String(form.get(k) ?? "").trim();
  const back = String(form.get("back") || "/consults/new");
  let id: string;
  try {
    const vehicleId = str("vehicleId");
    const year = str("year").replace(/[^\d]/g, "");
    const row = await createConsultation(await getDb(), user.id, {
      customerId: str("customerId") || undefined,
      newCustomer: str("customerId") ? undefined : { name: str("newName"), phone: str("newPhone") },
      consent: await readConsent(form),
      vehicleId: vehicleId && vehicleId !== "new" ? vehicleId : undefined,
      newVehicle: !vehicleId || vehicleId === "new" ? { plateNo: str("plateNo"), model: str("model"), year: year ? Number(year) : null, colorCode: str("colorCode") } : undefined,
      channel: (str("channel") || "phone") as "phone",
      fromId: str("fromId") || undefined,
      ...readConsultForm(form),
    });
    id = row.id;
  } catch (e) {
    redirect(errorUrl(back, userMessage(e)));
  }
  redirect(noticeUrl(`/consults/${id}`, "상담 일지를 저장했습니다"));
}

export async function updateConsultAction(form: FormData) {
  const user = await requireUser([...STAFF]);
  const id = String(form.get("id"));
  const vehicleId = String(form.get("vehicleId") ?? "");
  try {
    await updateConsultation(await getDb(), user.id, id, { ...readConsultForm(form), vehicleId: vehicleId || undefined });
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

export async function repliedAction(form: FormData) {
  const user = await requireUser([...STAFF]);
  const id = String(form.get("id"));
  await markReplied(await getDb(), user.id, id);
  redirect(noticeUrl(`/consults/${id}`, "회신한 것으로 표시했습니다"));
}
