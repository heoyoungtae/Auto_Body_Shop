"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/db/runtime";
import { addPhoto, removePhoto, reopenIntake, saveIntake, signIntake, startRepair, type IntakeInput } from "@/modules/repair/service";
import { errorUrl, noticeUrl, requireUser, userMessage } from "../_lib/session";
import { UserError } from "@/modules/platform/errors";

const STAFF = ["owner", "plant_manager", "advisor"] as const;

function readIntake(form: FormData): IntakeInput {
  const str = (k: string) => String(form.get(k) ?? "").trim();
  const num = (k: string) => {
    const v = str(k).replace(/[^\d]/g, "");
    return v ? Number(v) : null;
  };
  const all = (k: string) => form.getAll(k).map(String);
  let marks: unknown = [];
  try {
    marks = JSON.parse(str("marks") || "[]");
  } catch {
    marks = [];
  }
  return {
    mileage: num("mileage"),
    fuelPct: str("fuelPct") === "" ? null : Number(str("fuelPct")),
    vin: str("vin"),
    colorCode: str("colorCode"),
    bodyNotes: all("bodyNotes"),
    warningLights: str("warningLights"),
    marks,
    valuables: str("valuables"),
    valuablesNone: all("valuablesNone").includes("1"),
    devices: all("devices"),
    keyCount: num("keyCount"),
    keyTag: str("keyTag"),
    coversOn: all("coversOn").includes("1"),
    parkSpot: str("parkSpot"),
    delivered: str("arrival") === "driver",
    driverName: str("driverName"),
    intakeNote: str("intakeNote"),
    agreeChecked: all("agree").includes("checked"),
    agreeMove: all("agree").includes("move"),
    signerName: str("signerName"),
  };
}

/** 상담 → 수리 건 열기(입고 시작) */
export async function startRepairAction(form: FormData) {
  const user = await requireUser([...STAFF]);
  const consultId = String(form.get("consultId") ?? "");
  const back = String(form.get("back") || `/consults/${consultId}`);
  let res: { id: string; created: boolean };
  try {
    res = await startRepair(await getDb(), user.id, consultId);
  } catch (e) {
    redirect(errorUrl(back, userMessage(e)));
  }
  redirect(noticeUrl(`/repairs/${res.id}`, res.created ? "수리 건을 열었습니다. 상담의 고객·차량·보험을 불러왔습니다. 차를 한 바퀴 돌며 점검하세요" : "이미 열린 수리 건입니다"));
}

/** 점검 저장(중간 저장) 또는 서명 받고 마치기 */
export async function intakeAction(form: FormData) {
  const user = await requireUser([...STAFF]);
  const id = String(form.get("id") ?? "");
  const back = `/repairs/${id}`;
  const intent = String(form.get("intent") ?? "save");
  const db = await getDb();
  let msg = "점검 내용을 저장했습니다";
  try {
    const input = readIntake(form);
    if (intent === "sign") {
      const sig = String(form.get("signature") ?? "");
      const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(sig);
      await signIntake(db, user.id, id, { ...input, signaturePng: m ? new Uint8Array(Buffer.from(m[1], "base64")) : null, consentNow: form.getAll("consentNow").includes("1") });
      msg = "서명을 받고 입고 점검을 마쳤습니다. 열쇠에 수리 건 번호 태그를 달아 보관함에 넣으세요";
    } else {
      await saveIntake(db, user.id, id, input);
    }
  } catch (e) {
    redirect(errorUrl(back, userMessage(e)));
  }
  redirect(noticeUrl(back, msg));
}

export async function reopenAction(form: FormData) {
  const user = await requireUser(["owner", "plant_manager", "advisor"]);
  const id = String(form.get("id") ?? "");
  try {
    await reopenIntake(await getDb(), user.id, id, String(form.get("reopenReason") ?? ""));
  } catch (e) {
    redirect(errorUrl(`/repairs/${id}`, userMessage(e)));
  }
  redirect(noticeUrl(`/repairs/${id}`, "다시 점검합니다. 고친 뒤 고객 서명을 다시 받으세요"));
}

/** 사진 올리기(화면에서 줄여 보낸 그림). 화면이 직접 부르고 결과를 받는다 */
export async function uploadPhotoAction(form: FormData): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireUser([...STAFF]);
  const id = String(form.get("id") ?? "");
  const file = form.get("file");
  try {
    if (!(file instanceof Blob)) throw new UserError("사진을 고르지 않았습니다");
    await addPhoto(await getDb(), user.id, id, String(form.get("slot") ?? ""), new Uint8Array(await file.arrayBuffer()), {
      width: Number(form.get("width")) || undefined,
      height: Number(form.get("height")) || undefined,
    });
  } catch (e) {
    return { ok: false, error: userMessage(e) };
  }
  revalidatePath(`/repairs/${id}`);
  return { ok: true };
}

export async function removePhotoAction(form: FormData): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireUser([...STAFF]);
  try {
    await removePhoto(await getDb(), user.id, String(form.get("photoId") ?? ""));
  } catch (e) {
    return { ok: false, error: userMessage(e) };
  }
  revalidatePath(`/repairs/${String(form.get("id") ?? "")}`);
  return { ok: true };
}
