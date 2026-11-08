// 내 서명: 로그인한 직원 누구나 한 번 등록해 두면, 내가 작성한 견적서·정비명세서의 '작성자(서명 또는 인)' 칸에 찍힌다.
// 발급할 때 그 순간의 서명 경로를 서류에 고정한다. 그래서 바꾸거나 지워도 예전 파일은 남겨 둔다.
import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { appUser } from "@/db/schema";
import { writeAudit } from "../platform/audit";
import { UserError } from "../platform/errors";
import { sniffImage, storeFile } from "../platform/storage";

export async function userSignature(db: Db, userId: string | null | undefined): Promise<string | null> {
  if (!userId) return null;
  const [u] = await db.select({ p: appUser.signaturePath }).from(appUser).where(eq(appUser.id, userId));
  return u?.p ?? null;
}

/** png=null 이면 지운다 */
export async function saveUserSignature(db: Db, userId: string, png: Uint8Array | null) {
  let path: string | null = null;
  if (png) {
    if (sniffImage(png) !== "image/png" || png.length > 400_000) throw new UserError("서명 그림을 읽지 못했습니다. 서명란을 지우고 다시 하거나 PNG·JPG 파일로 다시 골라 주세요");
    path = await storeFile(`sign/${userId}`, png, "png");
  }
  const before = await userSignature(db, userId);
  await db.update(appUser).set({ signaturePath: path }).where(eq(appUser.id, userId));
  await writeAudit(db, { actorId: userId, action: path ? "user.signature" : "user.signature.clear", entityType: "app_user", entityId: userId, before: { path: before }, after: { path } });
}
