"use server";
// 문자관리 설정 화면의 동작. 바꾸기·시험 발송·잔액 조회는 대표만.
import { redirect } from "next/navigation";
import { getDb } from "@/db/runtime";
import { giftBalance, kakaoTest, saveGift, saveKakao, saveSms, smsBalance, smsTest } from "@/modules/messaging/service";
import { KAKAO_KEYS } from "@/modules/messaging/kakao";
import { UserError } from "@/modules/platform/errors";
import { errorUrl, noticeUrl, requireOwner, userMessage } from "../_lib/session";

/** 시험 발송 실패: 대행사가 알려 준 사유를 그대로 보여 준다(설정을 고치는 데 필요) */
const failMsg = (e: unknown) => (e instanceof UserError ? e.message : `시험 발송 실패: ${e instanceof Error ? e.message : String(e)}`);
const s = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const n = (f: FormData, k: string) => Number(s(f, k).replace(/[^\d]/g, "") || 0);
/** f.<공급사>.<칸> 이름에서 고른 공급사 칸만 꺼낸다 */
const fieldsOf = (f: FormData, provider: string) =>
  Object.fromEntries(
    [...f.keys()]
      .filter((k) => k.startsWith(`f.${provider}.`))
      .map((k) => [k.slice(`f.${provider}.`.length), s(f, k)]),
  );

export async function saveSmsAction(form: FormData) {
  const user = await requireOwner();
  const provider = s(form, "provider");
  try {
    await saveSms(await getDb(), user.id, { provider, sender: s(form, "sender"), optout: s(form, "optout"), fields: fieldsOf(form, provider), checklist: form.getAll("check").map(String) });
  } catch (e) {
    redirect(errorUrl("/settings/messaging", userMessage(e)));
  }
  redirect(noticeUrl("/settings/messaging", "저장했습니다. 내 번호로 시험 발송해 확인하세요"));
}

export async function smsTestAction(form: FormData) {
  const user = await requireOwner();
  let msg: string;
  try {
    const r = await smsTest(await getDb(), user.id, s(form, "to"));
    if (!r.ok) throw new Error(r.error ?? "발송 실패");
    msg = r.demo ? "데모 모드라 실제로 보내지 않고 이력만 남겼습니다" : "시험 문자를 보냈습니다. 휴대폰을 확인하세요";
  } catch (e) {
    redirect(errorUrl("/settings/messaging", failMsg(e)));
  }
  redirect(noticeUrl("/settings/messaging", msg));
}

export async function smsBalanceAction() {
  await requireOwner();
  let msg: string;
  try {
    msg = await smsBalance(await getDb());
  } catch (e) {
    redirect(errorUrl("/settings/messaging", userMessage(e)));
  }
  redirect(noticeUrl("/settings/messaging", msg));
}

export async function saveKakaoAction(form: FormData) {
  const user = await requireOwner();
  try {
    await saveKakao(await getDb(), user.id, {
      enabled: form.getAll("enabled").includes("1"),
      pfId: s(form, "pfId"),
      codes: Object.fromEntries(KAKAO_KEYS.map((k) => [k, s(form, `code.${k}`)])),
    });
  } catch (e) {
    redirect(errorUrl("/settings/kakao", userMessage(e)));
  }
  redirect(noticeUrl("/settings/kakao", "저장했습니다"));
}

export async function kakaoTestAction(form: FormData) {
  const user = await requireOwner();
  let msg: string;
  try {
    const r = await kakaoTest(await getDb(), user.id, s(form, "key"), s(form, "to"));
    if (!r.ok) throw new Error(r.error ?? "발송 실패");
    msg = r.demo ? "데모 모드라 실제로 보내지 않고 이력만 남겼습니다" : "시험 알림톡을 보냈습니다. 카카오톡을 확인하세요";
  } catch (e) {
    redirect(errorUrl("/settings/kakao", failMsg(e)));
  }
  redirect(noticeUrl("/settings/kakao", msg));
}

export async function saveGiftAction(form: FormData) {
  const user = await requireOwner();
  const provider = s(form, "provider");
  try {
    await saveGift(await getDb(), user.id, {
      provider,
      callback: s(form, "callback"),
      monthLimit: n(form, "monthLimit"),
      unitLimit: n(form, "unitLimit"),
      dupDays: n(form, "dupDays"),
      fields: fieldsOf(form, provider),
      checklist: form.getAll("check").map(String),
    });
  } catch (e) {
    redirect(errorUrl("/settings/gift", userMessage(e)));
  }
  redirect(noticeUrl("/settings/gift", "저장했습니다"));
}

export async function giftBalanceAction() {
  await requireOwner();
  let msg: string;
  try {
    msg = await giftBalance(await getDb());
  } catch (e) {
    redirect(errorUrl("/settings/gift", userMessage(e)));
  }
  redirect(noticeUrl("/settings/gift", msg));
}
