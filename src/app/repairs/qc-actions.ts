"use server";
// 최종 검사·출고(STD-05) 화면의 서버 동작
import { can } from "@/modules/auth/permissions";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/db/runtime";
import {
  addInspectionPhoto,
  deliver,
  issueStatement,
  judgeInspection,
  removeInspectionPhoto,
  sendReadyNotice,
  startInspection,
} from "@/modules/repair/inspect";
import { parseFilm } from "@/modules/repair/inspect-rules";
import { UserError } from "@/modules/platform/errors";
import { errorUrl, noticeUrl, requireUser, userMessage } from "../_lib/session";

export async function inspectAction(form: FormData) {
  const user = await requireUser();
  const s = (k: string) => String(form.get(k) ?? "").trim();
  const roId = s("roId");
  const back = `/repairs/${roId}/inspect`;
  const db = await getDb();
  let msg = "";
  try {
    if (s("intent") === "start") {
      await startInspection(db, user, roId, s("independenceNote"));
      msg = "검사를 시작했습니다. 작업 후 사진을 찍고 항목마다 확인하세요";
    } else {
      const gap = s("gapMm").replace(",", ".");
      const r = await judgeInspection(db, user, s("inspectionId"), {
        passed: form.getAll("passed").map(String),
        gapMm: gap ? Number(gap) : null,
        filmUm: parseFilm(s("filmUm")),
        failNote: s("failNote"),
      });
      msg = r.pass
        ? "합격입니다. 수리 건이 출고 대기로 넘어갔고 상담원에게 알렸습니다"
        : "불합격으로 기록했습니다. 작업 지시서에 재작업 공정이 생겼고 공장장에게 알렸습니다";
    }
  } catch (e) {
    redirect(errorUrl(back, userMessage(e)));
  }
  redirect(noticeUrl(back, msg));
}

export async function uploadInspectionPhotoAction(
  form: FormData,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireUser();
  const file = form.get("file");
  try {
    if (!(file instanceof Blob))
      throw new UserError("사진을 고르지 않았습니다");
    await addInspectionPhoto(
      await getDb(),
      user,
      String(form.get("inspectionId") ?? ""),
      new Uint8Array(await file.arrayBuffer()),
    );
  } catch (e) {
    return { ok: false, error: userMessage(e) };
  }
  revalidatePath(`/repairs/${String(form.get("roId") ?? "")}/inspect`);
  return { ok: true };
}

export async function removeInspectionPhotoAction(
  form: FormData,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireUser();
  try {
    await removeInspectionPhoto(
      await getDb(),
      user,
      String(form.get("inspectionId") ?? ""),
      String(form.get("path") ?? ""),
    );
  } catch (e) {
    return { ok: false, error: userMessage(e) };
  }
  revalidatePath(`/repairs/${String(form.get("roId") ?? "")}/inspect`);
  return { ok: true };
}

export async function deliveryAction(form: FormData) {
  const user = await requireUser();
  const s = (k: string) => String(form.get(k) ?? "").trim();
  const roId = s("roId");
  let back = `/repairs/${roId}/delivery`;
  const db = await getDb();
  let msg = "";
  try {
    const intent = s("intent");
    if (intent === "notice") {
      const r = await sendReadyNotice(db, user, roId);
      msg = r.ok
        ? `고객에게 수리 완료 안내를 보냈습니다(${r.channel}${r.demo ? ", 데모: 실제로 나가지 않음" : ""}). 인도 일시를 정하세요`
        : `안내를 보내지 못했습니다: ${r.error ?? "발송 실패"}. 전화로 알려 주세요`;
    } else if (intent === "issue") {
      const m = s("mileageOut").replace(/[^\d]/g, "");
      await issueStatement(db, user, roId, {
        mileageOut: m ? Number(m) : null,
      });
      msg =
        "정비명세서를 발급했습니다. '정비명세서 인쇄'로 2부를 뽑아 1부를 고객에게 드리세요";
    } else if (intent === "deliver") {
      const sig = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(
        s("signature"),
      );
      await deliver(db, user, roId, {
        payMethod: s("payMethod"),
        notices: form.getAll("notices").map(String),
        receiverName: s("receiverName"),
        proxy: s("receiver") === "proxy",
        proxyNote: s("proxyNote"),
        signaturePng: sig
          ? new Uint8Array(Buffer.from(sig[1], "base64"))
          : null,
      });
      msg = "인수 서명을 받고 출고했습니다. 7일 뒤 만족도 설문을 확인합니다";
      // 카드·현금·이체로 받았으면 바로 수납 전표를 적게 수납 화면으로(금액·방법은 불러옴)
      if (
        ["card", "cash", "transfer"].includes(s("payMethod")) &&
        can(user, "money.receive")
      ) {
        back = `/money/ro/${roId}`;
        msg +=
          ". 받은 금액을 수납 전표로 적어 주세요(금액·방법을 불러왔습니다)";
      }
    }
  } catch (e) {
    redirect(errorUrl(back, userMessage(e)));
  }
  redirect(noticeUrl(back, msg));
}
