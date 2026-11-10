"use server";
// 교육 기록(F-11-03) 화면의 서버 동작
import { redirect } from "next/navigation";
import { getDb } from "@/db/runtime";
import {
  cancelTraining,
  checkEffect,
  createTraining,
  importYearPlan,
  recordHeld,
  signTraining,
  updateTraining,
  type TrainingInput,
} from "@/modules/staff/training";
import { errorUrl, noticeUrl, requireUser, userMessage } from "../_lib/session";

const str = (form: FormData) => (k: string) => String(form.get(k) ?? "").trim();
const num = (v: string) => (v ? Number(v) : null);
function input(form: FormData): TrainingInput {
  const s = str(form);
  return {
    year: Number(s("year")),
    kind: s("kind"),
    title: s("title"),
    plannedMonth: s("plannedMonth"),
    plannedHours: num(s("plannedHours")),
    target: s("target"),
    organizerId: s("organizerId"),
  };
}

export async function createTrainingAction(form: FormData) {
  const user = await requireUser();
  const s = str(form);
  let id = "";
  try {
    id = await createTraining(await getDb(), user, input(form));
  } catch (e) {
    redirect(errorUrl(`/training/new?kind=${s("kind")}`, userMessage(e)));
  }
  redirect(
    noticeUrl(
      `/training/${id}`,
      "교육 계획을 올렸습니다. 실시하면 이 화면에서 이수자를 기록하세요",
    ),
  );
}

export async function importPlanAction(form: FormData) {
  const user = await requireUser();
  const year = Number(str(form)("year"));
  let r = { n: 0, from: "default" as "default" | "last" };
  try {
    r = await importYearPlan(await getDb(), user, year);
  } catch (e) {
    redirect(errorUrl(`/training?year=${year}`, userMessage(e)));
  }
  redirect(
    noticeUrl(
      `/training?year=${year}`,
      r.n
        ? `${r.from === "last" ? "작년 계획" : "기본 계획"}에서 ${r.n}건을 넣었습니다. 달·시간·주관자를 확인하세요`
        : "이미 모두 들어 있습니다",
    ),
  );
}

export async function trainingAction(form: FormData) {
  const user = await requireUser();
  const s = str(form);
  const id = s("id");
  const back = `/training/${id}`;
  let msg = "저장했습니다";
  try {
    const db = await getDb();
    const intent = s("intent");
    if (intent === "update") await updateTraining(db, user, id, input(form));
    else if (intent === "held") {
      await recordHeld(db, user, id, {
        heldOn: s("heldOn"),
        hours: Number(s("hours")),
        instructor: s("instructor"),
        content: s("content"),
        attendeeIds: form.getAll("attendeeIds").map(String),
      });
      msg = "실시 기록을 남겼습니다. 이수자에게 서명 요청을 보냈습니다";
    } else if (intent === "sign") {
      await signTraining(db, user, id);
      msg = "이수 서명했습니다";
    } else if (intent === "effect") {
      const r = await checkEffect(db, user, id, {
        method: s("effectMethod"),
        result: s("effectResult"),
        note: s("effectNote"),
      });
      msg = r.retrain
        ? "효과 없음으로 기록하고 재교육 계획을 다음 달에 올렸습니다"
        : "효과 확인을 기록했습니다";
    } else if (intent === "cancel") {
      await cancelTraining(db, user, id, s("cancelReason"));
      msg = "교육 계획을 취소했습니다";
    }
  } catch (e) {
    redirect(errorUrl(back, userMessage(e)));
  }
  redirect(noticeUrl(back, msg));
}
