"use server";
// 메뉴 찾기 칸의 바로 가기(차량번호·전화번호·이름). 권한은 서버에서 다시 본다.
import { getDb } from "@/db/runtime";
import { can } from "@/modules/auth/permissions";
import { quickFind, type QuickHit } from "@/modules/customer/quick-find";
import { currentUser } from "./_lib/session";

export async function quickFindAction(q: string): Promise<QuickHit[]> {
  const user = await currentUser();
  if (!user || typeof q !== "string" || q.length > 40) return [];
  return quickFind(await getDb(), q, can(user, "customer.write"));
}
