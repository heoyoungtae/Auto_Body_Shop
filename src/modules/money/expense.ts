// 지출 결의(F-12-01, STD-12 12.2)와 거래처 정산.
// 근거 전표(입고 끝난 발주서·수용한 외주 의뢰서)에서 업체·금액·세금계산서 번호를 불러오고, 전결 규정대로 결재한 뒤에만 지급한다.
// 업체 계좌로 보낼 때는 다른 사람이 전화로 확인한 계좌만 쓴다(계좌 바꿔치기 사기 방지).
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import type { Db } from "@/db/client";
import {
  appUser,
  approvalDoc,
  expense,
  outsourceJob,
  purchaseLine,
  purchaseOrder,
  supplier,
} from "@/db/schema";
import {
  createDraft,
  getDoc,
  submit,
  withdrawAndDiscard,
} from "@/modules/approval/service";
import { can } from "@/modules/auth/permissions";
import type { Role } from "@/modules/auth/roles";
import { writeAudit } from "@/modules/platform/audit";
import { UserError } from "@/modules/platform/errors";
import { notifyUser } from "@/modules/platform/notify";
import {
  DOC_TYPES,
  MAX_DOC_BYTES,
  sniffDoc,
  storeFile,
} from "@/modules/platform/storage";
import { seoulDate } from "@/modules/platform/time";
import { bankView } from "@/modules/purchase/supplier";
import { assertOpenMonth } from "./lock";
import {
  EVIDENCE_KINDS,
  EXP_CATEGORIES,
  EXP_PAY_METHODS,
  expStatus,
  isEvidenceKind,
  isExpCategory,
  isExpPayMethod,
  PO_KIND_CATEGORY,
  SOURCE_KINDS,
  vatOf,
  vatProblem,
  type ExpStatus,
} from "./rules";

export class ExpenseError extends UserError {}
type Actor = { id: string; roles: Role[] };
const ISO = /^\d{4}-\d{2}-\d{2}$/;
export const EXPENSE_FORM = "F-12-01";
const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;
const MAX_FILES = 5;

export type Upload = { name: string; bytes: Uint8Array };

/** 살아 있는 결의(취소·버림이 아닌 것). 근거 전표 하나에 여러 번 나눠 낼 수 있지만 합계는 근거 금액을 넘지 않는다 */
async function liveBySource(db: Db, sourceIds: string[]) {
  if (!sourceIds.length) return [];
  const rows = await db
    .select({ e: expense, docStatus: approvalDoc.status })
    .from(expense)
    .innerJoin(approvalDoc, eq(approvalDoc.id, expense.approvalDocId))
    .where(
      and(inArray(expense.sourceId, sourceIds), isNull(expense.cancelledAt)),
    );
  return rows
    .filter((r) => r.docStatus !== "cancelled" && r.docStatus !== "discarded")
    .map((r) => r.e);
}

export type Source = {
  kind: "po" | "outsource";
  id: string;
  docNo: string;
  supplierId: string | null;
  supplierName: string;
  category: string;
  /** 근거 금액(부가세 포함). 발주서가 일부 입고면 들어온 만큼 */
  totalWon: number;
  supplyWon: number;
  /** 이미 결의한 금액과 남은 금액 */
  usedWon: number;
  remainWon: number;
  invoiceNo: string | null;
  invoiceOn: string | null;
  on: string | null;
  partial: boolean;
};

