// 품질보고서: 품질 월보·재작업/부적합 분석·고객 만족/불만/보증·경영검토 입력 자료(ISO 9001 9.3).
import { and, eq, gte, isNotNull, lt, lte, ne } from "drizzle-orm";
import { appUser, auditFinding, complaint, inspection, nonconformance, riskItem, supplierEval, survey, workStep } from "@/db/schema";
import { CATEGORIES } from "@/modules/cs/rules";
import { computeGoalSpan, spanOf, targetsFor } from "@/modules/quality/goals";
import { GOAL_KEYS, GOALS, goalOk } from "@/modules/quality/qms-rules";
import { VERDICT } from "@/modules/quality/risk-rules";
import { NC_SOURCES, ROOT_CAUSES } from "@/modules/quality/rules";
import { seoulDate } from "@/modules/platform/time";
import { type Builder, type Row, avg, both, daysBetween, groupBy, m, pct, sum, tsRange } from "./kit";
import { customerValues, fieldValues, safetyValues, type Metric, type Unit } from "./service";

const lbl = (t: Record<string, string>, k: string | null) => (k ? (t[k] ?? k) : "(안 적음)");

/** 14. 품질 월보 */
export const quality: Builder = async (c) => {
  const targets = await targetsFor(c.db, Number(c.p.from.slice(0, 4)));
  const kpis: Metric[] = [];
  const rows: Row[] = [];
  for (const k of GOAL_KEYS) {
    const [a, b] = await both(c, (p) => computeGoalSpan(c.db, spanOf(p.from, p.to), k, c.now));
    const g = GOALS[k];
    const ok = goalOk(k, a.value, targets[k]);
    kpis.push(
      m(k, g.label, g.unit as Unit, a.value, b.value, {
        better: g.dir === "lower" ? "down" : "up",
        target: targets[k],
        ok,
        note: a.denom != null && g.unit === "%" ? `${Math.round(a.numer ?? 0)} / ${a.denom}` : undefined,
        href: "/qms/goals",
      }),
    );
    if (ok === false) rows.push({ cells: [g.label, a.value, targets[k] ?? null, g.dir === "lower" ? "이하" : "이상"], href: "/qms/goals", tone: "danger" });
  }
  return {
    kpis,
    tables: [
      {
        key: "miss",
        title: "목표에 못 미친 지표",
        help: "rep.t.goalMiss",
        cols: [{ label: "지표" }, { label: "실적", num: true }, { label: "목표", num: true }, { label: "기준" }],
        rows,
        total: false,
        empty: "이 기간 모든 품질목표를 지켰습니다.",
        note: "월 목표를 기간 전체에 그대로 대어 본 값입니다. 공식 판정(2개월 연속 미달 → 부적합)은 품질목표 관리표의 달별 값으로 합니다.",
      },
    ],
  };
};

