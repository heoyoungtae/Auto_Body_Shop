"use server";
import { redirect } from "next/navigation";
import { getDb } from "@/db/runtime";
import { rolesFor } from "@/modules/auth/permissions";
import { confirmTechbayCheck } from "@/modules/partner/techbay-check";
import type { LineDecision } from "@/modules/partner/techbay-items";
import { startRepair } from "@/modules/repair/service";
import { errorUrl, noticeUrl, requireUser, userMessage } from "../../../_lib/session";

const STAFF = rolesFor("repair.write");

/** 테크베이 작업 내용 확인 마치기 → 바로 입고(수리 건 열기) */
export async function techbayCheckAction(form: FormData) {
  const user = await requireUser([...STAFF]);
  const consultId = String(form.get("consultId") ?? "");
  const back = `/consults/${consultId}/techbay-check`;
  const n = Number(form.get("lines") ?? 0);
  const decisions: Record<number, LineDecision> = {};
  const remember: number[] = [];
  for (let no = 1; no <= Math.min(n, 200); no++) {
    decisions[no] = {
      read: String(form.get(`d${no}_read`) ?? "").slice(0, 300),
      skip: form.get(`d${no}_skip`) === "1",
      asPartial: form.get(`d${no}_partial`) === "1",
    };
    if (form.get(`d${no}_remember`) === "1") remember.push(no);
  }
  const db = await getDb();
  let msg = "";
  let roId = "";
  try {
    const r = await confirmTechbayCheck(db, user, consultId, decisions, remember);
    const ro = await startRepair(db, user.id, consultId);
    roId = ro.id;
    msg = `작업 항목 ${r.total}줄을 확인했습니다(손상 부위 ${r.damage} + 기타 요구 ${r.other}). 입고 도면에 수리할 곳을 찍어 두었습니다${r.learned ? `. 고쳐 적은 말 ${r.learned}개는 다음 주문부터 바로 알아듣습니다` : ""}. 차를 한 바퀴 돌며 점검하세요`;
  } catch (e) {
    redirect(errorUrl(back, userMessage(e)));
  }
  redirect(noticeUrl(`/repairs/${roId}`, msg));
}