/** 결의할 근거 전표: 입고 끝(또는 일부 입고)한 발주서, 결과를 수용한 외주 의뢰서. onlyOpen 이면 남은 금액이 있는 것만 */
export async function expenseSources(
  db: Db,
  onlyOpen = true,
): Promise<Source[]> {
  const pos = await db
    .select({ o: purchaseOrder, supplierName: supplier.name })
    .from(purchaseOrder)
    .leftJoin(supplier, eq(supplier.id, purchaseOrder.supplierId))
    .where(inArray(purchaseOrder.status, ["partial", "received"]));
  const lines = pos.length
    ? await db
        .select()
        .from(purchaseLine)
        .where(
          inArray(
            purchaseLine.orderId,
            pos.map((p) => p.o.id),
          ),
        )
    : [];
  const oss = await db
    .select({ j: outsourceJob, supplierName: supplier.name })
    .from(outsourceJob)
    .innerJoin(supplier, eq(supplier.id, outsourceJob.supplierId))
    .where(eq(outsourceJob.status, "accepted"));
  const used = await liveBySource(db, [
    ...pos.map((p) => p.o.id),
    ...oss.map((o) => o.j.id),
  ]);
  const usedOf = (id: string) =>
    used.filter((e) => e.sourceId === id).reduce((s, e) => s + e.amountWon, 0);
  const out: Source[] = [];
  for (const { o, supplierName } of pos) {
    const ls = lines.filter((l) => l.orderId === o.id);
    const got = ls.reduce(
      (s, l) => s + Math.max(0, l.receivedQty - l.rejectedQty) * l.unitWon,
      0,
    );
    const supply =
      o.status === "received" ? o.supplyWon : Math.min(o.supplyWon, got);
    const total = o.status === "received" ? o.totalWon : supply + vatOf(supply);
    const u = usedOf(o.id);
    out.push({
      kind: "po",
      id: o.id,
      docNo: o.docNo,
      supplierId: o.supplierId,
      supplierName: supplierName ?? "(업체 없음)",
      category: PO_KIND_CATEGORY[o.kind] ?? "parts",
      totalWon: total,
      supplyWon: supply,
      usedWon: u,
      remainWon: total - u,
      invoiceNo: o.invoiceNo,
      invoiceOn: o.invoiceOn,
      on: o.receivedAt ? seoulDate(o.receivedAt) : null,
      partial: o.status === "partial",
    });
  }
  for (const { j, supplierName } of oss) {
    const u = usedOf(j.id);
    const supply = Math.round(j.amountWon / 1.1);
    out.push({
      kind: "outsource",
      id: j.id,
      docNo: j.docNo,
      supplierId: j.supplierId,
      supplierName,
      category: "outsource",
      totalWon: j.amountWon,
      supplyWon: supply,
      usedWon: u,
      remainWon: j.amountWon - u,
      invoiceNo: null,
      invoiceOn: null,
      on: j.acceptedAt ? seoulDate(j.acceptedAt) : null,
      partial: false,
    });
  }
  return (onlyOpen ? out.filter((s) => s.remainWon > 0) : out).sort((a, b) =>
    (a.on ?? "").localeCompare(b.on ?? ""),
  );
}

export async function sourceOf(db: Db, kind: string, id: string) {
  if (kind !== "po" && kind !== "outsource") return null;
  return (
    (await expenseSources(db, false)).find(
      (s) => s.kind === kind && s.id === id,
    ) ?? null
  );
}

export type ExpenseInput = {
  category: string;
  supplierId: string;
  payeeName: string;
  sourceKind: string;
  sourceId: string;
  purpose: string;
  supplyWon: number | null;
  vatWon: number | null;
  evidenceKind: string;
  evidenceNo: string;
  evidenceOn: string;
  dueOn: string;
  payMethod: string;
  files: Upload[];
  /** 반려된 결의를 고쳐 다시 올릴 때 원래 결의(취소된다) */
  fromId?: string;
};

async function saveFiles(id: string, actor: Actor, files: Upload[], now: Date) {
  const out: { path: string; name: string; at: string; by: string }[] = [];
  for (const f of files) {
    if (f.bytes.length > MAX_DOC_BYTES)
      throw new ExpenseError(`${f.name}: 8MB가 넘습니다`);
    const type = sniffDoc(f.bytes);
    if (!type)
      throw new ExpenseError(
        `${f.name}: 사진(JPG·PNG·WEBP)이나 PDF만 붙입니다`,
      );
    const path = await storeFile(`exp/${id}`, f.bytes, DOC_TYPES[type]);
    out.push({
      path,
      name: f.name.slice(0, 120) || `증빙.${DOC_TYPES[type]}`,
      at: now.toISOString(),
      by: actor.id,
    });
  }
  return out;
}

