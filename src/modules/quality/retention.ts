// 보존·파기(STD-Q 8절, 부록 A 보존 기간, 2026-11-21 대표 결정): 양식별 보존 기간이 지난 기록을 세고,
// 지울 수 있는 기록(문서 수발신 대장·3정5S 일일 점검)은 파기 결재(REC-PURGE, 대표 승인)를 거쳐 지운다.
// 다른 대장(수리·견적·전표 등)은 서로 이어져 있어(수리→견적→입금→세금) 지금은 세어 보이기만 한다.
import { and, eq, inArray, lt } from "drizzle-orm";
import type { Db } from "@/db/client";
import { approvalDoc, corrDoc, fiveSDaily } from "@/db/schema";
import { can } from "@/modules/auth/permissions";
import type { Role } from "@/modules/auth/roles";
import { act, createDraft, onConfirmed, submit, type DocRow } from "@/modules/approval/service";
import { runList, type Q } from "@/modules/listq/core";
import { LISTS } from "@/modules/listq/registry";
import { writeAudit } from "@/modules/platform/audit";
import { UserError } from "@/modules/platform/errors";
import { removeStored } from "@/modules/platform/storage";
import { seoulDate } from "@/modules/platform/time";

export class RetentionError extends UserError {}
type Actor = { id: string; roles: Role[] };

/** 보존 기간(년)이 정해진 대장: 목록 key → 양식·보존 연수·근거. 첫째 날짜 칸(접수일·입고일 등)부터 센다 */
export const RETENTION: { list: string; form: string; name: string; years: number; basis: string; purge?: "corr" | "fiveS" }[] = [
  { list: "consults", form: "F-01-01", name: "상담 일지", years: 1, basis: "사내 기준" },
  { list: "repairs", form: "F-02-01", name: "입고 점검표·수리", years: 5, basis: "사내 기준(수리 기록 5년)" },
  { list: "estimates", form: "F-03-02", name: "점검·정비 견적서", years: 5, basis: "사내 기준(분쟁 대비)" },
  { list: "complaints", form: "F-06-02", name: "불만 처리부", years: 3, basis: "사내 기준" },
  { list: "purchases", form: "F-07-02", name: "발주서·입고 검수", years: 5, basis: "국세기본법(장부·증빙 5년)" },
  { list: "outsource", form: "F-07-03", name: "외주 의뢰서", years: 5, basis: "국세기본법(장부·증빙 5년)" },
  { list: "expenses", form: "F-12-01", name: "지출 결의서", years: 5, basis: "국세기본법(장부·증빙 5년)" },
  { list: "payments", form: "", name: "입금 전표", years: 5, basis: "국세기본법(장부·증빙 5년)" },
  { list: "cashbook", form: "", name: "현금출납부", years: 5, basis: "국세기본법(장부·증빙 5년)" },
  { list: "nc", form: "F-Q-10", name: "부적합·시정 조치", years: 3, basis: "사내 기준" },
  { list: "incidents", form: "F-09-03", name: "사고·아차사고 보고서", years: 3, basis: "산업안전보건법 시행규칙 72조(산업재해 기록 3년)" },
  { list: "suggestions", form: "F-08-06", name: "불요품 처분·개선 제안", years: 3, basis: "사내 기준" },
  { list: "corr", form: "F-Q-11", name: "문서 수발신 대장·공문", years: 5, basis: "사내 기준", purge: "corr" },
];
/** 목록이 없는 기록(지울 수 있음) */
export const FIVE_S_RETENTION = { form: "F-08-05", name: "3정5S 일일 점검표", years: 1, basis: "사내 기준" } as const;

/** 오늘에서 n년 전(이 날짜보다 앞선 기록이 보존 기간 지남) */
export const cutoffOf = (today: string, years: number) => `${Number(today.slice(0, 4)) - years}${today.slice(4)}`;

const mustSee = (a: Actor) => {
  if (!can(a, "records.purge")) throw new RetentionError("보존·파기는 대표·품질 담당이 봅니다");
};

/** 지울 수 있는 기록: 처리가 끝난 수발신(받은 문서 '처리 끝', 보낸 공문 '발송'·'버림')과 3정5S 일일 점검 */
async function purgeable(db: Db, today: string) {
  const corrCut = cutoffOf(today, 5);
  const cs = await db
    .select({ id: corrDoc.id, no: corrDoc.no, dir: corrDoc.dir, status: corrDoc.status, receivedOn: corrDoc.receivedOn, sentOn: corrDoc.sentOn, createdAt: corrDoc.createdAt, files: corrDoc.files })
    .from(corrDoc)
    .where(inArray(corrDoc.status, ["done", "sent", "void"]));
  const corr = cs.filter((r) => (r.dir === "in" ? (r.receivedOn ?? seoulDate(r.createdAt)) : (r.sentOn ?? seoulDate(r.createdAt))) < corrCut);
  const fiveS = await db
    .select({ id: fiveSDaily.id, checkDate: fiveSDaily.checkDate, photos: fiveSDaily.photos })
    .from(fiveSDaily)
    .where(lt(fiveSDaily.checkDate, cutoffOf(today, FIVE_S_RETENTION.years)));
  return { corr, fiveS };
}

/** 결재 중(아직 확정 안 된) 파기 결재 */
async function pendingPurge(db: Db) {
  const [d] = await db
    .select({ id: approvalDoc.id, docNo: approvalDoc.docNo })
    .from(approvalDoc)
    .where(and(eq(approvalDoc.formCode, "REC-PURGE"), inArray(approvalDoc.status, ["draft", "in_progress"])));
  return d ?? null;
}

