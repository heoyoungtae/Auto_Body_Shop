// 결재 서비스: 문서 만들기·상신·처리·취소. 상태 계산은 machine.ts, 사람 정하기는 line.ts.
import { UserError } from "@/modules/platform/errors";
import { and, desc, eq, gte, inArray, isNull, lte } from "drizzle-orm";
import type { Db } from "@/db/client";
import { approvalDoc, approvalEvent, notification, proxyAssignment } from "@/db/schema";
import { sha256 } from "../auth/crypto";
import { writeAudit } from "../platform/audit";
import { nextDocNo } from "../platform/docno";
import { seoulDate } from "../platform/time";
import { formDef, type FormCode } from "./forms";
import { buildLine } from "./line";
import { activeStep, initialState, transition, TransitionError, type DocState, type MachineEvent } from "./machine";
import type { DocumentFlag, DocumentStatus, ResolvedStep } from "./types";

export type DocRow = typeof approvalDoc.$inferSelect;
export type ActType = "approve" | "reject" | "confirm";

export class ApprovalError extends UserError {}
export { TransitionError };

type Hook = (tx: Db, doc: DocRow) => Promise<void>;
const confirmHooks = new Map<string, Hook[]>();

/** 양식별 확정 후처리(예: 취소 문서가 확정되면 원문서를 취소됨으로) */
export function onConfirmed(formCode: string, hook: Hook) {
  confirmHooks.set(formCode, [...(confirmHooks.get(formCode) ?? []), hook]);
}

const stateOf = (d: DocRow): DocState => ({
  status: d.status as DocumentStatus,
  steps: d.steps as ResolvedStep[],
  flags: d.flags as DocumentFlag[],
  revision: d.revision,
});

export async function getDoc(db: Db, id: string): Promise<DocRow> {
  const [d] = await db.select().from(approvalDoc).where(eq(approvalDoc.id, id));
  if (!d) throw new ApprovalError("문서가 없습니다");
  return d;
}

export async function createDraft(
  db: Db,
  input: { formCode: FormCode; title: string; data: Record<string, unknown>; drafterId: string; cancelsId?: string | null },
  now = new Date(),
): Promise<DocRow> {
  const form = formDef(input.formCode);
  if (!input.title.trim()) throw new ApprovalError("제목을 적어 주세요");
  const { steps, flags } = await buildLine(db, form.steps, input.drafterId, input.data);
  const state = initialState(steps, flags);
  return db.transaction(async (tx) => {
    const docNo = await nextDocNo(tx, form.prefix, now);
    const [doc] = await tx
      .insert(approvalDoc)
      .values({
        docNo,
        formCode: form.code,
        title: input.title.trim(),
        status: state.status,
        steps: state.steps,
        flags: state.flags,
        data: input.data,
        drafterId: input.drafterId,
        cancelsId: input.cancelsId ?? null,
      })
      .returning();
    await tx.insert(approvalEvent).values({ docId: doc.id, actorId: input.drafterId, type: "created" });
    return doc;
  });
}

/** 기안자가 상신. 결재선은 상신 시점에 다시 푼다(그사이 역할·전결표가 바뀌었을 수 있음) */
export async function submit(db: Db, docId: string, actorId: string, now = new Date()) {
  const doc = await getDoc(db, docId);
  if (doc.drafterId !== actorId) throw new ApprovalError("기안자만 상신할 수 있습니다");
  if (doc.status !== "draft" && doc.status !== "rejected") throw new ApprovalError("상신할 수 없는 상태입니다");
  const form = formDef(doc.formCode as FormCode);
  const { steps, flags } = await buildLine(db, form.steps, actorId, doc.data as Record<string, unknown>);
  const prev = stateOf(doc);
  const base: DocState = { ...prev, steps, flags };
  const cmd = prev.status === "rejected" ? ({ type: "resubmit", actorId } as const) : ({ type: "submit", actorId } as const);
  return apply(db, doc, base, cmd, actorId, null, now);
}

