"use server";
// 설비 관리 화면의 서버 동작(STD-08)
import { redirect } from "next/navigation";
import { getDb } from "@/db/runtime";
import { parseItems, type CheckKind } from "@/modules/equipment/rules";
import {
  addLubePoint,
  addPmItem,
  addRunLog,
  approvePlan,
  closeFailure,
  createPlan,
  disposeEquipment,
  recordCalibration,
  recordCheck,
  recordLube,
  recordPmTask,
  removeLubePoint,
  removePmItem,
  reopenPlan,
  reportFailure,
  resumeEquipment,
  saveEquipment,
  updateFailure,
} from "@/modules/equipment/service";
import { errorUrl, noticeUrl, requireUser, userMessage } from "../_lib/session";

const str = (form: FormData) => (k: string) => String(form.get(k) ?? "").trim();
const numOrNull = (v: string) => {
  const d = v.replace(/[^\d]/g, "");
  return d ? Number(d) : null;
};
/** 오류면 back 으로, 아니면 to 로(알림 문구와 함께) */
async function run(back: string, fn: () => Promise<[string, string]>) {
  let to = back;
  let msg = "";
  try {
    [to, msg] = await fn();
  } catch (e) {
    redirect(errorUrl(back, userMessage(e)));
  }
  redirect(noticeUrl(to, msg));
}

export async function saveEquipmentAction(form: FormData) {
  const user = await requireUser();
  const s = str(form);
  const id = s("id") || undefined;
  const cycle = form.getAll("cycle").map(String);
  await run(id ? `/equipment/new?edit=${id}` : `/equipment/new?kind=${s("kind")}`, async () => {
    const r = await saveEquipment(await getDb(), user, {
      name: s("name"),
      kind: s("kind"),
      grade: s("grade"),
      model: s("model"),
      maker: s("maker"),
      makerContact: s("makerContact"),
      boughtOn: s("boughtOn"),
      price: numOrNull(s("price")),
      zone: s("zone"),
      rating: s("rating"),
      ownerId: s("ownerId"),
      operators: form.getAll("operators").map(String),
      legalKind: s("legalKind"),
      legalNextOn: s("legalNextOn"),
      manualRef: s("manualRef"),
      checkDaily: cycle.includes("daily"),
      checkMonthly: cycle.includes("monthly"),
      dailyItems: parseItems(s("dailyItems")),
      monthlyItems: parseItems(s("monthlyItems")),
      processes: form.getAll("processes").map(String),
      measureRange: s("measureRange"),
      tolerance: s("tolerance"),
      calibMonths: numOrNull(s("calibMonths")),
      calibNextOn: s("calibNextOn"),
      trialOn: s("trialOn"),
      note: s("note"),
    }, id);
    return [`/equipment/${r.id}`, `${r.no} 저장했습니다${r.warnings.length ? ` · 주의: ${r.warnings.join(" / ")}` : ""}`];
  });
}

export async function disposeAction(form: FormData) {
  const user = await requireUser();
  const s = str(form);
  await run(`/equipment/${s("id")}`, async () => {
    await disposeEquipment(await getDb(), user, s("id"), s("reason"));
    return [`/equipment/${s("id")}`, "처분으로 바꿨습니다. 윤활 개소도 함께 멈췄습니다"];
  });
}

export async function resumeAction(form: FormData) {
  const user = await requireUser();
  const id = str(form)("id");
  await run(`/equipment/${id}`, async () => {
    await resumeEquipment(await getDb(), user, id);
    return [`/equipment/${id}`, "다시 쓸 수 있게 했습니다"];
  });
}

export async function checkAction(form: FormData) {
  const user = await requireUser();
  const s = str(form);
  const id = s("id");
  const kind = (s("kind") === "monthly" ? "monthly" : "daily") as CheckKind;
  const n = Number(s("n")) || 0;
  await run(`/equipment/${id}/check?kind=${kind}`, async () => {
    const r = await recordCheck(await getDb(), user, id, { kind, date: s("date"), marks: Array.from({ length: n }, (_, i) => s(`m${i}`)), notes: Array.from({ length: n }, (_, i) => s(`n${i}`)), note: s("note") });
    if (r.failureId) return [`/equipment/failures/${r.failureId}`, "× 항목이 있어 설비를 '사용 금지'로 바꾸고 고장 기록을 열었습니다. 공장장에게 알렸습니다. 조치 내용을 적어 주세요"];
    return [`/equipment/${id}`, `점검을 저장했습니다${r.warn.length ? ` · △ 주의: ${r.warn.join(", ")} — 조치 후 사용` : ""}`];
  });
}

export async function runLogAction(form: FormData) {
  const user = await requireUser();
  const s = str(form);
  const id = s("id");
  const data: Record<string, string> = {};
  for (const [k, v] of form.entries()) if (k.startsWith("log_")) data[k.slice(4)] = String(v).trim();
  await run(`/equipment/${id}#run`, async () => {
    const r = await addRunLog(await getDb(), user, id, { date: s("date"), data, abnormal: s("abnormal") });
    if (r.failureId) return [`/equipment/failures/${r.failureId}`, "운전 일지를 저장하고, 이상 운전이라 설비를 '사용 금지'로 바꾸고 고장 기록을 열었습니다"];
    return [`/equipment/${id}#run`, "운전 일지를 저장했습니다"];
  });
}

