"use server";
// 사고·아차사고(F-09-03) 화면의 서버 동작
import { redirect } from "next/navigation";
import { getDb } from "@/db/runtime";
import {
  closeIncident,
  investigateIncident,
  reportIncident,
} from "@/modules/safety/incident";
import { UserError } from "@/modules/platform/errors";
import { errorUrl, noticeUrl, requireUser, userMessage } from "../_lib/session";

const str = (form: FormData) => (k: string) => String(form.get(k) ?? "").trim();

export async function reportIncidentAction(form: FormData) {
  const user = await requireUser();
  const s = str(form);
  let r = { id: "", docNo: "", ncId: null as string | null };
  try {
    r = await reportIncident(await getDb(), user, {
      kind: s("kind"),
      occurredAt: `${s("occurredOn")}T${s("occurredTime")}`,
      place: s("place"),
      process: s("process"),
      description: s("description"),
      severity: s("severity") || "none",
      injured: s("injured"),
      injury: s("injury"),
      damage: s("damage"),
      immediate: s("immediate"),
    });
  } catch (e) {
    redirect(
      errorUrl(
        `/incidents/new${s("kind") === "near" ? "?kind=near" : ""}`,
        userMessage(e),
      ),
    );
  }
  redirect(
    noticeUrl(
      `/incidents/${r.id}`,
      `${r.docNo}로 보고했습니다. 안전환경 담당과 대표에게 알림이 갔습니다${r.ncId ? ". 부적합 보고서도 함께 열렸습니다" : ""}`,
    ),
  );
}

export async function incidentAction(form: FormData) {
  const user = await requireUser();
  const s = str(form);
  const id = s("id");
  const back = `/incidents/${id}`;
  let msg = "저장했습니다";
  try {
    const db = await getDb();
    if (s("intent") === "investigate") {
      await investigateIncident(db, user, id, {
        cause: s("cause"),
        prevention: s("prevention"),
        damage: s("damage"),
        immediate: s("immediate"),
      });
      msg = "원인과 재발 방지를 기록했습니다. 안전환경 담당이 종결합니다";
    } else if (s("intent") === "close") {
      await closeIncident(db, user, id, {
        legalNeeded: s("legalNeeded"),
        legalReportedOn: s("legalReportedOn"),
        legalNote: s("legalNote"),
        hazardReview: s("hazardReview"),
      });
      msg = "종결했습니다";
    } else throw new UserError("알 수 없는 요청");
  } catch (e) {
    redirect(errorUrl(back, userMessage(e)));
  }
  redirect(noticeUrl(back, msg));
}