/** 15. 재작업·부적합 분석 */
export const rework: Builder = async (c) => {
  const load = async (p: { from: string; to: string }) => {
    const { start, end } = tsRange(p);
    const ins = await c.db.select({ round: inspection.round, result: inspection.result, fails: inspection.fails }).from(inspection).where(and(gte(inspection.judgedAt, start), lte(inspection.judgedAt, end)));
    const rw = await c.db.select({ who: appUser.name }).from(workStep).leftJoin(appUser, eq(appUser.id, workStep.assignee)).where(and(eq(workStep.process, "rework"), gte(workStep.endedAt, start), lte(workStep.endedAt, end)));
    const ncs = await c.db.select({ source: nonconformance.source, root: nonconformance.rootCause, major: nonconformance.major }).from(nonconformance).where(and(gte(nonconformance.createdAt, start), lte(nonconformance.createdAt, end)));
    return { ins, rw, ncs };
  };
  const [a, b] = await both(c, load);
  const first = (x: typeof a) => x.ins.filter((i) => i.round === 1);
  const fpy = (x: typeof a) => pct(first(x).filter((i) => i.result === "pass").length, first(x).length);
  const failKeys = groupBy(a.ins.flatMap((i) => i.fails), (f) => f.key);
  const late = await c.db.select().from(nonconformance).where(and(ne(nonconformance.status, "closed"), isNotNull(nonconformance.dueOn), lt(nonconformance.dueOn, c.today)));
  const bySrc = groupBy(a.ncs, (n) => n.source);
  const byRoot = groupBy(a.ncs, (n) => n.root ?? "");
  const total = a.ncs.length;
  let cum = 0;
  return {
    kpis: [
      m("fpy", "검사 한 번에 합격률", "%", fpy(a), fpy(b), { better: "up", note: `${first(a).length}대 검사` }),
      m("fail", "검사 불합격", "건", a.ins.filter((i) => i.result === "fail").length, b.ins.filter((i) => i.result === "fail").length, { better: "down" }),
      m("rework", "재작업 공정", "건", a.rw.length, b.rw.length, { better: "down" }),
      m("ncs", "부적합 발행", "건", a.ncs.length, b.ncs.length, { better: "down", href: "/nc" }),
      m("major", "중대 부적합", "건", a.ncs.filter((n) => n.major).length, b.ncs.filter((n) => n.major).length, { better: "down" }),
      m("late", "기한 지난 시정조치", "건", late.length, null, { now: true, better: "down", href: "/nc" }),
    ],
    tables: [
      {
        key: "source",
        title: "부적합 출처별(많은 순)",
        help: "rep.t.ncSource",
        cols: [{ label: "출처" }, { label: "건수", unit: "건", num: true }, { label: "비중", unit: "%", num: true }, { label: "누적 비중", unit: "%", num: true }],
        rows: [...bySrc.entries()].sort((x, y) => y[1] - x[1]).map(([k, n]) => ((cum += n), { cells: [lbl(NC_SOURCES, k), n, pct(n, total), pct(cum, total)], href: `/nc` })),
        empty: "이 기간 부적합이 없습니다.",
        note: "누적 비중 80%까지의 출처부터 손보면 효과가 큽니다(파레토).",
      },
      {
        key: "root",
        title: "근본 원인별",
        help: "rep.t.ncRoot",
        cols: [{ label: "원인(4M+)" }, { label: "건수", unit: "건", num: true }],
        rows: [...byRoot.entries()].sort((x, y) => y[1] - x[1]).map(([k, n]) => ({ cells: [k ? lbl(ROOT_CAUSES, k) : "아직 분석 안 함", n] })),
        empty: "이 기간 부적합이 없습니다.",
      },
      {
        key: "fails",
        title: "검사 불합격 항목",
        help: "rep.t.inspFails",
        cols: [{ label: "항목" }, { label: "건수", unit: "건", num: true }],
        rows: [...failKeys.entries()].sort((x, y) => y[1] - x[1]).map(([k, n]) => ({ cells: [k, n] })),
        empty: "이 기간 불합격이 없습니다.",
      },
      {
        key: "techRework",
        title: "기술자별 재작업",
        help: "rep.t.techRework",
        cols: [{ label: "기술자" }, { label: "재작업", unit: "건", num: true }],
        rows: [...groupBy(a.rw, (r) => r.who ?? "배정 안 됨").entries()].sort((x, y) => y[1] - x[1]).map(([k, n]) => ({ cells: [k, n] })),
        empty: "이 기간 재작업이 없습니다.",
        note: "탓하려는 것이 아니라 교육·표준이 필요한 곳을 찾으려는 것입니다.",
      },
      {
        key: "late",
        title: "기한 지난 시정조치",
        help: "rep.t.ncLate",
        cols: [{ label: "번호" }, { label: "내용" }, { label: "기한" }, { label: "지난 날", unit: "일", num: true }],
        rows: late.map((n) => ({ cells: [n.docNo, n.content.slice(0, 40), n.dueOn, daysBetween(n.dueOn!, c.today)], href: `/nc/${n.id}`, tone: "danger" as const })),
        total: false,
        empty: "기한 지난 시정조치가 없습니다.",
        now: true,
      },
    ],
  };
};

