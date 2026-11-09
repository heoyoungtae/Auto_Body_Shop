"use server";
// 3정5S 화면의 서버 동작(STD-08 11~14절, F-08-05)
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/db/runtime";
import { UserError } from "@/modules/platform/errors";
import { addDailyPhoto, rateMonthly, recordDaily, removeDailyPhoto, setZone, setZonePhoto } from "@/modules/quality/five-s";
import { DAILY_ITEMS, FIVE_S } from "@/modules/quality/rules";
import { errorUrl, noticeUrl, requireUser, userMessage } from "../_lib/session";

const str = (form: FormData) => (k: string) => String(form.get(k) ?? "").trim();

export async function zoneAction(form: FormData) {
  const user = await requireUser();
  const s = str(form);
  try {
    await setZone(await getDb(), user, s("zone"), { ownerId: s("ownerId"), deputyId: s("deputyId") });
  } catch (e) {
    redirect(errorUrl("/five-s", userMessage(e)));
  }
  redirect(noticeUrl("/five-s", `${s("zone")} 구역 담당을 저장했습니다`));
}

export async function dailyAction(form: FormData) {
  const user = await requireUser();
  const s = str(form);
  const zone = s("zone");
  const back = `/five-s/${zone}`;
  try {
    const marks = DAILY_ITEMS.map((_, i) => s(`c${i}`));
    if (marks.some((m) => m !== "o" && m !== "x")) throw new UserError("체크 항목을 모두 ○ 또는 × 로 골라 주세요");
    await recordDaily(await getDb(), user, zone, { date: s("date"), results: marks.map((m) => m === "o"), note: s("note") });
  } catch (e) {
    redirect(errorUrl(back, userMessage(e)));
  }
  redirect(noticeUrl(back, "일일 점검을 저장했습니다. 아래에서 기준 사진과 같은 각도로 사진 1장을 올리세요"));
}

export async function monthlyAction(form: FormData) {
  const user = await requireUser();
  const s = str(form);
  const zone = s("zone");
  const back = `/five-s/${zone}`;
  let msg = "";
  try {
    const r = await rateMonthly(await getDb(), user, { ym: s("ym"), zone, scores: FIVE_S.map((f) => (s(f.key) === "" ? NaN : Number(s(f.key)))), remarks: s("remarks") });
    msg = r.nc ? `${r.total}점 — 기준 미만이라 부적합 ${r.nc.docNo}를 발행했습니다. 구역 담당이 14일 안에 개선합니다` : `${r.total}점으로 평가했습니다`;
  } catch (e) {
    redirect(errorUrl(back, userMessage(e)));
  }
  redirect(noticeUrl(back, msg));
}

type R = { ok: true } | { ok: false; error: string };

export async function uploadDailyPhotoAction(form: FormData): Promise<R> {
  const user = await requireUser();
  const file = form.get("file");
  try {
    if (!(file instanceof Blob)) throw new UserError("사진을 고르지 않았습니다");
    const bytes = new Uint8Array(await file.arrayBuffer());
    const db = await getDb();
    if (form.get("ref")) await setZonePhoto(db, user, String(form.get("zone")), bytes);
    else await addDailyPhoto(db, user, String(form.get("id") ?? ""), bytes);
  } catch (e) {
    return { ok: false, error: userMessage(e) };
  }
  revalidatePath(`/five-s/${String(form.get("zone") ?? "")}`);
  return { ok: true };
}

export async function removeDailyPhotoAction(form: FormData): Promise<R> {
  const user = await requireUser();
  try {
    const db = await getDb();
    if (form.get("ref")) await setZonePhoto(db, user, String(form.get("zone")), null);
    else await removeDailyPhoto(db, user, String(form.get("id") ?? ""), String(form.get("path") ?? ""));
  } catch (e) {
    return { ok: false, error: userMessage(e) };
  }
  revalidatePath(`/five-s/${String(form.get("zone") ?? "")}`);
  return { ok: true };
}
