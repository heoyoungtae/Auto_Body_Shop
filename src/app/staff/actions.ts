"use server";
// 직원 명부·역량 표(STD-11) 화면의 서버 동작
import { redirect } from "next/navigation";
import { getDb } from "@/db/runtime";
import { assessCompetency, confirmAssessment, saveProfile } from "@/modules/staff/service";
import { errorUrl, noticeUrl, requireUser, userMessage } from "../_lib/session";

export async function saveProfileAction(form: FormData) {
  const user = await requireUser();
  const s = (k: string) => String(form.get(k) ?? "").trim();
  const id = s("userId");
  const back = `/staff/${id}`;
  try {
    const licenses = [0, 1, 2].map((i) => ({ name: s(`licName${i}`), no: s(`licNo${i}`), on: s(`licOn${i}`) }));
    await saveProfile(await getDb(), user, id, {
      job: s("job"),
      gender: s("gender"),
      birth: s("birth"),
      zip: s("zip"),
      address: s("address"),
      addressDetail: s("addressDetail"),
      career: s("career"),
      hiredOn: s("hiredOn"),
      contractKind: s("contractKind"),
      contractEnd: s("contractEnd"),
      licenses,
      leftOn: s("leftOn"),
      leftReason: s("leftReason"),
    });
  } catch (e) {
    redirect(errorUrl(back, userMessage(e)));
  }
  redirect(noticeUrl(back, "명부를 저장했습니다"));
}

export async function assessAction(form: FormData) {
  const user = await requireUser();
  const s = (k: string) => String(form.get(k) ?? "").trim();
  const back = s("back") || "/staff/competency";
  let msg = "";
  try {
    const r = await assessCompetency(await getDb(), user, { userId: s("userId"), skill: s("skill"), level: Number(s("level")), note: s("note"), assessedOn: s("assessedOn") });
    msg = r.confirmed ? "평가를 저장했습니다. 대표 평가라서 바로 역량 표에 반영했습니다" : "평가를 저장했습니다. 대표가 확인하면 역량 표에 반영됩니다";
  } catch (e) {
    redirect(errorUrl(back, userMessage(e)));
  }
  redirect(noticeUrl(back, msg));
}

export async function confirmAction(form: FormData) {
  const user = await requireUser();
  const ok = form.get("ok") === "1";
  try {
    await confirmAssessment(await getDb(), user, Number(form.get("id")), ok);
  } catch (e) {
    redirect(errorUrl("/staff/competency", userMessage(e)));
  }
  redirect(noticeUrl("/staff/competency", ok ? "확인했습니다. 역량 표에 반영했습니다" : "되돌렸습니다. 평가한 사람에게 알렸습니다"));
}
