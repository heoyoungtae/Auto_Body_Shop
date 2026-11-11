"use server";
// 품질경영(Q장) 화면의 서버 동작: 조직 상황·품질목표·문서 목록·경영검토
import { redirect } from "next/navigation";
import { getDb } from "@/db/runtime";
import { setTarget, signQuarter, snapshotMonth } from "@/modules/quality/goals";
import {
  contextToRisk,
  retireDoc,
  saveContext,
  saveDoc,
  saveReview,
  seedDocs,
  type DocInput,
} from "@/modules/quality/qms";
import { REVIEW_INPUTS } from "@/modules/quality/qms-rules";
import { errorUrl, noticeUrl, requireUser, userMessage } from "../_lib/session";

const str = (form: FormData) => (k: string) => String(form.get(k) ?? "").trim();
const rows = (form: FormData, prefix: string, keys: string[]) => {
  const n = Number(form.get(`${prefix}_n`) ?? 0);
  return Array.from({ length: n }, (_, i) =>
    Object.fromEntries(
      keys.map((k) => [k, String(form.get(`${prefix}_${k}_${i}`) ?? "")]),
    ),
  );
};

export async function contextAction(form: FormData) {
  const user = await requireUser();
  const s = str(form);
  const year = Number(s("year"));
  const back = `/qms/context?year=${year}`;
  let msg = "";
  try {
    const db = await getDb();
    const intent = s("intent");
    if (intent === "risk") {
      msg = `리스크·기회 대장 ${await contextToRisk(db, user, year, Number(s("index")), { kind: s("kind"), likelihood: Number(s("likelihood")), impact: Number(s("impact")) })}에 올렸습니다`;
    } else {
      const old = rows(form, "is", ["riskId", "riskNo"]);
      const issues = rows(form, "is", [
        "area",
        "issue",
        "impact",
        "action",
      ]).map((r, i) => ({
        area: r.area,
        issue: r.issue,
        impact: r.impact,
        action: r.action,
        riskId: old[i].riskId || null,
        riskNo: old[i].riskNo || null,
      }));
      const parties = rows(form, "pt", ["party", "needs", "check", "std"]).map(
        (r) => ({ party: r.party, needs: r.needs, check: r.check, std: r.std }),
      );
      await saveContext(
        db,
        user,
        year,
        { issues, parties, note: s("note") },
        intent === "confirm",
      );
      msg = intent === "confirm" ? "검토표를 승인했습니다" : "저장했습니다";
    }
  } catch (e) {
    redirect(errorUrl(back, userMessage(e)));
  }
  redirect(noticeUrl(back, msg));
}

export async function goalAction(form: FormData) {
  const user = await requireUser();
  const s = str(form);
  const year = Number(s("year"));
  const back = `/qms/goals?year=${year}`;
  let msg = "";
  try {
    const db = await getDb();
    const intent = s("intent");
    if (intent === "target") {
      const v = s("target").replace(/[^\d.]/g, "");
      await setTarget(
        db,
        user,
        year,
        s("key"),
        v === "" ? null : Number(v),
        s("reason"),
      );
      msg = "목표값을 바꿨습니다";
    } else if (intent === "sign") {
      await signQuarter(db, user, year, Number(s("quarter")), s("note"));
      msg = `${s("quarter")}분기 검토 서명을 했습니다`;
    } else if (intent === "snapshot") {
      if (!user.roles.includes("owner") && !user.roles.includes("quality"))
        throw new Error("집계 고정은 품질 담당·대표가 합니다");
      const r = await snapshotMonth(db, s("ym"));
      msg = r.fixed
        ? `${s("ym")} 집계를 고정했습니다${r.nc.length ? `. 2개월 연속 미달로 부적합 ${r.nc.join(", ")}을(를) 발행했습니다` : ""}`
        : "이미 고정한 달입니다";
    }
  } catch (e) {
    redirect(errorUrl(back, userMessage(e)));
  }
  redirect(noticeUrl(back, msg));
}

const docInput = (s: (k: string) => string): DocInput => ({
  no: s("no"),
  name: s("name"),
  kind: s("kind"),
  rev: s("rev"),
  effectiveOn: s("effectiveOn"),
  owner: s("owner"),
  location: s("location"),
  source: s("source"),
  receivedOn: s("receivedOn"),
  note: s("note"),
});

export async function docAction(form: FormData) {
  const user = await requireUser();
  const s = str(form);
  const id = s("id");
  let back = id ? `/qms/docs/${id}` : "/qms/docs";
  let msg = "";
  try {
    const db = await getDb();
    const intent = s("intent");
    if (intent === "seed")
      msg = `표준서·양식 ${await seedDocs(db, user)}건을 목록에 넣었습니다`;
    else if (intent === "retire") {
      await retireDoc(db, user, id, s("reason"));
      msg = "폐지했습니다(폐기 표시로 보관)";
    } else {
      const nid = await saveDoc(db, user, id || null, docInput(s));
      back = `/qms/docs/${nid}`;
      msg = "저장했습니다";
    }
  } catch (e) {
    redirect(errorUrl(back, userMessage(e)));
  }
  redirect(noticeUrl(back, msg));
}

export async function reviewAction(form: FormData) {
  const user = await requireUser();
  const s = str(form);
  const year = Number(s("year"));
  const back = `/qms/review?year=${year}`;
  let msg = "";
  try {
    const actions = rows(form, "ac", ["task", "assigneeId", "dueOn"]).map(
      (r) => ({ task: r.task, assigneeId: r.assigneeId, dueOn: r.dueOn }),
    );
    const comments = Object.fromEntries(
      Object.keys(REVIEW_INPUTS).map((k) => [k, s(`c_${k}`)]),
    );
    const confirm = s("intent") === "confirm";
    const saved = await saveReview(
      await getDb(),
      user,
      year,
      {
        heldOn: s("heldOn"),
        attendees: s("attendees"),
        comments,
        nextGoals: s("nextGoals"),
        resources: s("resources"),
        actions,
      },
      confirm,
    );
    const sent = saved.filter((a) => a.instructionNo).length;
    msg = confirm
      ? `경영검토서를 확정했습니다${sent ? `. 개선 과제 ${sent}건을 업무지시로 내렸습니다` : ""}`
      : "저장했습니다";
  } catch (e) {
    redirect(errorUrl(back, userMessage(e)));
  }
  redirect(noticeUrl(back, msg));
}
