"use server";
// 업무일지: 내가 적는 칸 저장·마감·덧붙이기, 확인·보완 요청
import { redirect } from "next/navigation";
import { getDb } from "@/db/runtime";
import { addAddendum, closeEntry, reviewEntry, saveEntry, type EntryInput } from "@/modules/journal/entry";
import { UserError } from "@/modules/platform/errors";
import { seoulDate } from "@/modules/platform/time";
import { punchOut, todayRow } from "@/modules/staff/punch";
import { errorUrl, noticeUrl, requestMeta, requireUser, userMessage } from "../_lib/session";

const str = (form: FormData) => (k: string) => String(form.get(k) ?? "").trim();

function input(form: FormData): EntryInput {
  const s = str(form);
  const all = (k: string) => form.getAll(k).map((v) => String(v));
  const from = all("offFrom");
  const to = all("offTo");
  const kind = all("offKind");
  const detail = all("offDetail");
  return {
    notes: s("notes"),
    tomorrow: s("tomorrow"),
    offApp: kind.map((k, i) => ({ from: from[i] ?? "", to: to[i] ?? "", kind: k, detail: detail[i] ?? "" })),
    suggestionText: s("suggestionText"),
    safety: s("safety"),
    safetyNote: s("safetyNote"),
  };
}

export async function entryAction(form: FormData) {
  const user = await requireUser();
  const s = str(form);
  const day = s("day");
  const back = `/journal?d=${day}`;
  let msg = "저장했습니다";
  let goto = back;
  try {
    const db = await getDb();
    const intent = s("intent");
    if (intent === "save") await saveEntry(db, user, day, input(form));
    else if (intent === "close") {
      const r = await closeEntry(db, user, day, input(form));
      msg = r.status === "closed" ? "마감했습니다. 확인할 사람의 내 할 일에 올라갑니다" : "마감했습니다";
      if (r.safetyOk === false) msg += ". 안전 담당에게 알렸습니다. 사고·아차사고 보고서도 써 주세요";
      // 오늘 일지를 마감하면 퇴근도 같이 찍는다(출근 기록이 있고 아직 퇴근 전일 때)
      if (day === seoulDate()) {
        const row = await todayRow(db, user.id, day);
        if (row && !row.outAt) {
          try {
            const st = await punchOut(db, user, (await requestMeta()).ip ?? null);
            msg += `. ${st.outText} 퇴근을 기록했습니다`;
            if (st.overstay) {
              msg += ". 승인 없이 늦게 남았습니다. 사후 연장 신청을 올려 주세요(안 올리면 수당에 들어가지 않습니다)";
              goto = "/attendance";
            }
          } catch (e) {
            if (!(e instanceof UserError)) throw e;
            msg += `. 퇴근은 기록하지 못했습니다: ${e.message}`;
          }
        }
      }
    } else if (intent === "addendum") {
      await addAddendum(db, user, day, s("addendum"));
      msg = "덧붙였습니다";
    } else throw new UserError("알 수 없는 요청");
  } catch (e) {
    redirect(errorUrl(back, userMessage(e)));
  }
  redirect(noticeUrl(goto, msg));
}

export async function reviewAction(form: FormData) {
  const user = await requireUser();
  const s = str(form);
  const back = `/journal?d=${s("day")}&u=${s("user")}`;
  const ok = s("intent") === "confirm";
  try {
    await reviewEntry(await getDb(), user, s("user"), s("day"), ok, s("returnNote"));
  } catch (e) {
    redirect(errorUrl(back, userMessage(e)));
  }
  redirect(noticeUrl(back, ok ? "확인했습니다" : "보완을 요청했습니다. 본인의 내 할 일에 올라갑니다"));
}
