"use server";
// 리스크·기회 대장(F-Q-03, Q.4) 화면의 서버 동작
import { redirect } from "next/navigation";
import { getDb } from "@/db/runtime";
import {
  closeRisk,
  createRisk,
  finishRisk,
  importInitialRisks,
  planRisk,
  reopenRisk,
  reviewRisks,
  updateRisk,
  type RiskInput,
} from "@/modules/quality/risk";
import { UserError } from "@/modules/platform/errors";
import { errorUrl, noticeUrl, requireUser, userMessage } from "../_lib/session";

const str = (form: FormData) => (k: string) => String(form.get(k) ?? "").trim();
function input(form: FormData): RiskInput {
  const s = str(form);
  return {
    kind: s("kind"),
    content: s("content"),
    chapter: s("chapter"),
    likelihood: Number(s("likelihood")),
    impact: Number(s("impact")),
    control: s("control"),
  };
}

export async function createRiskAction(form: FormData) {
  const user = await requireUser();
  let r = { id: "", docNo: "" };
  try {
    r = await createRisk(await getDb(), user, input(form));
  } catch (e) {
    redirect(errorUrl("/risks/new", userMessage(e)));
  }
  redirect(noticeUrl(`/risks/${r.id}`, `${r.docNo}로 올렸습니다`));
}

export async function riskListAction(form: FormData) {
  const user = await requireUser();
  const s = str(form);
  let msg = "";
  try {
    const db = await getDb();
    if (s("intent") === "import") {
      const n = await importInitialRisks(db, user);
      msg = n
        ? `초기 항목 ${n}건을 넣었습니다. 점수는 초안이니 하나씩 열어 맞게 고치세요`
        : "이미 모두 들어 있습니다";
    } else if (s("intent") === "review") {
      const r = await reviewRisks(db, user, s("reviewNote"));
      msg = `${r.quarter} 검토를 기록했습니다: ${r.summary}`;
    } else throw new UserError("알 수 없는 요청");
  } catch (e) {
    redirect(errorUrl("/risks", userMessage(e)));
  }
  redirect(noticeUrl("/risks", msg));
}

export async function riskAction(form: FormData) {
  const user = await requireUser();
  const s = str(form);
  const id = s("id");
  const back = `/risks/${id}`;
  let msg = "저장했습니다";
  try {
    const db = await getDb();
    const intent = s("intent");
    if (intent === "update") await updateRisk(db, user, id, input(form));
    else if (intent === "plan") {
      await planRisk(db, user, id, {
        plan: s("plan"),
        ownerId: s("ownerId"),
        due: s("due"),
      });
      msg = "대응 계획을 정했습니다. 담당에게 알림이 갑니다";
    } else if (intent === "finish") {
      const score = await finishRisk(db, user, id, {
        result: s("result"),
        likelihood: Number(s("likelihood")),
        impact: Number(s("impact")),
      });
      msg = `대응 끝을 기록했습니다. 잔여 점수 ${score}점`;
    } else if (intent === "close") {
      await closeRisk(db, user, id, s("reason"));
      msg = "종료했습니다";
    } else if (intent === "reopen") {
      await reopenRisk(db, user, id, s("reason"));
      msg = "다시 열었습니다";
    } else throw new UserError("알 수 없는 요청");
  } catch (e) {
    redirect(errorUrl(back, userMessage(e)));
  }
  redirect(noticeUrl(back, msg));
}