export async function reportFailureAction(form: FormData) {
  const user = await requireUser();
  const s = str(form);
  const id = s("id");
  await run(`/equipment/${id}#fail`, async () => {
    const fid = await reportFailure(await getDb(), user, id, { symptom: s("symptom") });
    return [`/equipment/failures/${fid}`, "고장 기록을 열고 설비를 '사용 금지'로 바꿨습니다. 공장장에게 알렸습니다"];
  });
}

export async function failureAction(form: FormData) {
  const user = await requireUser();
  const s = str(form);
  const fid = s("fid");
  const back = `/equipment/failures/${fid}`;
  await run(back, async () => {
    const db = await getDb();
    await updateFailure(db, user, fid, {
      action: s("action"),
      external: s("external") === "1",
      downMinutes: numOrNull(s("downMinutes")),
      parts: s("parts"),
      cost: numOrNull(s("cost")),
      cause: s("cause"),
      prevention: form.getAll("prevention").map(String),
      ncRef: s("ncRef"),
    });
    if (s("intent") === "close") {
      const r = await closeFailure(db, user, fid);
      return [back, `확인했습니다.${r.resumed ? " 설비를 다시 쓸 수 있습니다." : ""}${r.repeat ? ` 이번 분기 같은 설비 고장 ${r.inQuarter}회째입니다: 원인 분석 후 정비 주기·항목을 조정하세요(9.6).` : ""}`];
    }
    return [back, "저장했습니다"];
  });
}

export async function addLubePointAction(form: FormData) {
  const user = await requireUser();
  const s = str(form);
  const id = s("id");
  await run(`/equipment/${id}#lube`, async () => {
    const code = await addLubePoint(await getDb(), user, id, { spot: s("spot"), oil: s("oil"), color: s("color"), amount: s("amount"), cycleDays: numOrNull(s("cycleDays")) ?? 0, method: s("method"), ownerId: s("ownerId"), firstDue: s("firstDue") });
    return [`/equipment/${id}#lube`, `윤활 개소 ${code}를 더했습니다`];
  });
}

export async function removeLubePointAction(form: FormData) {
  const user = await requireUser();
  const s = str(form);
  await run(`/equipment/${s("id")}#lube`, async () => {
    await removeLubePoint(await getDb(), user, s("pid"));
    return [`/equipment/${s("id")}#lube`, "윤활 개소를 뺐습니다(기록은 남음)"];
  });
}

export async function lubeAction(form: FormData) {
  const user = await requireUser();
  const s = str(form);
  const back = s("back") || "/equipment/lube";
  await run(back, async () => {
    const r = await recordLube(await getDb(), user, s("pid"), { doneOn: s("doneOn"), used: s("used"), state: s("state"), action: s("action") });
    return [back, `윤활을 기록했습니다. 다음 기한 ${r.nextDueOn}${s("state") !== "normal" ? " · 정상이 아니어서 공장장에게 알렸습니다" : ""}`];
  });
}

export async function calibrationAction(form: FormData) {
  const user = await requireUser();
  const s = str(form);
  const id = s("id");
  await run(`/equipment/${id}#calib`, async () => {
    const r = await recordCalibration(await getDb(), user, id, { calibratedOn: s("calibratedOn"), agency: s("agency"), pass: s("pass") === "1", certNo: s("certNo") });
    return [`/equipment/${id}#calib`, s("pass") === "1" ? `교정 합격을 기록했습니다. 다음 교정일 ${r.nextOn}` : "교정 불합격: 설비를 '사용 금지'로 바꾸고 품질 담당·공장장에게 알렸습니다. 지난 교정 뒤 이 장비로 측정한 차를 다시 확인하세요"];
  });
}

export async function pmAction(form: FormData) {
  const user = await requireUser();
  const s = str(form);
  const year = s("year");
  const back = `/equipment/pm?year=${year}`;
  const intent = s("intent");
  await run(back, async () => {
    const db = await getDb();
    if (intent === "create") {
      const r = await createPlan(db, user, Number(year));
      return [back, `${year}년 계획을 만들었습니다${r.copied ? `. 지난해 항목 ${r.copied}개를 불러왔습니다` : ""}`];
    }
    if (intent === "item") {
      await addPmItem(db, user, s("planId"), { equipmentId: s("equipmentId"), task: s("task"), cycleMonths: numOrNull(s("cycleMonths")) ?? 0, months: form.getAll("months").map(Number), day: numOrNull(s("day")) ?? 10, external: s("external") === "1", cost: numOrNull(s("cost")) });
      return [back, "정비 항목을 더했습니다"];
    }
    if (intent === "removeItem") {
      await removePmItem(db, user, s("itemId"));
      return [back, "정비 항목을 뺐습니다"];
    }
    if (intent === "approve") {
      const n = await approvePlan(db, user, s("planId"));
      return [back, `승인했습니다. 정비 일정 ${n}건을 만들었습니다`];
    }
    if (intent === "reopen") {
      await reopenPlan(db, user, s("planId"));
      return [back, "계획을 다시 열었습니다. 고친 뒤 다시 승인하세요"];
    }
    if (intent === "done") {
      await recordPmTask(db, user, s("taskId"), { doneOn: s("doneOn"), work: s("work"), parts: s("parts"), minutes: numOrNull(s("minutes")), cost: numOrNull(s("cost")), vendor: s("vendor") });
      return [back, "정비 실적을 적었습니다"];
    }
    throw new Error("알 수 없는 요청");
  });
}
