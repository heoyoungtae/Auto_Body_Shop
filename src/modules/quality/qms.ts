// 품질경영시스템(Q장): 조직 상황·이해관계자 검토(F-Q-01), 문서 목록(F-Q-04), 경영검토(F-Q-09).
// 지난해 표·앱 기록을 불러와 바뀐 칸만 고치게 하고, 경영검토 입력 자료는 앱이 모아 붙인다(다시 치지 않음).
import { and, desc, eq, gte, inArray, lte } from "drizzle-orm";
import type { Db } from "@/db/client";
import {
  appUser,
  approvalDoc,
  auditFinding,
  complaint,
  contextReview,
  docRegister,
  equipmentFailure,
  incident,
  internalAudit,
  legalEvalYear,
  legalEvent,
  mgmtReview,
  nonconformance,
  pmTask,
  supplierEval,
  survey,
  wasteLog,
  instructionTask,
} from "@/db/schema";
import { onConfirmed, type DocRow } from "@/modules/approval/service";
import { can } from "@/modules/auth/permissions";
import type { Role } from "@/modules/auth/roles";
import { writeAudit } from "@/modules/platform/audit";
import { UserError } from "@/modules/platform/errors";
import { notifyRole } from "@/modules/platform/notify";
import { seoulDate } from "@/modules/platform/time";
import { issueInstruction } from "@/modules/task/service";
import { SEED_DOCS } from "./doc-seed";
import { goalText } from "./qms-rules";
import {
  CONTEXT_AREAS,
  DEFAULT_PARTIES,
  isDocKind,
  nextRev,
  REVIEW_INPUTS,
  type ReviewInputKey,
} from "./qms-rules";
import { goalYear } from "./goals";
import { createRisk, riskStats } from "./risk";

export class QmsError extends UserError {}
type Actor = { id: string; roles: Role[] };
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const clean = (s: string | null | undefined) => (s ?? "").trim();
const yearSpan = (y: number) => ({
  from: `${y}-01-01`,
  to: `${y}-12-31`,
  start: new Date(`${y}-01-01T00:00:00+09:00`),
  end: new Date(`${y}-12-31T23:59:59.999+09:00`),
});

// ───────────────────────── F-Q-01 조직 상황·이해관계자

export type Issue = {
  area: string;
  issue: string;
  impact: string;
  action: string;
  riskId?: string | null;
  riskNo?: string | null;
};
export type Party = {
  party: string;
  needs: string;
  check: string;
  std: string;
};

/** 그 해 검토표. 없으면 지난해 표를 불러온 초안(저장 전), 지난해도 없으면 양식의 기본 칸 */
export async function contextFor(
  db: Db,
  year: number,
): Promise<{
  row: typeof contextReview.$inferSelect | null;
  draft: { issues: Issue[]; parties: Party[]; note: string };
  from: string | null;
}> {
  const [row] = await db
    .select()
    .from(contextReview)
    .where(eq(contextReview.year, year));
  if (row)
    return {
      row,
      draft: { issues: row.issues, parties: row.parties, note: row.note ?? "" },
      from: row.importedFrom ? `${row.importedFrom}년 검토표` : null,
    };
  const [prev] = await db
    .select()
    .from(contextReview)
    .where(eq(contextReview.year, year - 1));
  if (prev)
    return {
      row: null,
      draft: {
        issues: prev.issues.map((i) => ({
          ...i,
          riskId: i.riskId ?? null,
          riskNo: i.riskNo ?? null,
        })),
        parties: prev.parties,
        note: "",
      },
      from: `${year - 1}년 검토표`,
    };
  return {
    row: null,
    draft: {
      issues: CONTEXT_AREAS.map((area) => ({
        area,
        issue: "",
        impact: "",
        action: "",
      })),
      parties: DEFAULT_PARTIES.map((p) => ({ ...p })),
      note: "",
    },
    from: null,
  };
}

