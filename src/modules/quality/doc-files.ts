// 문서 목록(F-Q-04) 보강(2026-11-21 대표 결정): 작업 지침서·외부 문서 파일을 판별로 보관하고, 절차서·지침서 정기 검토(연 1회)를 할 일로 챙긴다.
// 파일은 직원 누구나 연다(현장에서 보는 문서). 올리기·떼기는 문서 목록 관리자(품질 담당·대표). 이전 판 파일은 떼지 못한다(기록).
import { and, eq, inArray } from "drizzle-orm";
import type { Db } from "@/db/client";
import { docRegister } from "@/db/schema";
import { can } from "@/modules/auth/permissions";
import type { Role } from "@/modules/auth/roles";
import { writeAudit } from "@/modules/platform/audit";
import { UserError } from "@/modules/platform/errors";
import { DOC_TYPES, MAX_DOC_BYTES, readStored, removeStored, sniffDoc, storeFile } from "@/modules/platform/storage";
import { addDays, seoulDate } from "@/modules/platform/time";

export class DocFileError extends UserError {}
type Actor = { id: string; roles: readonly Role[] };

/** 정기 검토 주기(STD-Q 7절 7항: 매년 1회 이상) */
export const DOC_REVIEW_DAYS = 365;

async function doc(db: Db, id: string) {
  const [d] = await db.select().from(docRegister).where(eq(docRegister.id, id));
  if (!d) throw new DocFileError("없는 문서입니다");
  return d;
}

export async function addDocFile(db: Db, actor: Actor, id: string, bytes: Uint8Array, name: string, now = new Date()) {
  if (!can(actor, "qms.docs")) throw new DocFileError("문서 파일은 품질 담당·대표가 올립니다");
  const d = await doc(db, id);
  if (d.status !== "current") throw new DocFileError("폐지된 문서에는 올리지 않습니다");
  if (!bytes.length || bytes.length > MAX_DOC_BYTES) throw new DocFileError("파일이 비었거나 너무 큽니다(8MB까지)");
  const type = sniffDoc(bytes);
  if (!type) throw new DocFileError("PDF나 사진(JPG·PNG·WEBP)만 올립니다");
  const path = await storeFile(`docs/${id}`, bytes, DOC_TYPES[type]);
  const f = { path, name: name.slice(0, 120) || `${d.no}.${DOC_TYPES[type]}`, mime: type, size: bytes.length, at: now.toISOString(), by: actor.id, rev: d.rev };
  await db.update(docRegister).set({ files: [...d.files, f], updatedBy: actor.id, updatedAt: now }).where(eq(docRegister.id, id));
  await writeAudit(db, { actorId: actor.id, action: "docs.file", entityType: "doc_register", entityId: d.no, after: { name: f.name, rev: d.rev } });
}

/** 잘못 올린 현행 판 파일만 뗀다. 이전 판 파일은 '그때 무엇을 썼나'의 기록이라 남긴다 */
export async function removeDocFile(db: Db, actor: Actor, id: string, path: string, now = new Date()) {
  if (!can(actor, "qms.docs")) throw new DocFileError("문서 파일은 품질 담당·대표가 관리합니다");
  const d = await doc(db, id);
  const f = d.files.find((x) => x.path === path);
  if (!f) throw new DocFileError("없는 파일입니다");
  if (f.rev !== d.rev) throw new DocFileError("이전 판 파일은 기록이라 뗄 수 없습니다");
  await db.update(docRegister).set({ files: d.files.filter((x) => x.path !== path), updatedBy: actor.id, updatedAt: now }).where(eq(docRegister.id, id));
  await removeStored(path);
  await writeAudit(db, { actorId: actor.id, action: "docs.fileRemove", entityType: "doc_register", entityId: d.no, before: { name: f.name, rev: f.rev } });
}

export async function openDocFile(db: Db, id: string, n: number) {
  const d = await doc(db, id);
  const f = d.files[n];
  if (!f) throw new DocFileError("없는 파일입니다");
  return { bytes: await readStored(f.path), mime: f.mime, name: f.name };
}

/** 다음 정기 검토일: 마지막 검토일(없으면 목록에 올린 날) + 1년 */
export const reviewDue = (d: { reviewedOn: string | null; createdAt: Date }) => addDays(d.reviewedOn ?? seoulDate(d.createdAt), DOC_REVIEW_DAYS);

/** 정기 검토 기록: 바꿀 것이 없어도 검토일과 결과를 남긴다. 바꿀 것이 있으면 개정 요청(F-Q-05)으로 */
export async function recordDocReview(db: Db, actor: Actor, id: string, note: string, now = new Date()) {
  if (!can(actor, "qms.docs")) throw new DocFileError("정기 검토는 품질 담당·대표가 기록합니다");
  const d = await doc(db, id);
  if (d.status !== "current") throw new DocFileError("폐지된 문서입니다");
  if (!note.trim()) throw new DocFileError("검토 결과를 적어 주세요(예: 바꿀 것 없음)");
  const on = seoulDate(now);
  await db.update(docRegister).set({ reviewedOn: on, reviewNote: note.trim(), updatedBy: actor.id, updatedAt: now }).where(eq(docRegister.id, id));
  await writeAudit(db, { actorId: actor.id, action: "docs.review", entityType: "doc_register", entityId: d.no, before: { reviewedOn: d.reviewedOn }, after: { reviewedOn: on, note: note.trim() } });
}

/** 내 할 일(품질 담당·대표): 정기 검토 기한이 30일 안이거나 지난 절차서·지침서 */
export async function docReviewTodos(db: Db, actor: Actor, today: string) {
  const out: { key: string; when: "late" | "soon"; what: string; detail?: string; href: string; action: string }[] = [];
  if (!can(actor, "qms.docs")) return out;
  const rows = await db.select().from(docRegister).where(and(eq(docRegister.status, "current"), inArray(docRegister.kind, ["std", "wi"])));
  const due = rows.map((d) => ({ d, due: reviewDue(d) })).filter((x) => x.due <= addDays(today, 30));
  if (!due.length) return out;
  const late = due.filter((x) => x.due < today);
  out.push({
    key: "docs-review",
    when: late.length ? "late" : "soon",
    what: `절차서·지침서 정기 검토 ${due.length}건`,
    detail: due
      .slice(0, 4)
      .map((x) => `${x.d.no}(${x.due}까지)`)
      .join(", "),
    href: "/qms/docs?f=review",
    action: "검토하기",
  });
  return out;
}