/** 결재 처리. 담당자가 아니면 오늘 유효한 대리 지정이 있는지 본다 */
export async function act(db: Db, docId: string, actorId: string, type: ActType, comment: string | null = null, now = new Date()) {
  const doc = await getDoc(db, docId);
  const state = stateOf(doc);
  const step = activeStep(state);
  if (!step) throw new ApprovalError("처리할 단계가 없습니다");
  if (type === "reject" && !comment?.trim()) throw new ApprovalError("반려 사유를 적어 주세요");
  let onBehalfOf: string | undefined;
  if (!step.candidates.includes(actorId)) {
    const principals = await principalsFor(db, actorId, seoulDate(now));
    onBehalfOf = principals.find((p) => step.candidates.includes(p) && !step.doneBy.includes(p));
    if (!onBehalfOf) throw new ApprovalError("이 단계의 담당자가 아닙니다");
  }
  return apply(db, doc, state, { type, actorId, onBehalfOf }, actorId, comment, now, onBehalfOf);
}

/** 확정 문서를 고치려면 취소 문서를 결재로 올린다(8.1). 확정되면 원문서가 취소됨으로 바뀐다 */
export async function requestCancel(db: Db, docId: string, actorId: string, reason: string, now = new Date()) {
  const target = await getDoc(db, docId);
  if (target.status !== "confirmed" && target.status !== "checked") throw new ApprovalError("확정된 문서만 취소할 수 있습니다");
  if (!reason.trim()) throw new ApprovalError("취소 사유를 적어 주세요");
  const draft = await createDraft(
    db,
    {
      formCode: target.formCode as FormCode,
      title: `[취소] ${target.docNo} ${target.title}`,
      data: { kind: "cancel", targetDocNo: target.docNo, reason: reason.trim() },
      drafterId: actorId,
      cancelsId: target.id,
    },
    now,
  );
  return submit(db, draft.id, actorId, now);
}

async function principalsFor(db: Db, proxyId: string, today: string): Promise<string[]> {
  const rows = await db
    .select({ principalId: proxyAssignment.principalId })
    .from(proxyAssignment)
    .where(and(eq(proxyAssignment.proxyId, proxyId), lte(proxyAssignment.fromDate, today), gte(proxyAssignment.toDate, today)));
  return rows.map((r) => r.principalId);
}

async function apply(
  db: Db,
  doc: DocRow,
  state: DocState,
  cmd: Parameters<typeof transition>[1],
  actorId: string,
  comment: string | null,
  now: Date,
  onBehalfOf?: string,
): Promise<DocRow> {
  let result: { state: DocState; events: MachineEvent[] };
  try {
    result = transition(state, cmd);
  } catch (e) {
    if (e instanceof TransitionError) throw new ApprovalError(e.message);
    throw e;
  }
  const { state: next, events } = result;
  return db.transaction(async (tx) => {
    const confirmed = events.some((e) => e.type === "confirmed");
    const [row] = await tx
      .update(approvalDoc)
      .set({
        status: next.status,
        steps: next.steps,
        flags: next.flags,
        revision: next.revision,
        updatedAt: now,
        ...(confirmed ? { confirmedAt: now, contentHash: contentHash(doc, next) } : {}),
      })
      // 동시에 두 사람이 누르면 늦은 쪽은 실패한다
      .where(and(eq(approvalDoc.id, doc.id), eq(approvalDoc.updatedAt, doc.updatedAt)))
      .returning();
    if (!row) throw new ApprovalError("다른 사람이 먼저 처리했습니다. 화면을 새로 고쳐 주세요");
    await tx.insert(approvalEvent).values({ docId: doc.id, actorId, onBehalfOf: onBehalfOf ?? null, type: cmd.type, comment });
    await writeAudit(tx, { actorId, action: `approval.${cmd.type}`, entityType: "approval_doc", entityId: doc.docNo, before: { status: doc.status }, after: { status: next.status } });
    for (const e of events) {
      if (e.type === "step_activated" && e.kind !== "draft") {
        await notify(tx, e.candidates, `결재 요청: ${doc.docNo} ${doc.title}`, `/approvals/${doc.id}`);
      }
      if (e.type === "rejected" && doc.drafterId) await notify(tx, [doc.drafterId], `반려됨: ${doc.docNo}`, `/approvals/${doc.id}`);
    }
    if (confirmed) {
      if (doc.drafterId) await notify(tx, [doc.drafterId], `확정됨: ${doc.docNo}`, `/approvals/${doc.id}`);
      if (row.cancelsId) await cancelTarget(tx, row, actorId, now);
      for (const h of confirmHooks.get(row.formCode) ?? []) await h(tx, row);
    }
    return row;
  });
}

