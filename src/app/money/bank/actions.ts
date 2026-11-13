"use server";
// 통장·카드·홈택스 내역 화면의 서버 동작: 엑셀 올리기·되돌리기, 잇기·분류·풀기, 보험 입금 확인·지급 처리·급여 지급, 연동 설정
import { redirect } from "next/navigation";
import { getDb } from "@/db/runtime";
import {
  classifyTx,
  confirmClaimFromTx,
  importFile,
  issueToken,
  linkTx,
  payFromTx,
  payrollFromTx,
  removeAccount,
  saveAccount,
  undoImport,
  unlinkTx,
} from "@/modules/bank/service";
import { errorUrl, noticeUrl, requireUser, userMessage } from "../../_lib/session";

const str = (form: FormData) => (k: string) => String(form.get(k) ?? "").trim();
/** 돌아갈 곳: 목록 화면에서 보낸 back(같은 앱 안 주소만) */
const backOf = (s: (k: string) => string, def: string) => {
  const b = s("back");
  return b.startsWith("/money/bank") ? b : def;
};

export async function txAction(form: FormData) {
  const user = await requireUser();
  const s = str(form);
  const back = backOf(s, "/money/bank");
  let msg = "";
  try {
    const db = await getDb();
    const txId = s("txId");
    switch (s("intent")) {
      case "link":
        await linkTx(db, user, txId, s("kind"), s("id"), s("note"));
        msg = `${s("no")}와 이었습니다`;
        break;
      case "class":
        await classifyTx(db, user, txId, s("cls"), s("note"));
        msg = "분류했습니다";
        break;
      case "unlink":
        await unlinkTx(db, user, txId);
        msg = "연결을 풀었습니다. 다시 맞춰 주세요";
        break;
      case "claim":
        msg = `보험 입금을 확인하고 입금 전표 ${await confirmClaimFromTx(db, user, txId, s("roId"), s("cutReason"))}를 적었습니다`;
        break;
      case "pay":
        msg = `${await payFromTx(db, user, txId, s("id"))}을(를) 이 출금 날짜로 지급 처리했습니다`;
        break;
      case "payroll":
        msg = `${await payrollFromTx(db, user, txId, s("id"))} 급여를 지급 처리했습니다`;
        break;
      default:
        throw new Error("알 수 없는 동작입니다");
    }
  } catch (e) {
    redirect(errorUrl(back, userMessage(e)));
  }
  redirect(noticeUrl(back, msg));
}

export async function importAction(form: FormData) {
  const user = await requireUser();
  const s = str(form);
  const f = form.get("file");
  let to = "";
  try {
    if (!(f instanceof File) || !f.size) throw new Error("올릴 파일을 골라 주세요");
    const r = await importFile(await getDb(), user, { bytes: new Uint8Array(await f.arrayBuffer()), fileName: f.name, kind: s("kind"), accountId: s("accountId") });
    const q = new URLSearchParams({ done: r.importId, notice: `${f.name}: 새로 ${r.added}줄, 이미 있던 ${r.dup}줄${r.skipped.length ? `, 건너뜀 ${r.skipped.length}줄(${r.skipped.slice(0, 3).map((x) => `${x.line}번째 줄 ${x.why}`).join(", ")}${r.skipped.length > 3 ? " …" : ""})` : ""}${r.matched ? ` · 저절로 맞춘 ${r.matched}건` : ""}` });
    to = `/money/bank/upload?${q}`;
  } catch (e) {
    redirect(errorUrl("/money/bank/upload", userMessage(e)));
  }
  redirect(to);
}

export async function undoImportAction(form: FormData) {
  const user = await requireUser();
  const s = str(form);
  let msg = "";
  try {
    const r = await undoImport(await getDb(), user, s("importId"));
    msg = `되돌렸습니다: ${r.removed}줄 지움${r.kept ? `, 사람이 맞춘 ${r.kept}줄은 남김` : ""}`;
  } catch (e) {
    redirect(errorUrl("/money/bank/upload", userMessage(e)));
  }
  redirect(noticeUrl("/money/bank/upload", msg));
}

export async function feedAction(form: FormData) {
  const user = await requireUser();
  const s = str(form);
  const back = "/money/bank/settings";
  let msg = "";
  try {
    const db = await getDb();
    switch (s("intent")) {
      case "account": {
        const a = await saveAccount(db, user, { id: s("id") || undefined, kind: s("kind"), company: s("kind") === "card" ? s("cardCo") : s("bankCo"), name: s("name"), digits: s("digits"), payDay: s("payDay") ? Number(s("payDay")) : null, sms: s("sms") === "1" });
        msg = `${a.name}을(를) ${s("id") ? "고쳤습니다" : "등록했습니다"}`;
        break;
      }
      case "remove":
        await removeAccount(db, user, s("id"));
        msg = "지웠습니다. 이미 들어온 거래는 그대로 남습니다";
        break;
      case "token":
        await issueToken(db, user);
        msg = "문자 받는 주소를 새로 만들었습니다. 휴대폰 문자 전달 앱의 주소도 바꿔 넣으세요";
        break;
      default:
        throw new Error("알 수 없는 동작입니다");
    }
  } catch (e) {
    redirect(errorUrl(back, userMessage(e)));
  }
  redirect(noticeUrl(back, msg));
}