/** 저장(대표). confirm 이면 승인까지. 승인한 해는 고치지 않는다 */
export async function saveContext(
  db: Db,
  actor: Actor,
  year: number,
  input: { issues: Issue[]; parties: Party[]; note: string },
  confirm: boolean,
  now = new Date(),
) {
  if (!can(actor, "qms.context"))
    throw new QmsError("조직 상황 검토는 대표가 합니다");
  if (!Number.isInteger(year) || year < 2020 || year > 2100)
    throw new QmsError("연도를 확인해 주세요");
  const [row] = await db
    .select()
    .from(contextReview)
    .where(eq(contextReview.year, year));
  if (row?.status === "confirmed")
    throw new QmsError(
      "승인한 검토표는 고치지 않습니다. 바뀐 것은 내년 검토표에 적습니다",
    );
  const issues = input.issues
    .map((i) => ({
      area: clean(i.area),
      issue: clean(i.issue),
      impact: clean(i.impact),
      action: clean(i.action),
      riskId: i.riskId ?? null,
      riskNo: i.riskNo ?? null,
    }))
    .filter((i) => i.issue);
  const parties = input.parties
    .map((p) => ({
      party: clean(p.party),
      needs: clean(p.needs),
      check: clean(p.check),
      std: clean(p.std),
    }))
    .filter((p) => p.party);
  if (confirm) {
    if (!issues.length) throw new QmsError("이슈를 하나 이상 적어 주세요");
    const noImpact = issues.find((i) => !i.impact);
    if (noImpact)
      throw new QmsError(
        `'${noImpact.issue}'이(가) 우리에게 주는 영향을 적어 주세요`,
      );
    const noNeeds = parties.find((p) => !p.needs);
    if (noNeeds)
      throw new QmsError(
        `이해관계자 '${noNeeds.party}'의 요구·기대를 적어 주세요`,
      );
  }
  const prevYear = row
    ? row.importedFrom
    : (
          await db
            .select({ y: contextReview.year })
            .from(contextReview)
            .where(eq(contextReview.year, year - 1))
        ).length
      ? year - 1
      : null;
  const values = {
    issues,
    parties,
    note: clean(input.note) || null,
    savedBy: actor.id,
    savedAt: now,
    importedFrom: prevYear,
    ...(confirm
      ? { status: "confirmed", confirmedBy: actor.id, confirmedAt: now }
      : {}),
  };
  if (row)
    await db
      .update(contextReview)
      .set(values)
      .where(eq(contextReview.year, year));
  else await db.insert(contextReview).values({ year, ...values });
  await writeAudit(db, {
    actorId: actor.id,
    action: confirm ? "context.confirm" : "context.save",
    entityType: "context_review",
    entityId: String(year),
    after: { issues: issues.length, parties: parties.length },
  });
}

/** 영향이 큰 이슈를 리스크·기회 대장(F-Q-03)에 올리고 표에 번호를 남긴다 */
export async function contextToRisk(
  db: Db,
  actor: Actor,
  year: number,
  index: number,
  input: { kind: string; likelihood: number; impact: number },
  now = new Date(),
) {
  if (!can(actor, "qms.context"))
    throw new QmsError("조직 상황 검토는 대표가 합니다");
  const [row] = await db
    .select()
    .from(contextReview)
    .where(eq(contextReview.year, year));
  if (!row) throw new QmsError("검토표를 먼저 저장해 주세요");
  const it = row.issues[index];
  if (!it) throw new QmsError("없는 이슈입니다");
  if (it.riskId)
    throw new QmsError(`이미 리스크 대장 ${it.riskNo}에 올렸습니다`);
  const r = await createRisk(
    db,
    actor,
    {
      kind: input.kind,
      content: `${it.area}: ${it.issue}`,
      chapter: "Q 품질경영(총람)",
      likelihood: input.likelihood,
      impact: input.impact,
      control: it.action,
    },
    now,
    `F-Q-01 ${year}`,
  );
  const issues = row.issues.map((x, i) =>
    i === index ? { ...x, riskId: r.id, riskNo: r.docNo } : x,
  );
  await db
    .update(contextReview)
    .set({ issues })
    .where(eq(contextReview.year, year));
  return r.docNo;
}

