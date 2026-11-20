// 내 차 수첩 링크 만들기. 출고 안내(알림톡)·초대 문자가 쓴다. 무거운 모듈을 부르지 않도록 따로 둔다.
import type { Db } from "@/db/client";
import { carbookLink } from "@/db/schema";
import { randomToken, sha256 } from "@/modules/auth/crypto";
import { LINK_DAYS } from "./rules";

const appUrl = () => (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");

/** 링크(90일). 열면 그 수리 건만 보는 로그인이 되고, 나머지 기록은 문자 인증 뒤에 보인다 */
export async function makeLink(db: Db, customerId: string, roId: string | null, now = new Date()) {
  const token = randomToken(24);
  await db.insert(carbookLink).values({ tokenHash: sha256(token), customerId, repairOrderId: roId, expiresAt: new Date(now.getTime() + LINK_DAYS * 864e5), createdAt: now });
  return { token, url: `${appUrl()}/my/l/${token}` };
}
