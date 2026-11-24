"use server";
// AOS 지급 엑셀 올리기·고른 줄 입금 확인·지우기
import { redirect } from "next/navigation";
import { getDb } from "@/db/runtime";
import { applyAosPaid, clearAosUpload, uploadAosPaid } from "@/modules/repair/aos-paid";
import { errorUrl, noticeUrl, requireUser, userMessage } from "../../_lib/session";

const BACK = "/claims/aos-paid";

export async function aosPaidAction(form: FormData) {
  const user = await requireUser();
  const intent = String(form.get("intent") ?? "");
  let msg = "";
  let partial = "";
  try {
    const db = await getDb();
    if (intent === "upload") {
      const f = form.get("file");
      if (!(f instanceof File) || !f.size) throw new Error("올릴 파일을 골라 주세요");
      const n = await uploadAosPaid(db, user, { bytes: new Uint8Array(await f.arrayBuffer()), fileName: f.name });
      msg = `${f.name}에서 지급 ${n}줄을 읽었습니다. 아래에서 맞춘 결과를 보고 입금 확인할 줄을 고르세요`;
    } else if (intent === "clear") {
      await clearAosUpload(db, user);
      msg = "올린 파일을 지웠습니다";
    } else {
      const picks = form.getAll("pick").map((v) => {
        const line = Number(v);
        return { line, cutReason: String(form.get(`cut:${line}`) ?? "") };
      });
      const r = await applyAosPaid(db, user, picks);
      msg = `${r.done.length}건 입금 확인${r.done.length ? `: ${r.done.join(", ")}` : ""}`;
      if (r.failed.length) partial = `${msg}. 못 한 줄: ${r.failed.join(" / ")}`;
    }
  } catch (e) {
    redirect(errorUrl(BACK, userMessage(e)));
  }
  redirect(partial ? errorUrl(BACK, partial) : noticeUrl(BACK, msg));
}