/** 16. 고객 만족·불만·보증 */
export const customer: Builder = async (c) => {
  const load = async (p: { from: string; to: string }) => {
    const { start, end } = tsRange(p);
    const sv = await c.db.select({ scores: survey.scores, answeredAt: survey.answeredAt }).from(survey).where(and(gte(survey.sentAt, start), lte(survey.sentAt, end), eq(survey.sentOk, true)));
    const cp = await c.db.select().from(complaint).where(and(gte(complaint.receivedAt, start), lte(complaint.receivedAt, end)));
    const closed = await c.db.select({ r: complaint.receivedAt, c: complaint.closedAt }).from(complaint).where(and(gte(complaint.closedAt, start), lte(complaint.closedAt, end)));
    return { sv, cp, closed };
  };
  const [a, b] = await both(c, load);
  const score = (x: typeof a) => avg(x.sv.flatMap((s) => (s.answeredAt ? (s.scores ?? []).filter((n): n is number => n != null) : [])));
  const closeDays = (x: typeof a) => avg(x.closed.filter((r) => r.c).map((r) => daysBetween(seoulDate(r.r), seoulDate(r.c!))));
  const [cv, cvq] = await both(c, (p) => customerValues(c.db, p));
  const warranty = (x: typeof a) => x.cp.filter((r) => r.warrantyRoId).length;
  const byCat = groupBy(a.cp, (r) => r.category);
  return {
    kpis: [
      m("score", "만족도 평균", "점", score(a), score(b), { better: "up", note: "5점 만점" }),
      m("answer", "설문 응답률", "%", cv.answerRate, cvq.answerRate, { better: "up", note: `${cv.surveys}건 발송` }),
      m("complaints", "불만 접수", "건", cv.complaints, cvq.complaints, { better: "down", href: "/complaints" }),
      m("closeDays", "불만 종결까지 평균", "일", closeDays(a), closeDays(b), { better: "down" }),
      m("warranty", "보증 수리로 이어진 불만", "건", warranty(a), warranty(b), { better: "down", href: "/complaints?f=warranty" }),
      m("comp", "보상 승인 금액", "원", cv.comp, cvq.comp, { better: "down" }),
    ],
    tables: [
      {
        key: "cat",
        title: "불만 유형별",
        help: "rep.t.cpCat",
        cols: [{ label: "유형" }, { label: "건수", unit: "건", num: true }, { label: "비중", unit: "%", num: true }],
        rows: [...byCat.entries()].sort((x, y) => y[1] - x[1]).map(([k, n]) => ({ cells: [lbl(CATEGORIES, k), n, pct(n, a.cp.length)] })),
        empty: "이 기간 불만이 없습니다.",
      },
      {
        key: "open",
        title: "이 기간 불만 목록",
        help: "rep.t.cpList",
        cols: [{ label: "번호" }, { label: "접수일" }, { label: "유형" }, { label: "상태" }, { label: "보상", unit: "원", num: true }],
        rows: a.cp.map((r) => ({ cells: [r.docNo, seoulDate(r.receivedAt), lbl(CATEGORIES, r.category), r.closedAt ? "종결" : "처리 중", r.compWon ?? 0], href: `/complaints/${r.id}`, tone: r.closedAt ? undefined : ("warn" as const) })),
        empty: "이 기간 불만이 없습니다.",
      },
    ],
  };
};