/** 지출 결의서를 쓰고 바로 결재에 올린다. 승인자는 전결 규정(일반 지출)이 금액으로 정한다 */
export async function createExpense(
  db: Db,
  actor: Actor,
  input: ExpenseInput,
  now = new Date(),
) {
  if (!can(actor, "expense.draft"))
    throw new ExpenseError("지출 결의서는 공장장·회계 담당·대표가 씁니다");
  if (!isExpCategory(input.category))
    throw new ExpenseError("지출 계정을 골라 주세요");
  if (!isEvidenceKind(input.evidenceKind))
    throw new ExpenseError("증빙 종류를 골라 주세요");
  if (!isExpPayMethod(input.payMethod))
    throw new ExpenseError("지급 방법을 골라 주세요");
  if (input.dueOn && !ISO.test(input.dueOn))
    throw new ExpenseError("지급 예정일을 확인해 주세요");
  if (
    input.evidenceOn &&
    (!ISO.test(input.evidenceOn) || input.evidenceOn > seoulDate(now))
  )
    throw new ExpenseError("증빙 날짜는 오늘이나 그 전입니다");
  if (input.files.length > MAX_FILES)
    throw new ExpenseError(`증빙 파일은 ${MAX_FILES}개까지입니다`);
  const supply = input.supplyWon ?? 0;
  const vat = input.vatWon ?? 0;
  const vp = vatProblem(supply, vat);
  if (vp) throw new ExpenseError(vp);
  const amount = supply + vat;
  const purpose = input.purpose.trim();

  let src: Source | null = null;
  const sourceKind =
    input.sourceKind in SOURCE_KINDS ? input.sourceKind : "none";
  if (sourceKind !== "none") {
    src = await sourceOf(db, sourceKind, input.sourceId);
    if (!src)
      throw new ExpenseError(
        "근거 전표를 찾지 못했습니다. 발주서는 입고(검수)가 끝나야, 외주는 결과를 수용해야 결의합니다",
      );
    const remain =
      src.remainWon +
      (input.fromId
        ? ((
            await db
              .select({ a: expense.amountWon })
              .from(expense)
              .where(
                and(eq(expense.id, input.fromId), eq(expense.sourceId, src.id)),
              )
          )[0]?.a ?? 0)
        : 0);
    if (amount > remain + 10)
      throw new ExpenseError(
        `${src.docNo}의 남은 금액은 ${won(remain)}입니다(근거 ${won(src.totalWon)}, 이미 결의 ${won(src.usedWon)}). 더 많이 낼 수 없습니다`,
      );
  } else if (!purpose)
    throw new ExpenseError(
      "근거 전표가 없으면 무엇에 쓰는지 용도를 자세히 적어 주세요",
    );

  const supplierId = src?.supplierId ?? (input.supplierId || null);
  let payeeName = input.payeeName.trim();
  if (supplierId) {
    const [s] = await db
      .select()
      .from(supplier)
      .where(eq(supplier.id, supplierId));
    if (!s) throw new ExpenseError("없는 협력업체입니다");
    if (s.status === "stopped" && !src)
      throw new ExpenseError(`${s.name}은(는) 거래 중지 업체입니다`);
    payeeName = s.name;
  }
  if (!payeeName)
    throw new ExpenseError("받는 곳(업체·사람)을 고르거나 적어 주세요");
  const category = src ? input.category || src.category : input.category;
  const usePurpose = purpose || `${src!.docNo} ${SOURCE_KINDS[src!.kind]} 대금`;

  if (input.fromId)
    await cancelExpense(db, actor, input.fromId, "고쳐서 다시 올림", now, true);

  const catLabel = EXP_CATEGORIES[category as keyof typeof EXP_CATEGORIES];
  const doc = await createDraft(
    db,
    {
      formCode: EXPENSE_FORM,
      title: `${payeeName} ${catLabel} ${won(amount)}`,
      data: {
        amount,
        payee: payeeName,
        category: catLabel,
        purpose: usePurpose,
        source: src
          ? `${SOURCE_KINDS[src.kind]} ${src.docNo}`
          : SOURCE_KINDS.none,
        supply,
        vat,
        evidence: `${EVIDENCE_KINDS[input.evidenceKind]}${input.evidenceNo.trim() ? ` ${input.evidenceNo.trim()}` : ""}`,
        payMethod: EXP_PAY_METHODS[input.payMethod],
        dueOn: input.dueOn || null,
      },
      drafterId: actor.id,
    },
    now,
  );
  const [row] = await db
    .insert(expense)
    .values({
      docNo: doc.docNo,
      approvalDocId: doc.id,
      category,
      supplierId,
      payeeName,
      sourceKind,
      sourceId: src?.id ?? null,
      sourceNo: src?.docNo ?? null,
      purpose: usePurpose,
      supplyWon: supply,
      vatWon: vat,
      amountWon: amount,
      evidenceKind: input.evidenceKind,
      evidenceNo: input.evidenceNo.trim() || null,
      evidenceOn: input.evidenceOn || null,
      dueOn: input.dueOn || null,
      payMethod: input.payMethod,
      createdBy: actor.id,
    })
    .returning({ id: expense.id });
  if (input.files.length)
    await db
      .update(expense)
      .set({ files: await saveFiles(row.id, actor, input.files, now) })
      .where(eq(expense.id, row.id));
  // 발주서에 세금계산서가 아직 안 붙었으면 결의서의 계산서 번호를 붙인다(같은 값을 두 번 적지 않게)
  if (
    src?.kind === "po" &&
    !src.invoiceNo &&
    input.evidenceKind === "tax_invoice" &&
    input.evidenceNo.trim() &&
    input.evidenceOn
  ) {
    await db
      .update(purchaseOrder)
      .set({
        invoiceNo: input.evidenceNo.trim(),
        invoiceOn: input.evidenceOn,
        invoiceBy: actor.id,
        updatedAt: now,
      })
      .where(eq(purchaseOrder.id, src.id));
  }
  await submit(db, doc.id, actor.id, now);
  await writeAudit(db, {
    actorId: actor.id,
    action: "expense.create",
    entityType: "expense",
    entityId: doc.docNo,
    after: {
      payee: payeeName,
      category,
      amount,
      source: src?.docNo ?? null,
      evidence: input.evidenceKind,
    },
  });
  return { id: row.id, docNo: doc.docNo, approvalDocId: doc.id };
}

