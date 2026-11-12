"use server";
// 직원 명부·역량 표(STD-11) 화면의 서버 동작
import { redirect } from "next/navigation";
import { getDb } from "@/db/runtime";
import { assessCompetency, confirmAssessment, registerStaff, reissueTempPassword, saveProfile, smsTempPassword, type ProfileView } from "@/modules/staff/service";
import { appUrl } from "@/modules/customer/service";
import { addStaffFile, checkStaffFile, removeStaffFile, StaffFileError } from "@/modules/staff/files";
import { can } from "@/modules/auth/permissions";
import { errorUrl, noticeUrl, requireUser, userMessage } from "../_lib/session";

function profileOf(form: FormData): ProfileView {
  const s = (k: string) => String(form.get(k) ?? "").trim();
  return {
    job: s("job"),
    gender: s("gender"),
    birth: s("birth"),
    phone: s("phone"),
    emName: s("emName"),
    emRelation: s("emRelation"),
    emPhone: s("emPhone"),
    zip: s("zip"),
    address: s("address"),
    addressDetail: s("addressDetail"),
    career: s("career"),
    hiredOn: s("hiredOn"),
    contractKind: s("contractKind"),
    contractEnd: s("contractEnd"),
    licenses: [0, 1, 2].map((i) => ({ name: s(`licName${i}`), no: s(`licNo${i}`), on: s(`licOn${i}`) })),
    leftOn: s("leftOn"),
    leftReason: s("leftReason"),
  };
}

export async function registerStaffAction(form: FormData) {
  const user = await requireUser();
  const s = (k: string) => String(form.get(k) ?? "").trim();
  let r: { id: string; pendingRoles: boolean };
  try {
    r = await registerStaff(await getDb(), user, { name: s("name"), loginId: s("loginId"), roles: form.getAll("roles").map(String), profile: profileOf(form) });
  } catch (e) {
    redirect(errorUrl("/staff/new", userMessage(e)));
  }
  redirect(noticeUrl(`/staff/${r.id}`, r.pendingRoles ? "등록했습니다. 대표가 역할을 정하면 로그인할 수 있습니다(대표에게 알림을 보냈습니다)" : "등록했습니다. 아래 임시 비밀번호를 직원에게 알려 주거나 문자로 보내세요. 다음은 역량 표에서 직무별 단계를 매깁니다"));
}

export async function saveProfileAction(form: FormData) {
  const user = await requireUser();
  const s = (k: string) => String(form.get(k) ?? "").trim();
  const id = s("userId");
  const back = `/staff/${id}`;
  try {
    await saveProfile(await getDb(), user, id, profileOf(form));
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

/** 임시 비밀번호: 다시 발급(대표)·문자로 보내기(대표·회계). 직원 화면과 로그인 계정 화면이 같이 쓴다 */
export async function tempPasswordAction(form: FormData) {
  const user = await requireUser();
  const s = (k: string) => String(form.get(k) ?? "").trim();
  const id = s("userId");
  const back = s("back").startsWith("/") ? s("back") : `/staff/${id}`;
  let msg = "";
  try {
    const db = await getDb();
    if (s("op") === "reissue") {
      await reissueTempPassword(db, user, id);
      msg = "임시 비밀번호를 새로 발급했습니다. 로그인된 기기는 모두 끊었습니다. 직원에게 알려 주거나 문자로 보내세요";
    } else {
      const r = await smsTempPassword(db, user, id, appUrl());
      msg = r.demo ? "문자 발송 서비스가 시험 모드라 실제로는 보내지 않았습니다(설정 › 문자 발송 서비스)" : "임시 비밀번호를 문자로 보냈습니다";
    }
  } catch (e) {
    redirect(errorUrl(back, userMessage(e)));
  }
  redirect(noticeUrl(back, msg));
}

/** 직원 서류함: 올리기·확인·지우기 */
export async function staffFileAction(form: FormData) {
  const user = await requireUser();
  const s = (k: string) => String(form.get(k) ?? "").trim();
  const id = s("userId");
  const back = `/staff/${id}`;
  let msg = "";
  try {
    const db = await getDb();
    const op = s("op");
    if (op === "add") {
      const files = form.getAll("staffFiles").filter((f): f is File => f instanceof File && f.size > 0);
      if (!files.length) throw new StaffFileError("파일을 골라 주세요");
      for (const f of files) await addStaffFile(db, user, id, { kind: s("kind"), title: files.length > 1 ? "" : s("title"), licenseName: s("licenseName"), fileName: f.name, bytes: new Uint8Array(await f.arrayBuffer()) });
      msg = user.id === id && !can(user, "staff.roster") ? `${files.length}개를 올렸습니다. 대표·회계 담당이 확인합니다` : `${files.length}개를 올렸습니다`;
    } else if (op === "check") {
      await checkStaffFile(db, user, s("fileId"));
      msg = "확인했습니다";
    } else if (op === "remove") {
      await removeStaffFile(db, user, s("fileId"), s("reason"));
      msg = "지웠습니다(파일은 지우고 지운 기록만 남김)";
    }
  } catch (e) {
    redirect(errorUrl(`${back}#files`, userMessage(e)));
  }
  redirect(noticeUrl(back, msg) + "#files");
}