export async function contextTodos(db: Db, actor: Actor, today: string) {
  if (!can(actor, "qms.context") || today.slice(5, 7) !== "12") return [];
  const y = Number(today.slice(0, 4));
  const [row] = await db
    .select({ s: contextReview.status })
    .from(contextReview)
    .where(eq(contextReview.year, y));
  if (row?.s === "confirmed") return [];
  return [
    {
      key: `context-${y}`,
      when: today >= `${y}-12-20` ? ("today" as const) : ("soon" as const),
      what: `${y}년 조직 상황·이해관계자 검토(F-Q-01)`,
      detail: "지난해 표를 불러와 바뀐 칸만 고칩니다",
      href: `/qms/context?year=${y}`,
      action: "검토하기",
    },
  ];
}

// ───────────────────────── F-Q-04 문서 목록

/** 표준서 장·부록 A 양식을 문서 목록에 처음 넣는다(있는 번호는 건너뜀) */
export async function seedDocs(db: Db, actor: Actor, now = new Date()) {
  if (!can(actor, "qms.docs"))
    throw new QmsError("문서 목록은 품질 담당·대표가 관리합니다");
  const have = new Set(
    (await db.select({ no: docRegister.no }).from(docRegister)).map(
      (r) => r.no,
    ),
  );
  const add = SEED_DOCS.filter((d) => !have.has(d.no));
  if (add.length)
    await db.insert(docRegister).values(
      add.map((d) => ({
        no: d.no,
        name: d.name,
        kind: d.kind,
        rev: "v0.2",
        owner: d.owner,
        location:
          d.kind === "std" ? "도움말 › 사내 표준서" : `앱 화면(${d.clause})`,
        updatedBy: actor.id,
        createdAt: now,
        updatedAt: now,
      })),
    );
  await writeAudit(db, {
    actorId: actor.id,
    action: "docs.seed",
    entityType: "doc_register",
    entityId: "seed",
    after: { added: add.length },
  });
  return add.length;
}

export type DocInput = {
  no: string;
  name: string;
  kind: string;
  rev: string;
  effectiveOn: string;
  owner: string;
  location: string;
  source: string;
  receivedOn: string;
  note: string;
};

/** 문서 등록·고치기(판은 여기서 바꾸지 않음. 표준서·양식의 판은 개정 요청서 승인으로만 오른다. 외부 문서는 새 판을 받으면 직접 바꿈) */
export async function saveDoc(
  db: Db,
  actor: Actor,
  id: string | null,
  input: DocInput,
  now = new Date(),
) {
  if (!can(actor, "qms.docs"))
    throw new QmsError("문서 목록은 품질 담당·대표가 관리합니다");
  const no = clean(input.no).toUpperCase();
  if (!no || !clean(input.name))
    throw new QmsError("문서 번호와 문서명을 적어 주세요");
  if (!isDocKind(input.kind)) throw new QmsError("구분을 골라 주세요");
  if (!clean(input.rev))
    throw new QmsError("현행 판을 적어 주세요(예: v0.2, 2026년판)");
  for (const d of [input.effectiveOn, input.receivedOn])
    if (d && !ISO.test(d)) throw new QmsError("날짜를 확인해 주세요");
  if (input.kind === "external" && !clean(input.source))
    throw new QmsError("외부 문서는 출처(제조사·기관)를 적어 주세요");
  const values = {
    no,
    name: clean(input.name),
    kind: input.kind,
    effectiveOn: input.effectiveOn || null,
    owner: clean(input.owner) || null,
    location: clean(input.location) || null,
    source: clean(input.source) || null,
    receivedOn: input.receivedOn || null,
    note: clean(input.note) || null,
    updatedBy: actor.id,
    updatedAt: now,
  };
  const [dup] = await db
    .select({ id: docRegister.id })
    .from(docRegister)
    .where(eq(docRegister.no, no));
  if (dup && dup.id !== id)
    throw new QmsError(`${no}은(는) 이미 목록에 있습니다`);
  if (id) {
    const [old] = await db
      .select()
      .from(docRegister)
      .where(eq(docRegister.id, id));
    if (!old) throw new QmsError("없는 문서입니다");
    const rev = clean(input.rev);
    const revChanged = rev !== old.rev;
    if (revChanged && old.kind !== "external")
      throw new QmsError(
        "표준서·지침서·양식의 판은 문서 개정 요청서(F-Q-05)가 승인되면 저절로 오릅니다",
      );
    const history = revChanged
      ? [
          ...old.history,
          {
            rev: old.rev,
            effectiveOn: old.effectiveOn,
            until: seoulDate(now),
            ref: `새 판 받음 ${input.receivedOn || seoulDate(now)}`,
          },
        ]
      : old.history;
    await db
      .update(docRegister)
      .set({ ...values, rev, history })
      .where(eq(docRegister.id, id));
    await writeAudit(db, {
      actorId: actor.id,
      action: "docs.edit",
      entityType: "doc_register",
      entityId: no,
      before: { rev: old.rev },
      after: { rev },
    });
    return id;
  }
  const [r] = await db
    .insert(docRegister)
    .values({ ...values, rev: clean(input.rev), createdAt: now })
    .returning({ id: docRegister.id });
  await writeAudit(db, {
    actorId: actor.id,
    action: "docs.add",
    entityType: "doc_register",
    entityId: no,
    after: { rev: clean(input.rev), kind: input.kind },
  });
  return r.id;
}

