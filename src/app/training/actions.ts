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

// ── 앱 개별 학습·사내 교재(대표 결정 2026-11-12) ──

const fileOf = async (form: FormData, k: string) => {
  const f = form.get(k);
  return f instanceof File && f.size > 0 ? { name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) } : null;
};

/** 교육 화면의 앱 학습 카드: 설정·자료·문제·대상 배정 */
export async function learnAdminAction(form: FormData) {
  const user = await requireUser();
  const s = str(form);
  const id = s("id");
  const back = `/training/${id}#learn`;
  let msg = "저장했습니다";
  try {
    const db = await getDb();
    const L = await import("@/modules/staff/elearning");
    switch (s("intent")) {
      case "settings":
        await L.saveLearnSettings(db, user, id, { mode: s("mode"), passScore: num(s("passScore")), allowCert: s("allowCert") === "1" });
        msg = "진행 방식을 저장했습니다";
        break;
      case "material":
        await L.addMaterial(db, user, id, { kind: s("matKind"), title: s("matTitle"), url: s("matUrl"), manualId: s("manualId"), docId: s("docId"), minutes: num(s("minutes")), file: await fileOf(form, "matFile") });
        msg = "자료를 넣었습니다";
        break;
      case "unmaterial":
        await L.removeMaterial(db, user, id, s("materialId"));
        msg = "자료를 뺐습니다";
        break;
      case "relink":
        await L.updateMaterialUrl(db, user, id, s("materialId"), s("newUrl"));
        msg = "링크를 바꿨습니다";
        break;
      case "question":
        await L.addQuestion(db, user, id, { question: s("question"), choices: s("choices").split("\n"), answer: Number(s("answer")) - 1 });
        msg = "문제를 넣었습니다";
        break;
      case "unquestion":
        await L.removeQuestion(db, user, id, s("questionId"));
        msg = "문제를 뺐습니다";
        break;
      case "assign": {
        const r = await L.assignLearners(db, user, id, { userIds: form.getAll("learnerIds").map(String), dueOn: s("dueOn") });
        msg = `대상을 배정했습니다(새로 ${r.added}명, 기본 시한 ${r.due}). 각자 내 할 일에 뜨고 알림이 갔습니다`;
        break;
      }
    }
  } catch (e) {
    redirect(errorUrl(back, userMessage(e)));
  }
  redirect(noticeUrl(back, msg));
}

/** 학습 화면(본인): 자료 다 봄·확인 문제·수료증 */
export async function learnAction(form: FormData) {
  const user = await requireUser();
  const s = str(form);
  const id = s("id");
  const back = `/training/learn/${id}`;
  let msg = "";
  try {
    const db = await getDb();
    const L = await import("@/modules/staff/elearning");
    switch (s("intent")) {
      case "viewed":
        await L.markViewed(db, user, id, s("materialId"), Number(s("spent")) || 0);
        msg = "다 본 것으로 기록했습니다";
        break;
      case "quiz": {
        const n = Number(s("count")) || 0;
        const answers = Array.from({ length: n }, (_, i) => (s(`q${i}`) === "" ? null : Number(s(`q${i}`))));
        const r = await L.submitQuiz(db, user, id, answers);
        msg = r.passed ? `${r.score}점으로 이수했습니다. 교육훈련기록부에 기록되었습니다` : `${r.score}점입니다(합격 ${r.pass}점). 자료를 다시 보고 한 번 더 풀어 주세요`;
        break;
      }
      case "cert": {
        const f = await fileOf(form, "certFile");
        if (!f) throw new Error("수료증 파일을 골라 주세요");
        await L.uploadCert(db, user, id, f);
        msg = "수료증으로 이수했습니다. 공장장에게 알렸습니다";
        break;
      }
    }
  } catch (e) {
    redirect(errorUrl(back, userMessage(e)));
  }
  redirect(noticeUrl(back, msg));
}

export async function manualAction(form: FormData) {
  const user = await requireUser();
  const s = str(form);
  const id = s("id");
  let to = id ? `/training/manuals/${id}` : "/training/manuals/new";
  let msg = "";
  try {
    const db = await getDb();
    const L = await import("@/modules/staff/elearning");
    if (s("intent") === "approve") {
      const rev = await L.approveManual(db, user, id);
      msg = `${rev}판으로 승인했습니다. 이제 교육 자료로 쓸 수 있습니다`;
    } else {
      const files = await Promise.all(form.getAll("manualFiles").filter((f): f is File => f instanceof File && f.size > 0).map(async (f) => ({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) })));
      const r = await L.saveManual(db, user, id || null, { title: s("title"), body: String(form.get("body") ?? ""), videoUrl: s("videoUrl"), docIds: form.getAll("docIds").map(String), changeNote: s("changeNote") }, files);
      to = `/training/manuals/${r.id}`;
      msg = `${r.no} 저장했습니다. 대표에게 승인 요청을 보냈습니다`;
    }
  } catch (e) {
    redirect(errorUrl(to, userMessage(e)));
  }
  redirect(noticeUrl(to, msg));
}
