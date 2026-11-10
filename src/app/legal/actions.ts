"use server";
// 법규 대장(F-Q-06)·준수 평가(F-Q-07) 화면의 서버 동작
import { redirect } from "next/navigation";
import { getDb } from "@/db/runtime";
import {
  confirmLegalYear,
  createLegal,
  evaluateLegal,
  importAppendixC,
  recordDone,
  recordInspection,
  recordRevCheck,
  updateLegal,
  type LegalInput,
} from "@/modules/quality/legal";
import { UserError } from "@/modules/platform/errors";
import { errorUrl, noticeUrl, requireUser, userMessage } from "../_lib/session";

const str = (form: FormData) => (k: string) => String(form.get(k) ?? "").trim();
function input(form: FormData): LegalInput {
  const s = str(form);
  return {
    area: s("area"),
    lawName: s("lawName"),
    clause: s("clause"),
    duty: s("duty"),
    stdRef: s("stdRef"),
    applies: s("applies"),
    basis: s("basis"),
    ownerId: s("ownerId"),
    cycle: s("cycle") || "none",
    nextDue: s("nextDue"),
    evidence: s("evidence"),
    authority: s("authority"),
    permitNo: s("permitNo"),
    validUntil: s("validUntil"),
    note: s("note"),
  };
}

export async function createLegalAction(form: FormData) {
  const user = await requireUser();
  let id = "";
  try {
    id = await createLegal(await getDb(), user, input(form));
  } catch (e) {
    redirect(errorUrl("/legal/new", userMessage(e)));
  }
  redirect(noticeUrl(`/legal/${id}`, "법규 대장에 올렸습니다"));
}

export async function importAppendixAction() {
  const user = await requireUser();
  let n = 0;
  try {
    n = await importAppendixC(await getDb(), user);
  } catch (e) {
    redirect(errorUrl("/legal", userMessage(e)));
  }
  redirect(
    noticeUrl(
      "/legal?f=check",
      n
        ? `부록 C 초안 ${n}건을 넣었습니다. 하나씩 열어 대상 여부와 근거를 적으세요`
        : "이미 모두 들어 있습니다",
    ),
  );
}

export async function legalAction(form: FormData) {
  const user = await requireUser();
  const s = str(form);
  const id = s("id");
  const back = s("back") || `/legal/${id}`;
  let msg = "저장했습니다";
  try {
    const db = await getDb();
    const intent = s("intent");
    if (intent === "update") await updateLegal(db, user, id, input(form));
    else if (intent === "done") {
      const next = await recordDone(db, user, id, {
        doneOn: s("doneOn"),
        evidence: s("doneEvidence"),
        validUntil: s("newValidUntil"),
      });
      msg = next
        ? `이행을 기록했습니다. 다음 기한은 ${next}입니다`
        : "이행을 기록했습니다";
    } else if (intent === "inspect") {
      const nc = await recordInspection(db, user, id, {
        on: s("inspectOn"),
        finding: s("finding"),
        fixDue: s("fixDue"),
      });
      msg = nc
        ? "점검 지적을 기록하고 부적합으로 등록했습니다"
        : "점검(지적 없음)을 기록했습니다";
    } else if (intent === "revcheck") {
      const ids = form.getAll("ids").map(String).filter(Boolean);
      const n = await recordRevCheck(db, user, ids.length ? ids : [id], {
        changed: s("changed") === "1",
        note: s("revNote"),
      });
      msg = `개정 확인 ${n}건을 기록했습니다`;
    } else if (intent === "eval") {
      const r = await evaluateLegal(db, user, id, {
        year: Number(s("year")),
        result: s("result"),
        evidence: s("evalEvidence"),
      });
      msg = r.ncId
        ? "미흡으로 평가하고 부적합으로 등록했습니다"
        : "평가를 저장했습니다";
    } else if (intent === "confirm") {
      msg = `확정했습니다: ${await confirmLegalYear(db, user, Number(s("year")))}. 경영검토에 올라갑니다`;
    } else throw new UserError("알 수 없는 요청");
  } catch (e) {
    redirect(errorUrl(back, userMessage(e)));
  }
  redirect(noticeUrl(back, msg));
}