/** 폐지(현행에서 빼고 '폐기' 표시로 보관) */
export async function retireDoc(
  db: Db,
  actor: Actor,
  id: string,
  reason: string,
  now = new Date(),
) {
  if (!can(actor, "qms.docs"))
    throw new QmsError("문서 목록은 품질 담당·대표가 관리합니다");
  if (!clean(reason)) throw new QmsError("폐지 사유를 적어 주세요");
  const [d] = await db.select().from(docRegister).where(eq(docRegister.id, id));
  if (!d) throw new QmsError("없는 문서입니다");
  await db
    .update(docRegister)
    .set({
      status: "retired",
      note: [d.note, `폐지 ${seoulDate(now)}: ${clean(reason)}`]
        .filter(Boolean)
        .join("\n"),
      history: [
        ...d.history,
        {
          rev: d.rev,
          effectiveOn: d.effectiveOn,
          until: seoulDate(now),
          ref: `폐지: ${clean(reason)}`,
        },
      ],
      updatedBy: actor.id,
      updatedAt: now,
    })
    .where(eq(docRegister.id, id));
  await writeAudit(db, {
    actorId: actor.id,
    action: "docs.retire",
    entityType: "doc_register",
    entityId: d.no,
    after: { reason: clean(reason) },
  });
}

export async function listDocs(
  db: Db,
  f: "current" | "retired" | "all" = "current",
) {
  const rows = await db.select().from(docRegister).orderBy(docRegister.no);
  return f === "all" ? rows : rows.filter((r) => r.status === f);
}

export async function getDocEntry(db: Db, id: string) {
  const [d] = await db.select().from(docRegister).where(eq(docRegister.id, id));
  if (!d) throw new QmsError("없는 문서입니다");
  const reqs = (
    await db
      .select()
      .from(approvalDoc)
      .where(eq(approvalDoc.formCode, "F-Q-05"))
      .orderBy(desc(approvalDoc.createdAt))
  ).filter((x) => (x.data as { docId?: string }).docId === id);
  return { d, reqs };
}

