// 월간 경영보고서(보고서 센터 5단계): 그 달 핵심 숫자(경영 요약·예산 대비·손익·재무상태·현금흐름·채권·채무·재고·품질)를 한 장으로 묶어
// 회계 담당(또는 대표)이 의견을 붙여 전자결재(MGMT-M)로 올리고 대표가 승인한다. 올린 숫자는 그대로 저장한다(결재받은 숫자가 바뀌지 않게).
import { desc, eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { approvalDoc, mgmtReport } from "@/db/schema";
import { AcctError, canBooks } from "@/modules/acct/service";
import { createDraft, submit } from "@/modules/approval/service";
import type { Role } from "@/modules/auth/roles";
import { writeAudit } from "@/modules/platform/audit";
import { seoulDate } from "@/modules/platform/time";
import { reportById } from "./catalog";
import { comparePeriod, periodOf } from "./period";
import { BUILDERS } from "./run";
import { fmtMetric, type Metric } from "./service";

type Actor = { id: string; roles: Role[] };
/** 경영보고서에 넣는 보고서(순서대로) */
export const MONTHLY_REPORTS = ["summary", "budget", "pl", "bs", "cashflow", "ar", "ap", "stock", "quality"] as const;
export type Section = { id: string; no: number; title: string; kpis: Metric[] };

const YM = /^\d{4}-(0[1-9]|1[0-2])$/;
const ymEnd = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  return `${ym}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}`;
};
/** 지난달(보고서 기본) */
export const lastYm = (today: string) => {
  const [y, m] = today.slice(0, 7).split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
};
export const canMonthly = canBooks;

/** 그 달 경영보고서 숫자(앞 달 비교). 대표 권한으로 계산한다(대표에게 올리는 보고서) */
export async function monthlyPack(db: Db, actorId: string, ym: string, now = new Date()): Promise<Section[]> {
  const p = periodOf("month", `${ym}-01`);
  const q = comparePeriod(p, "prev");
  const out: Section[] = [];
  for (const id of MONTHLY_REPORTS) {
    const def = reportById(id);
    const build = BUILDERS[id];
    if (!def || def.phase || !build) continue;
    try {
      const b = await build({ db, actor: { id: actorId, roles: ["owner"] }, p, q, now, today: seoulDate(now), opt: {} });
      out.push({ id, no: def.no, title: def.title, kpis: b.kpis });
    } catch (e) {
      console.error(`경영보고서 계산 실패 ${ym} ${id}`, e);
    }
  }
  return out;
}

/** 결재 문서 '내용'에 그대로 보이는 글(숫자 줄) */
export function packText(sections: Section[]) {
  return sections
    .map((s) => [`[${s.no}. ${s.title}]`, ...s.kpis.map((k) => `· ${k.label}: ${fmtMetric(k.value, k.unit)}${k.now ? " (지금 기준)" : ` (앞 달 ${fmtMetric(k.prev, k.unit)})`}${k.target != null ? ` · 목표 ${fmtMetric(k.target, k.unit)}${k.ok === false ? " 미달" : ""}` : ""}`)].join("\n"))
    .join("\n\n");
}

/** 그 달 가장 최근에 올린 경영보고서와 결재 상태 */
export async function latestMonthly(db: Db, ym: string) {
  const [r] = await db
    .select({ r: mgmtReport, docNo: approvalDoc.docNo, status: approvalDoc.status })
    .from(mgmtReport)
    .innerJoin(approvalDoc, eq(approvalDoc.id, mgmtReport.approvalDocId))
    .where(eq(mgmtReport.ym, ym))
    .orderBy(desc(mgmtReport.createdAt))
    .limit(1);
  return r ? { ...r.r, sections: r.r.sections as Section[], docNo: r.docNo, status: r.status } : null;
}

/** 경영보고서 결재 올리기. 끝난 달만, 결재 중이거나 승인된 보고서가 있으면 막는다(반려되면 다시 올림) */
export async function submitMonthly(db: Db, actor: Actor, ym: string, comment: string, now = new Date()) {
  if (!canMonthly(actor)) throw new AcctError("월간 경영보고서는 회계 담당·대표가 올립니다");
  if (!YM.test(ym)) throw new AcctError("달을 골라 주세요");
  if (ymEnd(ym) >= seoulDate(now)) throw new AcctError("끝난 달만 올립니다(그 달 말일 다음 날부터)");
  const cur = await latestMonthly(db, ym);
  if (cur && cur.status !== "rejected" && cur.status !== "cancelled" && cur.status !== "discarded") throw new AcctError(`${ym} 경영보고서는 이미 ${cur.docNo}로 올렸습니다`);
  const sections = await monthlyPack(db, actor.id, ym, now);
  const doc = await createDraft(db, { formCode: "MGMT-M", title: `${ym.replace("-", "년 ")}월 경영보고서`, data: { ym, comment: comment.trim() || "(의견 없음)", report: packText(sections) }, drafterId: actor.id }, now);
  await submit(db, doc.id, actor.id, now);
  const [r] = await db.insert(mgmtReport).values({ ym, approvalDocId: doc.id, sections, comment: comment.trim() || null, createdBy: actor.id, createdAt: now }).returning({ id: mgmtReport.id });
  await writeAudit(db, { actorId: actor.id, action: "report.monthly", entityType: "mgmt_report", entityId: doc.docNo, after: { ym } });
  return { id: r.id, docId: doc.id, docNo: doc.docNo };
}