async function expRow(db: Db, id: string) {
  const [e] = await db.select().from(expense).where(eq(expense.id, id));
  if (!e) throw new ExpenseError("없는 지출 결의입니다");
  const doc = await getDoc(db, e.approvalDocId);
  return { e, doc, status: expStatus(doc.status, e.paidAt, e.cancelledAt) };
}

/** 증빙 붙이기·바꾸기(지급 전): 나중에 받은 세금계산서 등 */
export async function attachEvidence(
  db: Db,
  actor: Actor,
  id: string,
  input: {
    evidenceKind: string;
    evidenceNo: string;
    evidenceOn: string;
    files: Upload[];
  },
  now = new Date(),
) {
  const { e, status } = await expRow(db, id);
  if (e.createdBy !== actor.id && !can(actor, "expense.pay"))
    throw new ExpenseError("증빙은 결의서를 쓴 사람이나 회계 담당이 붙입니다");
  if (status === "paid" || status === "cancelled")
    throw new ExpenseError("지급했거나 취소한 결의서는 고치지 않습니다");
  if (!isEvidenceKind(input.evidenceKind))
    throw new ExpenseError("증빙 종류를 골라 주세요");
  if (
    input.evidenceOn &&
    (!ISO.test(input.evidenceOn) || input.evidenceOn > seoulDate(now))
  )
    throw new ExpenseError("증빙 날짜는 오늘이나 그 전입니다");
  if (e.files.length + input.files.length > MAX_FILES)
    throw new ExpenseError(`증빙 파일은 ${MAX_FILES}개까지입니다`);
  const files = [...e.files, ...(await saveFiles(id, actor, input.files, now))];
  await db
    .update(expense)
    .set({
      evidenceKind: input.evidenceKind,
      evidenceNo: input.evidenceNo.trim() || null,
      evidenceOn: input.evidenceOn || null,
      files,
      updatedAt: now,
    })
    .where(eq(expense.id, id));
  await writeAudit(db, {
    actorId: actor.id,
    action: "expense.evidence",
    entityType: "expense",
    entityId: e.docNo,
    after: {
      evidence: input.evidenceKind,
      no: input.evidenceNo.trim() || null,
      files: input.files.length,
    },
  });
}

