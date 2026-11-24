// 매달 나가는 돈 정기 결의(간소화 simple.recurring_expense, 대표 2026-11-24).
// 임차료·전기·통신·보험료처럼 매달 같은 곳에 나가는 돈을 대표가 한 번 등록(=한 번 승인)해 두면,
// 매달 '이번 달 결의 올리기' 한 번으로 지출 결의서를 쓰고, 금액이 지난번과 20% 안이면 대표 결재 단계는 등록 승인으로 갈음한다.
// 20% 넘게 다르거나 등록 승인이 1년 지났으면 지금처럼 결재를 받는다(연 1회 다시 확인). 결의서·결재 기록은 그대로 남는다.
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { appConfig, appUser, supplier } from "@/db/schema";
import { act, getDoc, stateOf } from "@/modules/approval/service";
import { activeStep } from "@/modules/approval/machine";
import { can } from "@/modules/auth/permissions";
import type { Role } from "@/modules/auth/roles";
import { writeAudit } from "@/modules/platform/audit";
import { UserError } from "@/modules/platform/errors";
import { loadPolicy } from "@/modules/platform/policy";
import { addDays, seoulDate } from "@/modules/platform/time";
import { createExpense } from "./expense";
import { isEvidenceKind, isExpCategory, isExpPayMethod } from "./rules";

export class RecurringError extends UserError {}
type Actor = { id: string; roles: Role[] };

export type Recurring = {
  id: string;
  category: string;
  supplierId: string | null;
  payeeName: string;
  purpose: string;
  supplyWon: number;
  vatWon: number;
  evidenceKind: string;
  payMethod: string;
  /** 매달 낼 날(1~28) */
  day: number;
  /** 등록 승인(대표)과 날짜. 1년 지나면 다시 확인 */
  approvedBy: string;
  approvedOn: string;
  /** 마지막으로 결의한 달·금액 */
  lastYm: string | null;
  lastWon: number | null;
};

const KEY = "recurring_expenses";
/** 지난번과 이만큼 넘게 다르면 다시 결재 */
export const RECUR_DIFF = 0.2;
const YEAR_DAYS = 365;

export async function listRecurring(db: Db): Promise<Recurring[]> {
  const [r] = await db.select({ data: appConfig.data }).from(appConfig).where(eq(appConfig.key, KEY));
  const items = (r?.data as { items?: unknown } | undefined)?.items;
  return Array.isArray(items) ? (items as Recurring[]) : [];
}

async function saveAll(db: Db, actorId: string, items: Recurring[], now: Date) {
  const data = { items };
  await db
    .insert(appConfig)
    .values({ key: KEY, data, updatedBy: actorId, updatedAt: now })
    .onConflictDoUpdate({ target: appConfig.key, set: { data, updatedBy: actorId, updatedAt: now } });
}

async function mustOn(db: Db, now: Date) {
  if ((await loadPolicy(db, seoulDate(now)))["simple.recurring_expense"] !== 1) throw new RecurringError("간소화 '매달 나가는 돈 정기 결의'가 꺼져 있습니다. 지출 결의서를 매달 새로 써 주세요");
}

export type RecurringInput = { category: string; supplierId: string; payeeName: string; purpose: string; supplyWon: number | null; vatWon: number | null; evidenceKind: string; payMethod: string; day: number };

/** 등록(=한 번 승인). 대표만. 같은 id면 고친다(다시 승인한 것으로 날짜가 바뀜) */
export async function saveRecurring(db: Db, actor: Actor, input: RecurringInput & { id?: string }, now = new Date()) {
  await mustOn(db, now);
  if (!actor.roles.includes("owner")) throw new RecurringError("정기 결의는 대표가 등록합니다(등록이 곧 승인)");
  if (!isExpCategory(input.category)) throw new RecurringError("지출 계정을 골라 주세요");
  if (!isEvidenceKind(input.evidenceKind)) throw new RecurringError("증빙 종류를 골라 주세요");
  if (!isExpPayMethod(input.payMethod)) throw new RecurringError("지급 방법을 골라 주세요");
  if (!Number.isInteger(input.day) || input.day < 1 || input.day > 28) throw new RecurringError("매달 낼 날은 1~28일 중에서 고릅니다");
  const supply = input.supplyWon ?? 0;
  const vat = input.vatWon ?? 0;
  if (supply <= 0 || vat < 0) throw new RecurringError("공급가를 적어 주세요(부가세가 없으면 0)");
  const purpose = input.purpose.trim();
  if (!purpose) throw new RecurringError("무엇에 매달 내는지 적어 주세요(예: 공장 임차료)");
  let payeeName = input.payeeName.trim();
  if (input.supplierId) {
    const [s] = await db.select({ name: supplier.name }).from(supplier).where(eq(supplier.id, input.supplierId));
    if (!s) throw new RecurringError("없는 협력업체입니다");
    payeeName = s.name;
  }
  if (!payeeName) throw new RecurringError("받는 곳을 고르거나 적어 주세요");
  const items = await listRecurring(db);
  const prev = input.id ? items.find((x) => x.id === input.id) : undefined;
  if (input.id && !prev) throw new RecurringError("없는 정기 결의입니다");
  const row: Recurring = {
    id: prev?.id ?? randomUUID(),
    category: input.category,
    supplierId: input.supplierId || null,
    payeeName,
    purpose,
    supplyWon: supply,
    vatWon: vat,
    evidenceKind: input.evidenceKind,
    payMethod: input.payMethod,
    day: input.day,
    approvedBy: actor.id,
    approvedOn: seoulDate(now),
    lastYm: prev?.lastYm ?? null,
    lastWon: prev?.lastWon ?? null,
  };
  await saveAll(db, actor.id, prev ? items.map((x) => (x.id === prev.id ? row : x)) : [...items, row], now);
  await writeAudit(db, { actorId: actor.id, action: "expense.recurring_save", entityType: "app_config", entityId: row.id, after: { purpose, payeeName, won: supply + vat, day: row.day } });
  return row.id;
}

