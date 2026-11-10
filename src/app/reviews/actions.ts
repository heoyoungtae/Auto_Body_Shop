"use server";
// 인사평가(F-11-06) 화면의 서버 동작
import { redirect } from "next/navigation";
import { getDb } from "@/db/runtime";
import {
  ackReview,
  confirmReview,
  refreshEvidence,
  REVIEW_ITEMS,
  returnReview,
  saveReview,
  startReview,
} from "@/modules/staff/review";
import { errorUrl, noticeUrl, requireUser, userMessage } from "../_lib/session";

const str = (form: FormData) => (k: string) => String(form.get(k) ?? "").trim();

export async function startReviewAction(form: FormData) {
  const user = await requireUser();
  const s = str(form);
  const year = Number(s("year"));
  let id = "";
  try {
    id = await startReview(await getDb(), user, s("userId"), year);
  } catch (e) {
    redirect(errorUrl(`/reviews?year=${year}`, userMessage(e)));
  }
  redirect(
    noticeUrl(
      `/reviews/${id}`,
      "앱 기록에서 근거를 모으고 제안 점수를 넣었습니다. 확인하고 고치세요",
    ),
  );
}

export async function reviewAction(form: FormData) {
  const user = await requireUser();
  const s = str(form);
  const id = s("id");
  const back = `/reviews/${id}`;
  let msg = "저장했습니다";
  try {
    const db = await getDb();
    const intent = s("intent");
    if (intent === "save" || intent === "submit") {
      const keys = Object.keys(REVIEW_ITEMS);
      await saveReview(
        db,
        user,
        id,
        {
          scores: Object.fromEntries(
            keys.map((k) => [k, Number(s(`score_${k}`))]),
          ),
          comments: Object.fromEntries(keys.map((k) => [k, s(`comment_${k}`)])),
          strengths: s("strengths"),
          improve: s("improve"),
          trainingNeeds: s("trainingNeeds"),
          wageNote: s("wageNote"),
        },
        intent === "submit",
      );
      if (intent === "submit") msg = "면담 단계로 넘기고 본인에게 알렸습니다";
    } else if (intent === "refresh") {
      await refreshEvidence(db, user, id);
      msg = "근거를 다시 모았습니다";
    } else if (intent === "ack") {
      await ackReview(db, user, id, {
        interviewedOn: s("interviewedOn"),
        comment: s("employeeComment"),
      });
      msg = "면담을 확인했습니다";
    } else if (intent === "confirm") {
      await confirmReview(db, user, id);
      msg = "확정했습니다. 필요 교육은 내년 교육 계획에 올렸습니다";
    } else if (intent === "return") {
      await returnReview(db, user, id);
      msg = "공장장에게 돌려보냈습니다";
    }
  } catch (e) {
    redirect(errorUrl(back, userMessage(e)));
  }
  redirect(noticeUrl(back, msg));
}