/** 보존·파기 화면: 대장별 보존 기간 지난 건수(볼 권한이 있는 대장만), 지울 수 있는 건수, 결재 중인 파기 */
export async function retentionSheet(db: Db, actor: Actor, today = seoulDate()) {
  mustSee(actor);
  const rows = await Promise.all(
    RETENTION.map(async (x) => {
      const def = LISTS[x.list];
      const cutoff = cutoffOf(today, x.years);
      if (!def?.allowed(actor)) return { ...x, cutoff, dateLabel: "", count: null as number | null, href: null as string | null };
      const all = def.tabs?.options.find((o) => o.v === "all")?.v;
      const q: Q = { p: "custom", to: addDaysIso(cutoff, -1), ...(def.tabs && all ? { [def.tabs.param]: all } : {}) };
      try {
        const r = await runList(db, def, actor, q, today);
        return { ...x, cutoff, dateLabel: def.dates[0]?.label ?? "", count: r.count, href: `${def.href}?${new URLSearchParams(q as Record<string, string>).toString()}` };
      } catch {
        return { ...x, cutoff, dateLabel: def.dates[0]?.label ?? "", count: null, href: null };
      }
    }),
  );
  const p = await purgeable(db, today);
  return { rows, corr: p.corr.length, fiveS: p.fiveS.length, fiveSCutoff: cutoffOf(today, FIVE_S_RETENTION.years), pending: await pendingPurge(db) };
}

const addDaysIso = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** 파기 결재 올리기: 지금 지울 수 있는 기록의 목록을 결재 문서에 그대로 남긴다(무엇을 지웠는지 기록) */
export async function requestPurge(db: Db, actor: Actor, reason: string, now = new Date()) {
  mustSee(actor);
  if (await pendingPurge(db)) throw new RetentionError("결재 중인 파기 결재가 있습니다. 그 결재가 끝난 뒤 올리세요");
  const today = seoulDate(now);
  const p = await purgeable(db, today);
  if (!p.corr.length && !p.fiveS.length) throw new RetentionError("지금 지울 수 있는 기록이 없습니다");
  const lines = [
    ...(p.corr.length ? [`문서 수발신 대장(F-Q-11, 5년, ${cutoffOf(today, 5)} 앞) ${p.corr.length}건: ${p.corr.map((c) => c.no).join(", ")}`] : []),
    ...(p.fiveS.length ? [`3정5S 일일 점검표(F-08-05, 1년, ${cutoffOf(today, 1)} 앞) ${p.fiveS.length}건`] : []),
  ];
  const doc = await createDraft(
    db,
    {
      formCode: "REC-PURGE",
      title: `보존 기간 지난 기록 파기 ${p.corr.length + p.fiveS.length}건`,
      data: { reason: reason.trim() || "보존 기간이 지남(부록 A)", purgeList: lines.join("\n"), purge: { corr: p.corr.map((c) => c.id), fiveS: p.fiveS.map((f) => f.id) } },
      drafterId: actor.id,
    },
    now,
  );
  await submit(db, doc.id, actor.id, now);
  if (actor.roles.includes("owner")) await act(db, doc.id, actor.id, "approve", "대표 기안(본인 결재)", now);
  return doc;
}

/** 대표가 승인하면 지운다. 결재 뒤 처리 상태가 바뀐 줄(다시 연 문서)은 건너뛴다 */
async function onPurgeApproved(tx: Db, doc: DocRow) {
  const ids = (doc.data as { purge?: { corr?: string[]; fiveS?: string[] } }).purge ?? {};
  const files: string[] = [];
  if (ids.corr?.length) {
    const rows = await tx.select({ id: corrDoc.id, files: corrDoc.files }).from(corrDoc).where(and(inArray(corrDoc.id, ids.corr), inArray(corrDoc.status, ["done", "sent", "void"])));
    if (rows.length) {
      // 지우는 문서를 '회신하는 문서'로 가리키는 줄은 연결만 끊는다
      await tx.update(corrDoc).set({ replyToId: null }).where(inArray(corrDoc.replyToId, rows.map((r) => r.id)));
      await tx.delete(corrDoc).where(inArray(corrDoc.id, rows.map((r) => r.id)));
      for (const r of rows) files.push(...r.files.map((f) => f.path));
    }
  }
  if (ids.fiveS?.length) {
    const rows = await tx.select({ id: fiveSDaily.id, photos: fiveSDaily.photos }).from(fiveSDaily).where(inArray(fiveSDaily.id, ids.fiveS));
    if (rows.length) {
      await tx.delete(fiveSDaily).where(inArray(fiveSDaily.id, rows.map((r) => r.id)));
      for (const r of rows) files.push(...r.photos);
    }
  }
  await writeAudit(tx, { actorId: null, action: "records.purge", entityType: "approval_doc", entityId: doc.docNo, after: { corr: ids.corr?.length ?? 0, fiveS: ids.fiveS?.length ?? 0, files: files.length } });
  // 파일은 데이터가 지워진 뒤 정리(실패해도 기록 삭제는 유지)
  for (const f of files) await removeStored(f).catch(() => {});
}
onConfirmed("REC-PURGE", onPurgeApproved);

/** 내 할 일(대표·품질 담당): 지울 수 있는 기록이 있고 결재 중인 파기가 없으면 */
export async function purgeTodos(db: Db, actor: Actor, today: string) {
  const out: { key: string; when: "soon"; what: string; detail?: string; href: string; action: string }[] = [];
  if (!can(actor, "records.purge")) return out;
  const p = await purgeable(db, today);
  const n = p.corr.length + p.fiveS.length;
  if (!n || (await pendingPurge(db))) return out;
  out.push({ key: `records-purge-${today.slice(0, 7)}`, when: "soon", what: `보존 기간 지난 기록 ${n}건 파기 결재`, detail: "문서 수발신 대장·3정5S 일일 점검", href: "/records/purge", action: "파기 결재" });
  return out;
}
