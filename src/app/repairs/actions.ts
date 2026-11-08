"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/db/runtime";
import { addPhoto, confirmDiagnosis, removeDamage, removePhoto, reopenDiagnosis, reopenIntake, saveDamage, saveIntake, signIntake, startRepair, type DamageInput, type IntakeInput } from "@/modules/repair/service";
import { parseFilm } from "@/modules/repair/rules";
import { createEstimate, issueEstimate, removeLine, reviewEstimate, saveEstimateHeader, saveLine, submitEstimate } from "@/modules/repair/estimate";
import { ROLE_LABEL } from "@/modules/auth/roles";
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

// ── 손상 진단
function readDamage(form: FormData): DamageInput {
  const str = (k: string) => String(form.get(k) ?? "").trim();
  const num = (k: string) => {
    const v = str(k).replace(/[^\d]/g, "");
    return v ? Number(v) : null;
  };
  const flags = form.getAll("flags").map(String);
  const cal = str("calibrate");
  return {
    id: str("damageId") || undefined,
    part: str("part"),
    kind: str("kind"),
    sizeCm: num("sizeCm"),
    depthMm: num("depthMm"),
    paintLayer: str("paintLayer") || "none",
    crease: flags.includes("crease"),
    broken: flags.includes("broken"),
    structural: flags.includes("structural"),
    filmPanel: parseFilm(str("filmPanel")),
    filmAdjacent: parseFilm(str("filmAdjacent")),
    method: str("method") || undefined,
    methodReason: str("methodReason"),
    calibrate: cal === "" ? undefined : cal === "1",
    note: str("note"),
  };
}

export async function damageAction(form: FormData) {
  const user = await requireUser(["technician", "plant_manager", "owner"]);
  const id = String(form.get("id") ?? "");
  const back = `/repairs/${id}`;
  try {
    if (form.get("intent") === "remove") await removeDamage(await getDb(), user, id, String(form.get("damageId") ?? ""));
    else await saveDamage(await getDb(), user, id, readDamage(form));
  } catch (e) {
    redirect(errorUrl(back + "#diagnosis", userMessage(e)));
  }
  redirect(noticeUrl(back, form.get("intent") === "remove" ? "진단 줄을 지웠습니다" : "진단을 저장했습니다") + "#diagnosis");
}

export async function confirmDiagnosisAction(form: FormData) {
  const user = await requireUser(["plant_manager", "owner"]);
  const id = String(form.get("id") ?? "");
  try {
    if (form.get("intent") === "reopen") await reopenDiagnosis(await getDb(), user, id);
    else await confirmDiagnosis(await getDb(), user, id, String(form.get("diagNote") ?? ""));
  } catch (e) {
    redirect(errorUrl(`/repairs/${id}#diagnosis`, userMessage(e)));
  }
  redirect(noticeUrl(`/repairs/${id}`, form.get("intent") === "reopen" ? "진단을 다시 열었습니다" : "진단을 확인했습니다. 상담원에게 견적 작성 알림을 보냈습니다"));
}

// ── 견적(STD-03)
export async function createEstimateAction(form: FormData) {
  const user = await requireUser(["advisor", "plant_manager", "owner"]);
  const roId = String(form.get("id") ?? "");
  let est: { id: string };
  try {
    est = await createEstimate(await getDb(), user, roId);
  } catch (e) {
    redirect(errorUrl(`/repairs/${roId}`, userMessage(e)));
  }
  redirect(noticeUrl(`/repairs/${roId}/estimate/${est.id}`, "진단과 공임 기준표로 견적 항목을 채웠습니다. 부품 단가와 바뀐 것만 고치세요"));
}

export async function estimateAction(form: FormData) {
  const user = await requireUser();
  const s = (k: string) => String(form.get(k) ?? "").trim();
  const n = (k: string) => {
    const v = s(k).replace(/[^\d]/g, "");
    return v ? Number(v) : null;
  };
  const roId = s("roId");
  const id = s("estimateId");
  const back = `/repairs/${roId}/estimate/${id}`;
  const intent = s("intent");
  const db = await getDb();
  let msg = "저장했습니다";
  try {
    if (intent === "header") await saveEstimateHeader(db, user, id, { kind: s("kind"), paintGrade: s("paintGrade"), dueDate: s("dueDate"), note: s("note"), registeredOn: s("registeredOn") });
    else if (intent === "line")
      await saveLine(db, user, id, { id: s("lineId") || undefined, payer: s("payer"), category: s("category"), name: s("name"), partCode: s("partCode"), partNo: s("partNo"), qty: n("qty") ?? 1, unitWon: n("unitWon") ?? 0, laborMinutes: n("laborMinutes"), laborWon: n("laborWon"), note: s("lineNote") });
    else if (intent === "removeLine") {
      await removeLine(db, user, id, s("lineId"));
      msg = "항목을 지웠습니다";
    } else if (intent === "submit") {
      const role = await submitEstimate(db, user, id);
      msg = `검토를 요청했습니다(검토: ${ROLE_LABEL[role]})`;
    } else if (intent === "approve" || intent === "return") {
      await reviewEstimate(db, user, id, intent === "approve", s("reviewNote"));
      msg = intent === "approve" ? "검토를 마쳤습니다. 발급할 수 있습니다" : "작성자에게 되돌렸습니다";
    } else if (intent === "issue") {
      await issueEstimate(db, user, id);
      msg = "법정 견적서를 발급했습니다. '견적서 인쇄'로 2부를 뽑아 1부를 고객에게 드리세요";
    }
  } catch (e) {
    redirect(errorUrl(back, userMessage(e)));
  }
  redirect(noticeUrl(back, msg));
}