/** 개정 요청서(F-Q-05)가 승인되면 그 문서의 판을 올린다(이전 판은 '폐기'로 history 에) */
export async function bumpRevisionOnConfirm(tx: Db, doc: DocRow) {
  const docId = (doc.data as { docId?: string }).docId;
  if (!docId || doc.cancelsId) return;
  const [d] = await tx
    .select()
    .from(docRegister)
    .where(eq(docRegister.id, docId));
  if (!d || d.status !== "current") return;
  const today = seoulDate(doc.confirmedAt ?? new Date());
  const rev = nextRev(d.rev);
  await tx
    .update(docRegister)
    .set({
      rev,
      effectiveOn: today,
      history: [
        ...d.history,
        {
          rev: d.rev,
          effectiveOn: d.effectiveOn,
          until: today,
          ref: doc.docNo,
        },
      ],
      updatedAt: new Date(),
    })
    .where(eq(docRegister.id, docId));
  await notifyRole(
    tx,
    "quality",
    `문서 개정 시행: ${d.no} ${d.name} ${d.rev} → ${rev}(${doc.docNo}). 구판은 폐기 표시하고 현장 사본을 바꾸세요`,
    `doc-rev-${d.no}-${rev}`,
    `/qms/docs/${d.id}`,
  );
}
onConfirmed("F-Q-05", bumpRevisionOnConfirm);

// ───────────────────────── F-Q-09 경영검토

export type ReviewInputs = Record<
  ReviewInputKey,
  { lines: string[]; links?: { label: string; href: string }[] }
>;