/** 17. 경영검토 입력 자료(ISO 9001 9.3.2) */
export const review: Builder = async (c) => {
  const { start, end } = tsRange(c.p);
  const targets = await targetsFor(c.db, Number(c.p.from.slice(0, 4)));
  let miss = 0;
  for (const k of GOAL_KEYS) if (goalOk(k, (await computeGoalSpan(c.db, spanOf(c.p.from, c.p.to), k, c.now)).value, targets[k]) === false) miss++;
  const findings = await c.db.select({ v: auditFinding.verdict }).from(auditFinding).where(and(gte(auditFinding.at, start), lte(auditFinding.at, end)));
  const [cv, f, s] = await Promise.all([customerValues(c.db, c.p), fieldValues(c.db, c.p), safetyValues(c.db, c.p)]);
  const evals = await c.db.select({ total: supplierEval.total, outcome: supplierEval.outcome }).from(supplierEval).where(and(gte(supplierEval.evaluatedAt, start), lte(supplierEval.evaluatedAt, end)));
  const risks = await c.db.select({ status: riskItem.status, score: riskItem.score }).from(riskItem);
  const openRisks = risks.filter((r) => r.status !== "closed" && r.status !== "done");
  const sv = await c.db.select({ scores: survey.scores }).from(survey).where(and(gte(survey.answeredAt, start), lte(survey.answeredAt, end)));
  const row = (item: string, v: string | number | null, href: string, std: string): Row => ({ cells: [std, item, v], href });
  const fv = groupBy(findings, (x) => x.v);
  return {
    kpis: [],
    tables: [
      {
        key: "inputs",
        title: "경영검토 입력 항목",
        help: "rep.t.reviewInputs",
        cols: [{ label: "9.3.2" }, { label: "입력 항목" }, { label: "이 기간" }],
        rows: [
          row("품질목표 미달 지표", `${miss}개 / ${GOAL_KEYS.length}개`, "/reports/quality", "c) 3)"),
          row("고객 만족 평균(5점)", avg(sv.flatMap((x) => (x.scores ?? []).filter((n): n is number => n != null))) == null ? "응답 없음" : `${Math.round(avg(sv.flatMap((x) => (x.scores ?? []).filter((n): n is number => n != null)))! * 10) / 10}점 (${sv.length}건)`, "/reports/customer", "c) 1)"),
          row("고객 불만 접수·종결", `${cv.complaints}건 접수 · ${cv.closed}건 종결`, "/reports/customer", "c) 1)"),
          row("부적합 발행·종결", `${f.ncs}건 발행 · ${f.ncClosed}건 종결`, "/reports/rework", "c) 4)"),
          row("내부심사 결과", findings.length ? Object.keys(VERDICT).map((k) => `${VERDICT[k as keyof typeof VERDICT]} ${fv.get(k) ?? 0}`).join(" · ") : "이 기간 심사 없음", "/audits", "c) 6)"),
          row("협력업체 평가", evals.length ? `${evals.length}곳 평가, 평균 ${Math.round(sum(evals, (e) => e.total) / evals.length)}점` : "이 기간 평가 없음", "/reports/purchase", "c) 7)"),
          row("리스크·기회 조치 중", `${openRisks.length}건 (고위험 ${openRisks.filter((r) => r.score >= 12).length}건)`, "/risks", "e)"),
          row("교육 실시", `${f.trainings}건 · ${Math.round(f.trainingHours * 10) / 10}시간`, "/reports/people", "d)"),
          row("설비 고장", `${f.failures}건`, "/reports/equipment", "d)"),
          row("사고·아차사고", `${s.accidents}건 · ${s.near}건`, "/reports/safety", "c) 4)"),
          row("개선 제안·채택", `${f.suggestions}건 · ${f.adopted}건`, "/suggestions", "f)"),
        ],
        total: false,
        note: "경영검토 화면에서 이 기간을 고르고 각 항목의 판단과 조치를 적습니다.",
      },
    ],
    notes: ["경영검토 회의록은 품질 › 경영검토(/qms/review)에 남깁니다."],
  };
};
