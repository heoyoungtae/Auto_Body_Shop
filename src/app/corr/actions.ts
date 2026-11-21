"use server";
// 문서 수발신 대장(F-Q-11)·회사 공문(F-Q-12) 화면의 서버 동작
import { redirect } from "next/navigation";
import { getDb } from "@/db/runtime";
import {
  addCorrFile,
  closeReceived,
  CorrError,
  discardLetter,
  draftLetter,
  receiveCorr,
  recordSent,
  removeCorrFile,
  reopenReceived,
  updateLetter,
  updateReceived,
  type LetterInput,
  type ReceiveInput,
} from "@/modules/quality/corr";
import { CORR_VIA } from "@/modules/quality/corr-rules";
import { errorUrl, noticeUrl, requireUser, userMessage } from "../_lib/session";

const getter = (form: FormData) => (k: string) => String(form.get(k) ?? "").trim();
const receiveInput = (form: FormData): ReceiveInput => {
  const s = getter(form);
  return {
    receivedOn: s("receivedOn"),
    via: s("via"),
    party: s("party"),
    partyKind: s("partyKind"),
    theirNo: s("theirNo"),
    theirDate: s("theirDate"),
    title: s("title"),
    body: s("body"),
    ownerId: s("ownerId"),
    needReply: form.getAll("needReply").includes("1"),
    dueOn: s("dueOn"),
    note: s("note"),
  };
};
const letterInput = (form: FormData): LetterInput => {
  const s = getter(form);
  return { party: s("party"), partyKind: s("partyKind"), partyAddr: s("partyAddr"), cc: s("cc"), title: s("title"), body: String(form.get("body") ?? "").replace(/\r\n/g, "\n").trim(), enclosures: s("enclosures"), replyToId: s("replyToId") };
};
const filesOf = async (form: FormData, name: string) =>
  Promise.all(
    form
      .getAll(name)
      .filter((f): f is File => f instanceof File && f.size > 0)
      .map(async (f) => ({ bytes: new Uint8Array(await f.arrayBuffer()), name: f.name })),
  );

export async function receiveCorrAction(form: FormData) {
  const user = await requireUser();
  let r = { id: "", no: "" };
  try {
    r = await receiveCorr(await getDb(), user, receiveInput(form), await filesOf(form, "corrFiles"));
  } catch (e) {
    redirect(errorUrl("/corr/receive", userMessage(e)));
  }
  redirect(noticeUrl(`/corr/${r.id}`, `${r.no}로 접수했습니다`));
}

export async function draftLetterAction(form: FormData) {
  const user = await requireUser();
  let r = { id: "", no: "" };
  const back = form.get("replyToId") ? `/corr/new?reply=${form.get("replyToId")}` : "/corr/new";
  try {
    r = await draftLetter(await getDb(), user, letterInput(form));
  } catch (e) {
    redirect(errorUrl(back, userMessage(e)));
  }
  redirect(noticeUrl(`/corr/${r.id}`, user.roles.includes("owner") ? `${r.no} 공문을 승인했습니다. 인쇄해 보내고 발송을 기록하세요` : `${r.no} 공문을 대표에게 올렸습니다. 승인되면 알림이 갑니다`));
}

/** 한 건 화면의 동작(intent): 고치기·파일·처리 끝·다시 열기·발송·버리기 */
export async function corrAction(form: FormData) {
  const user = await requireUser();
  const s = getter(form);
  const id = s("id");
  const back = `/corr/${id}`;
  let msg = "저장했습니다";
  try {
    const db = await getDb();
    switch (s("intent")) {
      case "updateIn":
        await updateReceived(db, user, id, receiveInput(form));
        break;
      case "updateOut":
        await updateLetter(db, user, id, letterInput(form));
        msg = "고쳐서 결재에 다시 올렸습니다";
        break;
      case "files": {
        const files = await filesOf(form, "corrFiles");
        if (!files.length) throw new CorrError("파일을 골라 주세요");
        for (const f of files) await addCorrFile(db, user, id, f.bytes, f.name);
        msg = `${files.length}개를 붙였습니다`;
        break;
      }
      case "removeFile":
        await removeCorrFile(db, user, id, s("path"));
        msg = "파일을 뗐습니다";
        break;
      case "close":
        await closeReceived(db, user, id, s("doneNote"));
        msg = "처리 끝으로 기록했습니다";
        break;
      case "reopen":
        await reopenReceived(db, user, id);
        msg = "다시 열었습니다";
        break;
      case "send":
        await recordSent(db, user, id, { sentOn: s("sentOn"), via: s("via"), note: s("note") });
        msg = `${CORR_VIA[s("via") as keyof typeof CORR_VIA] ?? ""}(으)로 보낸 것을 기록했습니다`;
        break;
      case "discard":
        await discardLetter(db, user, id);
        msg = "공문을 버렸습니다(번호는 '버림'으로 남습니다)";
        break;
      default:
        throw new CorrError("알 수 없는 요청");
    }
  } catch (e) {
    redirect(errorUrl(back, userMessage(e)));
  }
  redirect(noticeUrl(back, msg));
}
