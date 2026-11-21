"use server";
// 직원 앱 푸시 켜기·끄기(_app-alerts.tsx)
import { getDb } from "@/db/runtime";
import { subscribeStaffPush, unsubscribeStaffPush } from "@/modules/platform/staff-push";
import { vapidKeys } from "@/modules/carbook/push";
import { currentUser, requestMeta, userMessage } from "./_lib/session";

export async function staffVapidAction(): Promise<string | null> {
  const me = await currentUser();
  if (!me) return null;
  return (await vapidKeys(await getDb())).publicKey;
}

export async function staffPushOnAction(endpoint: string): Promise<{ error?: string }> {
  const me = await currentUser();
  if (!me) return { error: "다시 로그인해 주세요" };
  try {
    await subscribeStaffPush(await getDb(), me.id, String(endpoint), (await requestMeta()).userAgent ?? null);
    return {};
  } catch (e) {
    return { error: userMessage(e) };
  }
}

export async function staffPushOffAction(endpoint: string) {
  const me = await currentUser();
  if (me) await unsubscribeStaffPush(await getDb(), me.id, String(endpoint));
}