/** 지급(회계): 결재가 끝나고 증빙이 있어야 한다. 업체 계좌 이체는 확인한 계좌로만 */
export async function payExpense(
  db: Db,
  actor: Actor,
  id: string,
  input: { paidOn: string; note: string },
  now = new Date(),
) {
  if (!can(actor, "expense.pay"))
    throw new ExpenseError("지급은 회계 담당·대표가 합니다");
  const { e, status } = await expRow(db, id);
  if (status === "paid") throw new ExpenseError("이미 지급했습니다");
  if (status !== "approved")
    throw new ExpenseError(
      "결재(승인)가 끝난 결의서만 지급합니다. 승인 없는 지급은 금지입니다(STD-12)",
    );
  if (e.evidenceKind === "pending")
    throw new ExpenseError(
      "증빙을 아직 받지 않았습니다. 세금계산서·영수증을 받아 붙인 뒤 지급하세요",
    );
  if (!e.evidenceNo && !e.files.length)
    throw new ExpenseError(
      "증빙 번호를 적거나 증빙 파일(사진·PDF)을 붙인 뒤 지급하세요",
    );
  const today = seoulDate(now);
  if (!ISO.test(input.paidOn) || input.paidOn > today)
    throw new ExpenseError("지급일을 확인해 주세요(오늘이나 그 전)");
  await assertOpenMonth(db, input.paidOn);
  let paidTo: string | null = null;
  if (e.payMethod === "transfer") {
    if (e.supplierId) {
      const [s] = await db
        .select()
        .from(supplier)
        .where(eq(supplier.id, e.supplierId));
      const b = s ? bankView(actor, s) : null;
      if (!b)
        throw new ExpenseError(
          `${e.payeeName}의 입금 계좌가 없습니다. 협력업체 화면에 통장 사본과 계좌를 먼저 넣어 주세요`,
        );
      if (!b.verified)
        throw new ExpenseError(
          `${e.payeeName}의 입금 계좌를 아직 확인하지 않았습니다. 업체 대표 번호로 전화해 확인한 뒤 지급하세요(계좌 바꿔치기 사기 방지)`,
        );
      paidTo = `${b.bankName} ${b.masked} ${b.holder}`;
    } else if (!input.note.trim())
      throw new ExpenseError(
        "어느 계좌로 보냈는지 메모에 적어 주세요(예: 임대인 국민은행 ***-1234)",
      );
  }
  await db
    .update(expense)
    .set({
      paidOn: input.paidOn,
      paidAt: now,
      paidBy: actor.id,
      paidTo,
      paidNote: input.note.trim() || null,
      updatedAt: now,
    })
    .where(eq(expense.id, id));
  await writeAudit(db, {
    actorId: actor.id,
    action: "expense.pay",
    entityType: "expense",
    entityId: e.docNo,
    after: { amount: e.amountWon, paidOn: input.paidOn, to: paidTo },
  });
  if (e.createdBy && e.createdBy !== actor.id)
    await notifyUser(
      db,
      e.createdBy,
      `지급함: ${e.docNo} ${e.payeeName} ${won(e.amountWon)}`,
      `exp-paid-${e.docNo}`,
      `/money/expenses/${id}`,
    );
}