/** 경영검토 입력 자료를 앱 기록에서 모은다(그 해 1월 1일 ~ 오늘) */
export async function collectReviewInputs(
  db: Db,
  year: number,
  now = new Date(),
): Promise<ReviewInputs> {
  const s = yearSpan(year);
  const won = (n: number) => `${n.toLocaleString("ko-KR")}`;
  const [prev] = await db
    .select()
    .from(mgmtReview)
    .where(eq(mgmtReview.year, year - 1));
  const prevLines: string[] = [];
  if (prev) {
    const ids = prev.actions
      .map((a) => a.instructionId)
      .filter((x): x is string => !!x);
    const tasks = ids.length
      ? await db
          .select({
            i: instructionTask.instructionId,
            status: instructionTask.result,
          })
          .from(instructionTask)
          .where(inArray(instructionTask.instructionId, ids))
      : [];
    for (const a of prev.actions) {
      const st = a.instructionId
        ? tasks.filter((t) => t.i === a.instructionId)
        : [];
      prevLines.push(
        `${a.task} — ${!a.instructionId ? "지시 안 함" : st.length && st.every((t) => t.status === "done") ? "완료" : "진행 중"}${a.instructionNo ? ` (${a.instructionNo})` : ""}`,
      );
    }
    if (!prev.actions.length)
      prevLines.push("지난 검토에 개선 과제가 없었습니다");
  } else prevLines.push("지난해 경영검토서가 없습니다(첫해)");

  const [ctx] = await db
    .select()
    .from(contextReview)
    .where(eq(contextReview.year, year));
  const ctxLines = ctx
    ? [
        `이슈 ${ctx.issues.length}건 · 이해관계자 ${ctx.parties.length}곳 · ${ctx.status === "confirmed" ? "승인함" : "작성 중"}`,
        ...ctx.issues
          .slice(0, 6)
          .map(
            (i) => `${i.area}: ${i.issue}${i.riskNo ? ` → ${i.riskNo}` : ""}`,
          ),
      ]
    : [`${year}년 조직 상황 검토표가 아직 없습니다`];

  const gy = await goalYear(db, year, now);
  const goalLines = gy.rows.map((r) => {
    const last = [...r.months].reverse().find((m) => m && m.value != null);
    return `${r.label}: 목표 ${r.dir === "lower" ? "이하" : "이상"} ${goalText(r.key, r.target)} · 달성 ${r.okMonths}/${r.judgedMonths}개월${last ? ` · 최근 ${goalText(r.key, last.value)}` : ""}`;
  });

  const sv = await db
    .select({ scores: survey.scores })
    .from(survey)
    .where(and(gte(survey.answeredAt, s.start), lte(survey.answeredAt, s.end)));
  const means = sv
    .map((x) => x.scores ?? [])
    .filter((x) => x.length)
    .map((x) => x.reduce((a, b) => a + b, 0) / x.length);
  const cps = await db
    .select()
    .from(complaint)
    .where(
      and(gte(complaint.receivedAt, s.start), lte(complaint.receivedAt, s.end)),
    );
  const custLines = [
    `설문 답 ${means.length}건 · 평균 ${means.length ? (means.reduce((a, b) => a + b, 0) / means.length).toFixed(2) : "—"}점`,
    `불만 ${cps.length}건 · 종결 ${cps.filter((c) => c.closedAt).length}건 · 보증 수리 ${cps.filter((c) => c.resolution === "warranty_repair").length}건 · 보상 ${won(cps.reduce((a, c) => a + (c.compApprovedAt ? (c.compWon ?? 0) : 0), 0))}원`,
  ];

  const ncs = await db
    .select()
    .from(nonconformance)
    .where(
      and(
        gte(nonconformance.occurredAt, s.start),
        lte(nonconformance.occurredAt, s.end),
      ),
    );
  const bySrc = new Map<string, number>();
  for (const n of ncs) bySrc.set(n.source, (bySrc.get(n.source) ?? 0) + 1);
  const ncLines = [
    `부적합 ${ncs.length}건 · 종결 ${ncs.filter((n) => n.status === "closed").length}건 · 중대 ${ncs.filter((n) => n.major).length}건`,
    [...bySrc.entries()].map(([k, v]) => `${k} ${v}`).join(" · ") ||
      "출처별 없음",
  ];

  const audits = await db
    .select()
    .from(internalAudit)
    .where(eq(internalAudit.year, year));
  const finds = audits.length
    ? await db
        .select()
        .from(auditFinding)
        .where(
          inArray(
            auditFinding.auditId,
            audits.map((a) => a.id),
          ),
        )
    : [];
  const auditLines = audits.length
    ? [
        `심사 ${audits.length}회(${audits.map((a) => `${a.docNo} ${a.status === "approved" ? "승인" : a.status}`).join(", ")})`,
        `확인 ${finds.length}건 · 지적 ${finds.filter((f) => f.verdict !== "ok").length}건`,
      ]
    : [`${year}년 내부심사 기록이 없습니다`];

  const [ev] = await db
    .select()
    .from(legalEvalYear)
    .where(eq(legalEvalYear.year, year));
  const evs = await db
    .select({ result: legalEvent.result })
    .from(legalEvent)
    .where(and(eq(legalEvent.kind, "eval"), eq(legalEvent.year, year)));
  const legalLines = [
    `준수 ${evs.filter((e) => e.result === "ok").length} · 미흡 ${evs.filter((e) => e.result === "lacking").length} · 대상 아님 ${evs.filter((e) => e.result === "na").length}`,
    ev?.confirmedAt
      ? `대표 확정 · ${ev.summary ?? ""}`
      : "연간 준수 평가 확정 전",
  ];

  const rs = await riskStats(db, now);
  const riskLines = [
    `관리 중 ${rs.open} · 대응 중 ${rs.acting}(기한 지남 ${rs.late}) · ${rs.threshold}점 이상 ${rs.high} · 대응 끝 ${rs.done}`,
  ];

  const se = await db
    .select()
    .from(supplierEval)
    .where(eq(supplierEval.year, year));
  const supLines = se.length
    ? [
        `평가 ${se.length}건 · 평균 ${(se.reduce((a, x) => a + x.total, 0) / se.length).toFixed(1)}점 · 70점 미만 ${se.filter((x) => x.total < 70).length}건`,
      ]
    : [`${year}년 협력업체 평가 기록이 없습니다`];

  const inc = await db
    .select()
    .from(incident)
    .where(
      and(gte(incident.occurredAt, s.start), lte(incident.occurredAt, s.end)),
    );
  const safetyLines = [
    `사고·아차사고 ${inc.length}건 · 아차사고 ${inc.filter((i) => i.kind === "near").length} · 휴업 이상 ${inc.filter((i) => i.severity === "lost_time" || i.severity === "serious").length}`,
  ];

  const ws = await db
    .select()
    .from(wasteLog)
    .where(and(gte(wasteLog.on, s.from), lte(wasteLog.on, s.to)));
  const envLines = [
    `폐기물 기록 ${ws.length}건`,
    ...[...new Set(ws.map((w) => w.kind))].map(
      (k) =>
        `${k}: ${ws.filter((w) => w.kind === k).reduce((a, w) => a + w.qty, 0)}`,
    ),
  ];

  const fl = await db
    .select()
    .from(equipmentFailure)
    .where(
      and(
        gte(equipmentFailure.occurredAt, s.start),
        lte(equipmentFailure.occurredAt, s.end),
      ),
    );
  const pms = await db
    .select()
    .from(pmTask)
    .where(
      and(
        gte(pmTask.dueOn, s.from),
        lte(pmTask.dueOn, seoulDate(now) < s.to ? seoulDate(now) : s.to),
      ),
    );
  const eqLines = [
    `고장 ${fl.length}건 · 정지 ${(fl.reduce((a, f) => a + (f.downMinutes ?? 0), 0) / 60).toFixed(1)}시간 · 수리비 ${won(fl.reduce((a, f) => a + (f.cost ?? 0), 0))}원`,
    `예방정비 ${pms.length}건 중 기한 안 실시 ${pms.filter((p) => p.doneOn && p.doneOn <= p.dueOn).length}건`,
  ];

  return {
    prev: {
      lines: prevLines,
      links: prev
        ? [
            {
              label: `${year - 1}년 경영검토서`,
              href: `/qms/review?year=${year - 1}`,
            },
          ]
        : [],
    },
    context: {
      lines: ctxLines,
      links: [{ label: "조직 상황 검토표", href: `/qms/context?year=${year}` }],
    },
    goals: {
      lines: goalLines,
      links: [{ label: "품질목표 관리표", href: `/qms/goals?year=${year}` }],
    },
    customer: {
      lines: custLines,
      links: [{ label: "만족도·불만", href: "/complaints" }],
    },
    nc: { lines: ncLines, links: [{ label: "부적합", href: "/nc" }] },
    audit: {
      lines: auditLines,
      links: [{ label: "내부 심사", href: "/audits" }],
    },
    legal: {
      lines: legalLines,
      links: [{ label: "법규 준수 평가", href: `/legal/eval?year=${year}` }],
    },
    risk: {
      lines: riskLines,
      links: [{ label: "리스크·기회", href: "/risks" }],
    },
    supplier: {
      lines: supLines,
      links: [{ label: "협력업체", href: "/suppliers" }],
    },
    safety: {
      lines: safetyLines,
      links: [{ label: "사고·아차사고", href: "/incidents" }],
    },
    env: {
      lines: envLines,
      links: [{ label: "환경 관리", href: "/environment" }],
    },
    equipment: {
      lines: eqLines,
      links: [{ label: "설비", href: "/equipment" }],
    },
  };
}