export async function removeRecurring(db: Db, actor: Actor, id: string, now = new Date()) {
  if (!actor.roles.includes("owner")) throw new RecurringError("정기 결의는 대표가 정합니다");
  const items = await listRecurring(db);
  const x = items.find((r) => r.id === id);
  if (!x) throw new RecurringError("없는 정기 결의입니다");
  await saveAll(db, actor.id, items.filter((r) => r.id !== id), now);
  await writeAudit(db, { actorId: actor.id, action: "expense.recurring_remove", entityType: "app_config", entityId: id, before: { purpose: x.purpose, payeeName: x.payeeName } });
}

/** 이번 달 금액이 등록 승인으로 갈음되는가(지난번·등록 금액과 20% 안, 등록 승인 1년 안) */
export function coveredByRegistration(x: Recurring, amount: number, today: string) {
  if (addDays(x.approvedOn, YEAR_DAYS) < today) return { ok: false, why: "등록 승인이 1년 지나 다시 결재를 받습니다(연 1회 확인)" };
  const base = x.lastWon ?? x.supplyWon + x.vatWon;
  if (base > 0 && Math.abs(amount - base) > base * RECUR_DIFF) return { ok: false, why: `지난번(${base.toLocaleString("ko-KR")}원)과 20% 넘게 달라 다시 결재를 받습니다` };
  return { ok: true, why: "" };
}

/** 이번 달 결의 올리기. 금액은 이번 달 청구서대로 고칠 수 있다 */
export async function draftRecurring(db: Db, actor: Actor, id: string, input: { supplyWon: number | null; vatWon: number | null; evidenceOn: string }, now = new Date()) {
  await mustOn(db, now);
  if (!can(actor, "expense.draft")) throw new RecurringError("지출 결의서는 공장장·회계 담당·대표가 씁니다");
  const items = await listRecurring(db);
  const x = items.find((r) => r.id === id);
  if (!x) throw new RecurringError("없는 정기 결의입니다");
  const today = seoulDate(now);
  const ym = today.slice(0, 7);
  if (x.lastYm === ym) throw new RecurringError(`${x.purpose}은(는) 이번 달(${ym}) 결의를 이미 올렸습니다`);
  const supply = input.supplyWon ?? x.supplyWon;
  const vat = input.vatWon ?? x.vatWon;
  const dueOn = `${ym}-${String(x.day).padStart(2, "0")}`;
  const r = await createExpense(
    db,
    actor,
    {
      category: x.category,
      supplierId: x.supplierId ?? "",
      payeeName: x.payeeName,
      sourceKind: "none",
      sourceId: "",
      purpose: `${x.purpose} (${ym} 정기 결의)`,
      supplyWon: supply,
      vatWon: vat,
      evidenceKind: x.evidenceKind,
      evidenceNo: "",
      evidenceOn: input.evidenceOn,
      dueOn: dueOn < today ? today : dueOn,
      payMethod: x.payMethod,
      files: [],
    },
    now,
  );
  const cover = coveredByRegistration(x, supply + vat, today);
  let auto = 0;
  if (cover.ok) {
    // 결재선에 등록 승인한 사람(대표)의 단계가 오면 등록 승인으로 갈음한다. 다른 사람 단계(검토 등)는 그대로
    for (let i = 0; i < 5; i++) {
      const doc = await getDoc(db, r.approvalDocId);
      const step = activeStep(stateOf(doc));
      if (!step || !["review", "approve", "confirm"].includes(step.kind) || !step.candidates.includes(x.approvedBy)) break;
      const [u] = await db.select({ active: appUser.active }).from(appUser).where(eq(appUser.id, x.approvedBy));
      if (!u?.active) break;
      await act(db, r.approvalDocId, x.approvedBy, step.kind === "confirm" ? "confirm" : "approve", `정기 결의 — ${x.approvedOn} 등록 때 승인(간소화, 금액 지난번과 20% 안)`, now);
      auto++;
    }
  }
  await saveAll(db, actor.id, items.map((r2) => (r2.id === x.id ? { ...r2, lastYm: ym, lastWon: supply + vat } : r2)), now);
  await writeAudit(db, { actorId: actor.id, action: "expense.recurring_draft", entityType: "expense", entityId: r.docNo, after: { recurring: x.id, won: supply + vat, auto } });
  return { ...r, auto, why: cover.why };
}

/** 할 일: 이번 달 낼 날 3일 전부터 아직 결의 안 한 정기 지출 */
export async function recurringTodos(db: Db, actor: Actor, today: string) {
  if (!can(actor, "expense.draft")) return [];
  if ((await loadPolicy(db, today))["simple.recurring_expense"] !== 1) return [];
  const ym = today.slice(0, 7);
  const left = (await listRecurring(db)).filter((x) => x.lastYm !== ym && addDays(`${ym}-${String(x.day).padStart(2, "0")}`, -3) <= today);
  if (!left.length) return [];
  return [
    {
      key: `exp-recur-${ym}-${left.length}`,
      when: "today" as const,
      what: `정기 지출 결의 ${left.length}건(${ym})`,
      detail: left
        .slice(0, 3)
        .map((x) => x.purpose)
        .join(", "),
      href: "/money/expenses/recurring",
      action: "결의 올리기",
    },
  ];
}