/** 결의 취소(지급 전). 결재 중이면 쓴 사람이 회수한다 */
export async function cancelExpense(
  db: Db,
  actor: Actor,
  id: string,
  reason: string,
  now = new Date(),
  internal = false,
) {
  const { e, doc, status } = await expRow(db, id);
  if (e.createdBy !== actor.id && !can(actor, "expense.pay"))
    throw new ExpenseError(
      "취소는 결의서를 쓴 사람이나 회계 담당·대표가 합니다",
    );
  if (status === "paid")
    throw new ExpenseError(
      "지급한 결의서는 취소하지 않습니다. 돌려받으면 수입으로 따로 처리하세요",
    );
  if (status === "cancelled") throw new ExpenseError("이미 취소했습니다");
  if (!reason.trim()) throw new ExpenseError("취소 사유를 적어 주세요");
  if (internal && status !== "rejected" && status !== "draft")
    throw new ExpenseError("반려된 결의서만 고쳐 다시 올립니다");
  if (
    doc.status === "in_progress" ||
    doc.status === "draft" ||
    doc.status === "rejected"
  ) {
    if (doc.drafterId !== actor.id)
      throw new ExpenseError(
        "결재 중·반려된 결의서는 쓴 사람이 회수·취소합니다",
      );
    await withdrawAndDiscard(db, doc.id, actor.id, now);
  }
  await db
    .update(expense)
    .set({
      cancelledAt: now,
      cancelledBy: actor.id,
      cancelReason: reason.trim(),
      updatedAt: now,
    })
    .where(eq(expense.id, id));
  await writeAudit(db, {
    actorId: actor.id,
    action: "expense.cancel",
    entityType: "expense",
    entityId: e.docNo,
    after: { reason: reason.trim() },
  });
}

export type ExpenseFilter = "open" | "unpaid" | "paid" | "all";

/** 결의 목록. open: 결재 중·반려·지급 전, unpaid: 승인했는데 지급 전, paid: 지급함 */
export async function listExpenses(db: Db, f: ExpenseFilter = "open") {
  const rows = await db
    .select({ e: expense, docStatus: approvalDoc.status, by: appUser.name })
    .from(expense)
    .innerJoin(approvalDoc, eq(approvalDoc.id, expense.approvalDocId))
    .leftJoin(appUser, eq(appUser.id, expense.createdBy))
    .orderBy(desc(expense.createdAt));
  const all = rows.map((r) => ({
    ...r.e,
    byName: r.by ?? "",
    status: expStatus(r.docStatus, r.e.paidAt, r.e.cancelledAt),
  }));
  const keep: Record<ExpenseFilter, (s: ExpStatus) => boolean> = {
    open: (s) => s !== "paid" && s !== "cancelled",
    unpaid: (s) => s === "approved",
    paid: (s) => s === "paid",
    all: () => true,
  };
  return all.filter((r) => keep[f](r.status));
}

/** 결의서 한 장: 결재 문서·업체 계좌(가린 번호)·근거 전표 */
export async function getExpense(db: Db, actor: Actor, id: string) {
  const { e, doc, status } = await expRow(db, id);
  const [s] = e.supplierId
    ? await db.select().from(supplier).where(eq(supplier.id, e.supplierId))
    : [];
  const uids = [
    ...new Set(
      [e.createdBy, e.paidBy, e.cancelledBy].filter((x): x is string => !!x),
    ),
  ];
  const names = new Map(
    (uids.length
      ? await db
          .select({ id: appUser.id, name: appUser.name })
          .from(appUser)
          .where(inArray(appUser.id, uids))
      : []
    ).map((u) => [u.id, u.name]),
  );
  const nm = (x: string | null) => (x ? (names.get(x) ?? "?") : "");
  const src = e.sourceId ? await sourceOf(db, e.sourceKind, e.sourceId) : null;
  return {
    e,
    doc,
    status,
    bank: s ? bankView(actor, s) : null,
    supplierStatus: s?.status ?? null,
    src,
    createdByName: nm(e.createdBy),
    paidByName: nm(e.paidBy),
    cancelledByName: nm(e.cancelledBy),
  };
}