export async function reviewFor(db: Db, year: number, now = new Date()) {
  const [row] = await db
    .select()
    .from(mgmtReview)
    .where(eq(mgmtReview.year, year));
  const inputs =
    row?.status === "confirmed"
      ? (row.inputs as ReviewInputs)
      : await collectReviewInputs(db, year, now);
  return { row: row ?? null, inputs };
}

export type ReviewInput = {
  heldOn: string;
  attendees: string;
  comments: Record<string, string>;
  nextGoals: string;
  resources: string;
  actions: { task: string; assigneeId: string; dueOn: string }[];
};

/** 저장·확정(대표). 확정하면 입력 자료를 고정하고, 담당이 정해진 개선 과제는 업무지시로 내린다 */
export async function saveReview(
  db: Db,
  actor: Actor,
  year: number,
  input: ReviewInput,
  confirm: boolean,
  now = new Date(),
) {
  if (!can(actor, "qms.review")) throw new QmsError("경영검토는 대표가 합니다");
  const [row] = await db
    .select()
    .from(mgmtReview)
    .where(eq(mgmtReview.year, year));
  if (row?.status === "confirmed")
    throw new QmsError("확정한 경영검토서는 고치지 않습니다");
  if (input.heldOn && !ISO.test(input.heldOn))
    throw new QmsError("검토일을 확인해 주세요");
  const comments = Object.fromEntries(
    Object.keys(REVIEW_INPUTS)
      .map((k) => [k, clean(input.comments[k])])
      .filter(([, v]) => v),
  );
  const actions = input.actions
    .map((a) => ({
      task: clean(a.task),
      assigneeId: a.assigneeId || null,
      dueOn: a.dueOn || null,
    }))
    .filter((a) => a.task);
  for (const a of actions)
    if (a.dueOn && !ISO.test(a.dueOn))
      throw new QmsError(`'${a.task}'의 기한을 확인해 주세요`);
  let inputs: Record<string, unknown> = row?.inputs ?? {};
  let saved = actions.map((a) => ({
    ...a,
    instructionId: null as string | null,
    instructionNo: null as string | null,
  }));
  if (confirm) {
    if (!input.heldOn) throw new QmsError("검토한 날을 적어 주세요");
    const missing = (Object.keys(REVIEW_INPUTS) as ReviewInputKey[]).filter(
      (k) => !comments[k],
    );
    if (missing.length)
      throw new QmsError(
        `검토 의견이 빠진 항목이 ${missing.length}개 있습니다: ${missing.map((k) => REVIEW_INPUTS[k].label).join(", ")}`,
      );
    if (!clean(input.nextGoals))
      throw new QmsError(
        "다음 해 목표를 적어 주세요(품질목표를 그대로 두면 '그대로'라고)",
      );
    const today = seoulDate(now);
    for (const a of saved) {
      if (!a.assigneeId || a.assigneeId === actor.id) continue;
      const due = a.dueOn && a.dueOn >= today ? a.dueOn : null;
      if (!due)
        throw new QmsError(`'${a.task}'의 기한을 오늘 이후로 정해 주세요`);
      const r = await issueInstruction(
        db,
        actor,
        {
          title: `[경영검토 ${year}] ${a.task}`,
          assigneeIds: [a.assigneeId],
          dueOn: due,
          refType: "mgmt_review",
          refId: String(year),
          refLabel: `${year}년 경영검토서(F-Q-09)`,
        },
        now,
      );
      a.instructionId = r.id;
      a.instructionNo = r.docNo;
    }
    inputs = (await collectReviewInputs(db, year, now)) as unknown as Record<
      string,
      unknown
    >;
  }
  const values = {
    heldOn: input.heldOn || null,
    attendees: clean(input.attendees) || null,
    comments,
    nextGoals: clean(input.nextGoals) || null,
    resources: clean(input.resources) || null,
    actions: saved,
    inputs,
    savedBy: actor.id,
    savedAt: now,
    ...(confirm
      ? { status: "confirmed", confirmedBy: actor.id, confirmedAt: now }
      : {}),
  };
  if (row)
    await db.update(mgmtReview).set(values).where(eq(mgmtReview.year, year));
  else await db.insert(mgmtReview).values({ year, ...values });
  await writeAudit(db, {
    actorId: actor.id,
    action: confirm ? "review.confirm" : "review.save",
    entityType: "mgmt_review",
    entityId: String(year),
    after: { actions: saved.length },
  });
  return saved;
}

export async function mgmtReviewTodos(db: Db, actor: Actor, today: string) {
  if (!can(actor, "qms.review") || today.slice(5, 7) !== "12") return [];
  const y = Number(today.slice(0, 4));
  const [row] = await db
    .select({ s: mgmtReview.status })
    .from(mgmtReview)
    .where(eq(mgmtReview.year, y));
  if (row?.s === "confirmed") return [];
  return [
    {
      key: `mgmt-review-${y}`,
      when: today >= `${y}-12-20` ? ("today" as const) : ("soon" as const),
      what: `${y}년 경영검토(F-Q-09)`,
      detail:
        "앱이 모은 품질목표·불만·심사·법규·리스크 자료를 보고 다음 해 목표와 개선 과제를 정합니다",
      href: `/qms/review?year=${y}`,
      action: "검토하기",
    },
  ];
}

export async function staffOptions(db: Db) {
  return db
    .select({ id: appUser.id, name: appUser.name })
    .from(appUser)
    .where(eq(appUser.active, true))
    .orderBy(appUser.name);
}