async function cancelTarget(tx: Db, cancelDoc: DocRow, actorId: string, now: Date) {
  const target = await getDoc(tx, cancelDoc.cancelsId as string);
  const { state } = transition(stateOf(target), { type: "cancel" });
  await tx.update(approvalDoc).set({ status: state.status, updatedAt: now }).where(eq(approvalDoc.id, target.id));
  await tx.insert(approvalEvent).values({ docId: target.id, actorId, type: "cancelled", comment: `취소 문서 ${cancelDoc.docNo}` });
}

function contentHash(doc: DocRow, state: DocState): string {
  return sha256(JSON.stringify({ docNo: doc.docNo, formCode: doc.formCode, title: doc.title, data: doc.data, steps: state.steps }));
}

async function notify(tx: Db, userIds: string[], title: string, link: string) {
  if (!userIds.length) return;
  await tx.insert(notification).values(userIds.map((userId) => ({ userId, title, link })));
}

/** 결재함: 지금 내가(또는 내가 대리하는 사람이) 처리할 문서 */
export async function inbox(db: Db, userId: string, now = new Date()): Promise<DocRow[]> {
  const me = [userId, ...(await principalsFor(db, userId, seoulDate(now)))];
  const rows = await db.select().from(approvalDoc).where(inArray(approvalDoc.status, ["in_progress", "confirmed"])).orderBy(desc(approvalDoc.updatedAt));
  return rows.filter((d) => {
    const s = activeStep(stateOf(d));
    return !!s && s.candidates.some((c) => me.includes(c) && !s.doneBy.includes(c));
  });
}

export async function myDrafts(db: Db, userId: string): Promise<DocRow[]> {
  return db.select().from(approvalDoc).where(eq(approvalDoc.drafterId, userId)).orderBy(desc(approvalDoc.updatedAt)).limit(50);
}

export async function events(db: Db, docId: string) {
  return db.select().from(approvalEvent).where(eq(approvalEvent.docId, docId)).orderBy(approvalEvent.id);
}

/**
 * 확정된 문서 개정 요청서(F-Q-05) — 설정 화면이 '근거 번호' 목록과 값 불러오기에 쓴다(중복 입력 없이).
 * 취소 문서와 이미 취소된 요청서는 뺀다.
 */
export async function confirmedRevisionRequests(db: Db): Promise<DocRow[]> {
  return db
    .select()
    .from(approvalDoc)
    .where(and(eq(approvalDoc.formCode, "F-Q-05"), inArray(approvalDoc.status, ["confirmed", "checked"]), isNull(approvalDoc.cancelsId)))
    .orderBy(desc(approvalDoc.confirmedAt));
}

/** 설정 변경의 근거 번호 검사: 비었으면 통과, 적었으면 확정된 요청서여야 한다 */
export async function assertRevisionRequestNo(db: Db, no: string | null | undefined): Promise<void> {
  if (!no) return;
  const list = await confirmedRevisionRequests(db);
  if (!list.some((d) => d.docNo === no)) throw new ApprovalError(`근거 번호 ${no}: 확정된 문서 개정 요청서가 아닙니다. 목록에서 골라 주세요`);
}