/** 거래처 정산: 업체마다 결의할 근거(아직 결의 안 한 금액)와 승인했는데 지급 안 한 금액 */
export async function payables(db: Db) {
  const sources = await expenseSources(db, true);
  const unpaid = await listExpenses(db, "unpaid");
  const pending = (await listExpenses(db, "open")).filter(
    (x) => x.status === "in_progress" || x.status === "draft",
  );
  const ids = [
    ...new Set(
      [
        ...sources.map((s) => s.supplierId),
        ...unpaid.map((u) => u.supplierId),
      ].filter((x): x is string => !!x),
    ),
  ];
  const sups = ids.length
    ? await db.select().from(supplier).where(inArray(supplier.id, ids))
    : [];
  const byKey = new Map<
    string,
    {
      supplierId: string | null;
      name: string;
      sources: Source[];
      unpaid: typeof unpaid;
      inApproval: number;
      bankVerified: boolean | null;
    }
  >();
  const slot = (sid: string | null, name: string) => {
    const k = sid ?? `name:${name}`;
    if (!byKey.has(k)) {
      const s = sups.find((x) => x.id === sid);
      byKey.set(k, {
        supplierId: sid,
        name: s?.name ?? name,
        sources: [],
        unpaid: [],
        inApproval: 0,
        bankVerified: s ? !!s.bankAccountEnc && !!s.bankVerifiedAt : null,
      });
    }
    return byKey.get(k)!;
  };
  for (const s of sources) slot(s.supplierId, s.supplierName).sources.push(s);
  for (const u of unpaid) slot(u.supplierId, u.payeeName).unpaid.push(u);
  for (const p of pending)
    if (byKey.has(p.supplierId ?? `name:${p.payeeName}`))
      slot(p.supplierId, p.payeeName).inApproval += p.amountWon;
  return [...byKey.values()]
    .map((g) => ({
      ...g,
      toDraft: g.sources.reduce((a, s) => a + s.remainWon, 0),
      toPay: g.unpaid.reduce((a, u) => a + u.amountWon, 0),
    }))
    .sort((a, b) => b.toDraft + b.toPay - (a.toDraft + a.toPay));
}

/** 내 할 일: 지급할 결의(회계), 결의할 근거 전표(결의 권한), 반려·증빙 못 받은 내 결의 */
export async function expenseTodos(db: Db, actor: Actor, today: string) {
  const out: {
    key: string;
    when: "late" | "today" | "soon";
    what: string;
    detail?: string;
    href: string;
    action: string;
  }[] = [];
  const open = await listExpenses(db, "open");
  if (can(actor, "expense.pay")) {
    for (const x of open.filter((r) => r.status === "approved")) {
      const when =
        x.dueOn && x.dueOn < today
          ? "late"
          : !x.dueOn || x.dueOn <= today
            ? "today"
            : "soon";
      out.push({
        key: `exp-pay-${x.id}`,
        when,
        what: `지급: ${x.docNo} ${x.payeeName} ${won(x.amountWon)}`,
        detail:
          x.evidenceKind === "pending"
            ? "증빙을 아직 못 받았습니다"
            : x.dueOn
              ? `지급 예정 ${x.dueOn}`
              : undefined,
        href: `/money/expenses/${x.id}`,
        action: "지급하기",
      });
    }
  }
  if (can(actor, "expense.draft")) {
    const srcs = await expenseSources(db, true);
    if (srcs.length)
      out.push({
        key: "exp-sources",
        when: "soon",
        what: `지출 결의할 전표 ${srcs.length}건(${won(srcs.reduce((a, s) => a + s.remainWon, 0))})`,
        detail: "입고 끝난 발주서·수용한 외주 의뢰서",
        href: "/money/payables",
        action: "거래처 정산",
      });
  }
  for (const x of open.filter((r) => r.createdBy === actor.id)) {
    if (x.status === "rejected")
      out.push({
        key: `exp-rej-${x.id}`,
        when: "today",
        what: `반려된 지출 결의: ${x.docNo} ${x.payeeName}`,
        href: `/money/expenses/${x.id}`,
        action: "고치기",
      });
    else if (x.status === "approved" && x.evidenceKind === "pending")
      out.push({
        key: `exp-evi-${x.id}`,
        when: "soon",
        what: `증빙 붙이기: ${x.docNo} ${x.payeeName}`,
        detail: "세금계산서·영수증을 받으면 붙여야 지급됩니다",
        href: `/money/expenses/${x.id}#evidence`,
        action: "증빙 붙이기",
      });
  }
  return out;
}

/** 증빙 파일은 결의 권한(공장장·회계·대표)만 본다 */
export const canSeeExpenseFile = (actor: Actor) =>
  can(actor, "expense.draft") || can(actor, "expense.pay");
