// 문서 수발신 대장(F-Q-11)·회사 공문(F-Q-12) — STD-Q 7절 8항(2026-11-21 대표 결정 '추천안대로 전부')
// 받은 문서: 접수(접수 번호 RC-연월-순번, 사진·PDF) → 담당 지정(알림) → 처리 기한 할 일 → 처리 끝(회신 공문을 보내면 저절로)
// 보낸 공문: 기안(받은 문서에서 '회신 쓰기'면 상대·제목·상대 문서번호를 불러옴) → 대표 승인(F-Q-12 결재, 번호 OL-연월-순번)
//   → 직인 찍힌 공문 인쇄·PDF → 발송 기록(날짜·방법). 확정된 기록은 고치지 않고, 잘못 보낸 공문은 새 공문으로 바로잡는다.
import { and, desc, eq, inArray, isNotNull, ne, or } from "drizzle-orm";
import type { Db } from "@/db/client";
import { approvalDoc, appUser, corrDoc, customer, legalItem, supplier, type CorrFile } from "@/db/schema";
import { act, createDraft, getDoc, onConfirmed, submit, withdrawAndDiscard, type DocRow } from "@/modules/approval/service";
import { can } from "@/modules/auth/permissions";
import type { Role } from "@/modules/auth/roles";
import { FIELD_HELP } from "@/modules/help/fields";
import { writeAudit } from "@/modules/platform/audit";
import { nextDocNo } from "@/modules/platform/docno";
import { UserError } from "@/modules/platform/errors";
import { notifyRole, notifyUser } from "@/modules/platform/notify";
import { DOC_TYPES, MAX_DOC_BYTES, readStored, removeStored, sniffDoc, storeFile } from "@/modules/platform/storage";
import { addDays, seoulDate } from "@/modules/platform/time";
import { CORR_DUE_DAYS, isCorrVia, isPartyKind, replyTitle, type CorrTab, type PartyKind } from "./corr-rules";

export class CorrError extends UserError {}
type Actor = { id: string; roles: readonly Role[] };
export type CorrRow = typeof corrDoc.$inferSelect;
const clean = (s: string | null | undefined) => (s ?? "").trim() || null;
const ISO = /^\d{4}-\d{2}-\d{2}$/;

function mustWrite(a: Actor) {
  if (!can(a, "corr.write")) throw new CorrError("문서 접수·공문 쓰기 권한이 없습니다(권한표 '받은 문서 접수, 회사 공문 쓰기')");
}

/** 볼 수 있나: 대장 관리자(대표·품질 담당)는 전부, 나머지는 자기가 접수·기안했거나 담당인 문서 */
export const canSeeCorr = (a: Actor, r: Pick<CorrRow, "createdBy" | "ownerId">) => can(a, "corr.manage") || r.createdBy === a.id || r.ownerId === a.id;

async function row(db: Db, id: string) {
  const [r] = await db.select().from(corrDoc).where(eq(corrDoc.id, id));
  if (!r) throw new CorrError("문서를 찾을 수 없습니다");
  return r;
}

export async function getCorr(db: Db, actor: Actor, id: string) {
  const r = await row(db, id);
  if (!canSeeCorr(actor, r)) throw new CorrError("이 문서를 볼 권한이 없습니다");
  const [replyTo] = r.replyToId ? await db.select().from(corrDoc).where(eq(corrDoc.id, r.replyToId)) : [];
  const replies = await db.select().from(corrDoc).where(eq(corrDoc.replyToId, r.id)).orderBy(desc(corrDoc.createdAt));
  const approval = r.approvalId ? await getDoc(db, r.approvalId).catch(() => null) : null;
  const ids = [r.createdBy, r.ownerId, ...r.files.map((f) => f.by)].filter((x): x is string => !!x);
  const users = ids.length ? await db.select({ id: appUser.id, name: appUser.name }).from(appUser).where(inArray(appUser.id, ids)) : [];
  return { r, replyTo: replyTo ?? null, replies, approval, names: new Map(users.map((u) => [u.id, u.name])) };
}

// ── 받은 문서 ──────────────────────────────────────────────

export type ReceiveInput = {
  receivedOn: string;
  via: string;
  party: string;
  partyKind: string;
  theirNo: string;
  theirDate: string;
  title: string;
  body: string;
  ownerId: string;
  needReply: boolean;
  dueOn: string;
  note: string;
};

function checkReceive(i: ReceiveInput, today: string) {
  if (!ISO.test(i.receivedOn)) throw new CorrError("받은 날을 골라 주세요");
  if (i.receivedOn > today) throw new CorrError("받은 날은 오늘이나 그 전이어야 합니다");
  if (!i.party.trim()) throw new CorrError("보낸 곳(기관·업체 이름)을 적어 주세요");
  if (!i.title.trim()) throw new CorrError("문서 제목을 적어 주세요");
  if (i.via && !isCorrVia(i.via)) throw new CorrError("받은 방법을 목록에서 골라 주세요");
  if (i.theirDate && !ISO.test(i.theirDate)) throw new CorrError("상대 문서 날짜 형식이 맞지 않습니다");
  if (i.dueOn && !ISO.test(i.dueOn)) throw new CorrError("처리 기한 형식이 맞지 않습니다");
  if (i.dueOn && i.dueOn < i.receivedOn) throw new CorrError("처리 기한이 받은 날보다 앞입니다");
  const dueOn = i.dueOn || (i.needReply ? addDays(i.receivedOn, CORR_DUE_DAYS) : null);
  return {
    receivedOn: i.receivedOn,
    via: i.via || null,
    party: i.party.trim(),
    partyKind: (isPartyKind(i.partyKind) ? i.partyKind : "other") as PartyKind,
    theirNo: clean(i.theirNo),
    theirDate: clean(i.theirDate),
    title: i.title.trim(),
    body: clean(i.body),
    ownerId: i.ownerId || null,
    needReply: i.needReply,
    dueOn,
    note: clean(i.note),
  };
}

/** 받은 문서 접수: 접수 번호를 매기고, 담당이 다른 사람이면 알린다. 담당을 비우면 접수한 사람이 담당 */
export async function receiveCorr(db: Db, actor: Actor, input: ReceiveInput, files: { bytes: Uint8Array; name: string }[] = [], now = new Date()) {
  mustWrite(actor);
  const v = checkReceive(input, seoulDate(now));
  const ownerId = v.ownerId ?? actor.id;
  const no = await nextDocNo(db, "RC", now);
  const [r] = await db
    .insert(corrDoc)
    .values({ ...v, ownerId, dir: "in", no, status: "open", createdBy: actor.id, createdAt: now, updatedAt: now })
    .returning();
  for (const f of files) await addCorrFile(db, actor, r.id, f.bytes, f.name, now);
  await writeAudit(db, { actorId: actor.id, action: "corr.receive", entityType: "corr_doc", entityId: no, after: { party: v.party, title: v.title } });
  if (ownerId !== actor.id) await notifyUser(db, ownerId, `받은 문서 담당: ${v.party} · ${v.title}${v.dueOn ? ` (${v.dueOn}까지)` : ""}`, `corr-own-${r.id}`, `/corr/${r.id}`);
  return { id: r.id, no };
}

/** 처리 끝나기 전에는 고친다(접수한 사람·담당·대장 관리자) */
export async function updateReceived(db: Db, actor: Actor, id: string, input: ReceiveInput, now = new Date()) {
  const r = await row(db, id);
  if (r.dir !== "in") throw new CorrError("받은 문서가 아닙니다");
  if (!canSeeCorr(actor, r)) throw new CorrError("이 문서를 고칠 권한이 없습니다");
  if (r.status !== "open") throw new CorrError("처리가 끝난 문서는 고칠 수 없습니다. '다시 열기'를 먼저 누르세요");
  const v = checkReceive(input, seoulDate(now));
  const ownerId = v.ownerId ?? r.ownerId ?? actor.id;
  if (ownerId !== r.ownerId && r.ownerId && r.ownerId !== actor.id && !can(actor, "corr.manage") && r.createdBy !== actor.id)
    throw new CorrError("담당은 접수한 사람이나 대표·품질 담당이 바꿉니다");
  await db.update(corrDoc).set({ ...v, ownerId, updatedAt: now }).where(eq(corrDoc.id, id));
  await writeAudit(db, { actorId: actor.id, action: "corr.update", entityType: "corr_doc", entityId: r.no, before: { title: r.title, ownerId: r.ownerId, dueOn: r.dueOn }, after: { title: v.title, ownerId, dueOn: v.dueOn } });
  if (ownerId !== r.ownerId && ownerId !== actor.id) await notifyUser(db, ownerId, `받은 문서 담당: ${v.party} · ${v.title}`, `corr-own-${id}-${ownerId}`, `/corr/${id}`);
}

/** 처리 끝: 무엇을 했는지 적는다(회신 공문을 보내면 저절로 끝남) */
export async function closeReceived(db: Db, actor: Actor, id: string, doneNote: string, now = new Date()) {
  const r = await row(db, id);
  if (r.dir !== "in") throw new CorrError("받은 문서가 아닙니다");
  if (!canSeeCorr(actor, r)) throw new CorrError("담당이나 대표·품질 담당이 처리 끝을 기록합니다");
  if (r.status !== "open") throw new CorrError("이미 처리가 끝났습니다");
  if (!doneNote.trim()) throw new CorrError("어떻게 처리했는지 적어 주세요(예: 확인만 함, 전화로 답함)");
  await db.update(corrDoc).set({ status: "done", doneOn: seoulDate(now), doneNote: doneNote.trim(), updatedAt: now }).where(eq(corrDoc.id, id));
  await writeAudit(db, { actorId: actor.id, action: "corr.close", entityType: "corr_doc", entityId: r.no, after: { doneNote: doneNote.trim() } });
}

export async function reopenReceived(db: Db, actor: Actor, id: string, now = new Date()) {
  const r = await row(db, id);
  if (r.dir !== "in" || r.status !== "done") throw new CorrError("처리가 끝난 받은 문서만 다시 엽니다");
  if (!canSeeCorr(actor, r)) throw new CorrError("담당이나 대표·품질 담당이 다시 엽니다");
  await db.update(corrDoc).set({ status: "open", doneOn: null, updatedAt: now }).where(eq(corrDoc.id, id));
  await writeAudit(db, { actorId: actor.id, action: "corr.reopen", entityType: "corr_doc", entityId: r.no, before: { doneNote: r.doneNote } });
}

// ── 파일 ───────────────────────────────────────────────────

/** 사진·PDF 붙이기. 받은 문서는 처리 중에, 보낸 공문은 발송 전에 */
export async function addCorrFile(db: Db, actor: Actor, id: string, bytes: Uint8Array, name: string, now = new Date()) {
  const r = await row(db, id);
  if (!canSeeCorr(actor, r)) throw new CorrError("이 문서에 파일을 붙일 권한이 없습니다");
  if (r.status === "void") throw new CorrError("버린 공문입니다");
  if (!bytes.length || bytes.length > MAX_DOC_BYTES) throw new CorrError("파일이 비었거나 너무 큽니다(8MB까지)");
  const type = sniffDoc(bytes);
  if (!type) throw new CorrError("사진(JPG·PNG·WEBP)이나 PDF만 붙입니다");
  const path = await storeFile(`corr/${id}`, bytes, DOC_TYPES[type]);
  const f: CorrFile = { path, name: name.slice(0, 120) || `파일.${DOC_TYPES[type]}`, mime: type, size: bytes.length, at: now.toISOString(), by: actor.id };
  await db.update(corrDoc).set({ files: [...r.files, f], updatedAt: now }).where(eq(corrDoc.id, id));
  await writeAudit(db, { actorId: actor.id, action: "corr.file", entityType: "corr_doc", entityId: r.no, after: { name: f.name } });
}

/** 파일 떼기: 잘못 올린 것만. 처리 끝·발송된 문서의 파일은 기록이라 뗄 수 없다 */
export async function removeCorrFile(db: Db, actor: Actor, id: string, path: string, now = new Date()) {
  const r = await row(db, id);
  if (!canSeeCorr(actor, r)) throw new CorrError("이 문서의 파일을 뗄 권한이 없습니다");
  if (r.status === "done" || r.status === "sent") throw new CorrError("처리 끝·발송된 문서의 파일은 기록이라 뗄 수 없습니다");
  const f = r.files.find((x) => x.path === path);
  if (!f) throw new CorrError("없는 파일입니다");
  await db.update(corrDoc).set({ files: r.files.filter((x) => x.path !== path), updatedAt: now }).where(eq(corrDoc.id, id));
  await removeStored(path);
  await writeAudit(db, { actorId: actor.id, action: "corr.fileRemove", entityType: "corr_doc", entityId: r.no, before: { name: f.name } });
}

export async function openCorrFile(db: Db, actor: Actor, id: string, n: number) {
  const r = await row(db, id);
  if (!canSeeCorr(actor, r)) throw new CorrError("이 문서를 볼 권한이 없습니다");
  const f = r.files[n];
  if (!f) throw new CorrError("없는 파일입니다");
  return { bytes: await readStored(f.path), mime: f.mime, name: f.name };
}

// ── 보낸 공문 ──────────────────────────────────────────────

export type LetterInput = {
  party: string;
  partyKind: string;
  partyAddr: string;
  cc: string;
  title: string;
  body: string;
  enclosures: string;
  replyToId: string;
};

function checkLetter(i: LetterInput) {
  if (!i.party.trim()) throw new CorrError("받는 곳(수신)을 적어 주세요");
  if (!i.title.trim()) throw new CorrError("제목을 적어 주세요");
  if (!i.body.trim()) throw new CorrError("본문을 적어 주세요");
  return {
    party: i.party.trim(),
    partyKind: (isPartyKind(i.partyKind) ? i.partyKind : "other") as PartyKind,
    partyAddr: clean(i.partyAddr),
    cc: clean(i.cc),
    title: i.title.trim(),
    body: i.body.trim(),
    enclosures: clean(i.enclosures),
    replyToId: i.replyToId || null,
  };
}

/** 결재 문서에 남기는 공문 내용(확정되면 내용 해시로 고정된다) */
const snapshot = (v: ReturnType<typeof checkLetter>, corrId: string, replyNo: string | null) => ({
  corrId,
  party: v.party,
  ...(v.partyAddr ? { partyAddr: v.partyAddr } : {}),
  ...(v.cc ? { cc: v.cc } : {}),
  body: v.body,
  ...(v.enclosures ? { enclosures: v.enclosures } : {}),
  ...(replyNo ? { replyToNo: replyNo } : {}),
});

/** 공문 기안 → 바로 대표 승인 요청. 결재 문서 번호(OL-연월-순번)가 공문 문서번호가 된다 */
export async function draftLetter(db: Db, actor: Actor, input: LetterInput, now = new Date()) {
  mustWrite(actor);
  const v = checkLetter(input);
  let replyNo: string | null = null;
  if (v.replyToId) {
    const src = await row(db, v.replyToId);
    if (src.dir !== "in") throw new CorrError("회신은 받은 문서에만 씁니다");
    if (!canSeeCorr(actor, src)) throw new CorrError("회신할 문서를 볼 권한이 없습니다");
    replyNo = src.no;
  }
  const id = crypto.randomUUID();
  const doc = await createDraft(db, { formCode: "F-Q-12", title: v.title, data: snapshot(v, id, replyNo), drafterId: actor.id }, now);
  await db.insert(corrDoc).values({ id, ...v, dir: "out", no: doc.docNo, status: "writing", approvalId: doc.id, createdBy: actor.id, ownerId: actor.id, createdAt: now, updatedAt: now });
  await writeAudit(db, { actorId: actor.id, action: "corr.draft", entityType: "corr_doc", entityId: doc.docNo, after: { party: v.party, title: v.title } });
  await submit(db, doc.id, actor.id, now);
  // 대표가 직접 쓴 공문은 쓰는 것이 곧 승인이다(결재함에서 한 번 더 누르지 않게)
  if (actor.roles.includes("owner")) await act(db, doc.id, actor.id, "approve", "대표 기안(본인 결재)", now);
  return { id, no: doc.docNo };
}

/** 반려됐거나 아직 아무도 결재하지 않은 공문을 고친다. 결재 중이면 회수했다가 고친 내용으로 다시 올린다 */
export async function updateLetter(db: Db, actor: Actor, id: string, input: LetterInput, now = new Date()) {
  const r = await row(db, id);
  if (r.dir !== "out" || r.status !== "writing" || !r.approvalId) throw new CorrError("결재 중인 공문만 고칩니다. 승인된 공문은 새 공문으로 바로잡으세요");
  if (r.createdBy !== actor.id) throw new CorrError("기안한 사람만 고칩니다");
  const v = checkLetter({ ...input, replyToId: r.replyToId ?? "" });
  const [src] = r.replyToId ? await db.select({ no: corrDoc.no }).from(corrDoc).where(eq(corrDoc.id, r.replyToId)) : [];
  let doc = await getDoc(db, r.approvalId);
  if (doc.status === "in_progress") {
    const steps = doc.steps as { kind: string; doneBy: string[] }[];
    if (steps.some((s) => s.kind !== "draft" && s.doneBy.length)) throw new CorrError("이미 결재가 시작됐습니다");
  }
  if (doc.status !== "in_progress" && doc.status !== "rejected" && doc.status !== "draft") throw new CorrError("고칠 수 없는 결재 상태입니다");
  await db.update(approvalDoc).set({ title: v.title, data: snapshot(v, id, src?.no ?? null), updatedAt: now }).where(eq(approvalDoc.id, doc.id));
  await db.update(corrDoc).set({ ...v, replyToId: r.replyToId, updatedAt: now }).where(eq(corrDoc.id, id));
  await writeAudit(db, { actorId: actor.id, action: "corr.update", entityType: "corr_doc", entityId: r.no, before: { title: r.title, body: r.body }, after: { title: v.title, body: v.body } });
  doc = await getDoc(db, doc.id);
  if (doc.status === "rejected") {
    await submit(db, doc.id, actor.id, now);
    if (actor.roles.includes("owner")) await act(db, doc.id, actor.id, "approve", "대표 기안(본인 결재)", now);
  }
}

/** 공문 버리기(결재 전·반려). 결재 문서도 회수·폐기한다. 번호는 '버림'으로 남는다 */
export async function discardLetter(db: Db, actor: Actor, id: string, now = new Date()) {
  const r = await row(db, id);
  if (r.dir !== "out" || r.status !== "writing" || !r.approvalId) throw new CorrError("결재 중인 공문만 버립니다");
  if (r.createdBy !== actor.id) throw new CorrError("기안한 사람만 버립니다");
  const doc = await withdrawAndDiscard(db, r.approvalId, actor.id, now);
  if (doc.status !== "discarded") throw new CorrError("이미 결재가 시작돼 버릴 수 없습니다. 반려를 기다리세요");
  await db.update(corrDoc).set({ status: "void", updatedAt: now }).where(eq(corrDoc.id, id));
  await writeAudit(db, { actorId: actor.id, action: "corr.discard", entityType: "corr_doc", entityId: r.no });
}

/** 대표 승인(결재 확정) → 승인(발송 전). 기안자에게 '발송 기록' 할 일이 뜬다 */
async function onLetterApproved(tx: Db, doc: DocRow) {
  const corrId = (doc.data as { corrId?: string }).corrId;
  if (!corrId) return;
  await tx.update(corrDoc).set({ status: "approved", updatedAt: new Date() }).where(and(eq(corrDoc.id, corrId), eq(corrDoc.status, "writing")));
}
onConfirmed("F-Q-12", onLetterApproved);

/** 발송 기록: 보낸 날·방법. 회신 공문이면 받은 문서가 '처리 끝(회신 OL-…)'으로 닫힌다 */
export async function recordSent(db: Db, actor: Actor, id: string, input: { sentOn: string; via: string; note: string }, now = new Date()) {
  const r = await row(db, id);
  if (r.dir !== "out") throw new CorrError("보낸 공문이 아닙니다");
  if (!canSeeCorr(actor, r)) throw new CorrError("기안자나 대표·품질 담당이 발송을 기록합니다");
  if (r.status !== "approved") throw new CorrError(r.status === "sent" ? "이미 발송을 기록했습니다" : "대표 승인 뒤에 보냅니다");
  const today = seoulDate(now);
  if (!ISO.test(input.sentOn) || input.sentOn > today) throw new CorrError("보낸 날은 오늘이나 그 전 날짜로 골라 주세요");
  if (!isCorrVia(input.via)) throw new CorrError("보낸 방법을 골라 주세요");
  await db.update(corrDoc).set({ status: "sent", sentOn: input.sentOn, via: input.via, note: clean(input.note) ?? r.note, updatedAt: now }).where(eq(corrDoc.id, id));
  await writeAudit(db, { actorId: actor.id, action: "corr.send", entityType: "corr_doc", entityId: r.no, after: { sentOn: input.sentOn, via: input.via } });
  if (r.replyToId) {
    const [src] = await db.select().from(corrDoc).where(eq(corrDoc.id, r.replyToId));
    if (src?.status === "open") await db.update(corrDoc).set({ status: "done", doneOn: input.sentOn, doneNote: `회신 ${r.no} 발송`, updatedAt: now }).where(eq(corrDoc.id, src.id));
  }
}

/** 회신 쓰기·새 공문 쓰기 화면에 미리 채울 값(앞 문서·같은 상대에게 보낸 지난 공문에서) */
export async function letterPrefill(db: Db, actor: Actor, opts: { reply?: string; copy?: string }) {
  if (opts.reply) {
    const src = await row(db, opts.reply).catch(() => null);
    if (src && src.dir === "in" && canSeeCorr(actor, src)) {
      const [last] = await db.select({ partyAddr: corrDoc.partyAddr, cc: corrDoc.cc }).from(corrDoc).where(and(eq(corrDoc.dir, "out"), eq(corrDoc.party, src.party), isNotNull(corrDoc.partyAddr))).orderBy(desc(corrDoc.createdAt)).limit(1);
      const ref = `${src.party}${src.theirNo ? ` ${src.theirNo}` : ""}${src.theirDate ? `(${src.theirDate})` : ""}`;
      return {
        from: `받은 문서 ${src.no}`,
        replyToId: src.id,
        party: src.party,
        partyKind: src.partyKind,
        partyAddr: last?.partyAddr ?? "",
        cc: last?.cc ?? "",
        title: replyTitle(src.title),
        body: `1. 귀 ${src.partyKind === "agency" ? "기관" : "사"}의 무궁한 발전을 기원합니다.\n2. 관련: ${ref} '${src.title}'\n3. 위 호와 관련하여 아래와 같이 회신합니다.\n\n`,
        enclosures: "",
      };
    }
  }
  if (opts.copy) {
    const src = await row(db, opts.copy).catch(() => null);
    if (src && src.dir === "out" && canSeeCorr(actor, src))
      return { from: `지난 공문 ${src.no}`, replyToId: "", party: src.party, partyKind: src.partyKind, partyAddr: src.partyAddr ?? "", cc: src.cc ?? "", title: src.title, body: src.body ?? "", enclosures: src.enclosures ?? "" };
  }
  return null;
}

/** 상대 이름 입력도우미: 협력업체·업체 고객·보험사·법규 대장 관할 기관·지난 수발신 상대(구분·주소 함께) */
export async function partySuggestions(db: Db) {
  const out = new Map<string, { kind: PartyKind; addr?: string }>();
  const put = (name: string | null | undefined, kind: PartyKind, addr?: string | null) => {
    const n = (name ?? "").trim();
    if (!n) return;
    const had = out.get(n);
    if (!had) out.set(n, { kind, addr: addr ?? undefined });
    else if (!had.addr && addr) had.addr = addr;
  };
  const past = await db.select({ party: corrDoc.party, kind: corrDoc.partyKind, addr: corrDoc.partyAddr }).from(corrDoc).where(ne(corrDoc.status, "void")).orderBy(desc(corrDoc.createdAt)).limit(300);
  for (const p of past) put(p.party, isPartyKind(p.kind) ? p.kind : "other", p.addr);
  for (const s of await db.select({ name: supplier.name }).from(supplier).where(ne(supplier.status, "stopped"))) put(s.name, "supplier");
  for (const c of await db.select({ name: customer.name }).from(customer).where(eq(customer.kind, "business"))) put(c.name, "client");
  for (const n of FIELD_HELP["consult.insurer"].templates ?? []) put(n, "insurer");
  for (const l of await db.select({ a: legalItem.authority }).from(legalItem).where(isNotNull(legalItem.authority)))
    for (const a of (l.a ?? "").split(/[/,·]/)) put(a, "agency");
  return [...out.entries()].map(([name, v]) => ({ name, ...v }));
}

// ── 목록·할 일 ─────────────────────────────────────────────

export async function listCorr(db: Db, actor: Actor, tab: CorrTab) {
  const cond =
    tab === "in"
      ? eq(corrDoc.dir, "in")
      : tab === "out"
        ? eq(corrDoc.dir, "out")
        : tab === "todo"
          ? or(eq(corrDoc.status, "open"), eq(corrDoc.status, "writing"), eq(corrDoc.status, "approved"))
          : undefined;
  const rows = await db.select().from(corrDoc).where(cond).orderBy(desc(corrDoc.createdAt));
  const seen = rows.filter((r) => canSeeCorr(actor, r) && (tab === "todo" ? r.status !== "void" : true));
  const ids = [...new Set(seen.map((r) => r.ownerId).filter((x): x is string => !!x))];
  const users = ids.length ? await db.select({ id: appUser.id, name: appUser.name }).from(appUser).where(inArray(appUser.id, ids)) : [];
  const nm = new Map(users.map((u) => [u.id, u.name]));
  return seen.map((r) => ({ r, owner: r.ownerId ? (nm.get(r.ownerId) ?? null) : null }));
}

/** 내 할 일: 담당인 받은 문서(기한), 승인됐는데 아직 안 보낸 공문, 담당 없는 받은 문서(대장 관리자) */
export async function corrTodos(db: Db, actor: Actor, today: string) {
  const out: { key: string; when: "late" | "today" | "soon"; what: string; detail?: string; href: string; action: string }[] = [];
  if (!can(actor, "corr.write")) return out;
  const rows = await db.select().from(corrDoc).where(inArray(corrDoc.status, ["open", "approved"]));
  for (const r of rows) {
    if (r.status === "open" && r.ownerId === actor.id) {
      const when = r.dueOn ? (r.dueOn < today ? "late" : r.dueOn <= addDays(today, 2) ? "today" : "soon") : "soon";
      out.push({ key: `corr-in-${r.id}`, when, what: `받은 문서 처리: ${r.party} · ${r.title}`, detail: r.dueOn ? `${r.dueOn}까지${r.needReply ? " 회신" : ""}` : `${r.no} 접수 ${r.receivedOn}`, href: `/corr/${r.id}`, action: r.needReply ? "회신 쓰기" : "처리하기" });
    }
    if (r.status === "approved" && r.createdBy === actor.id)
      out.push({ key: `corr-send-${r.id}`, when: "today", what: `승인된 공문 보내기: ${r.title}`, detail: `${r.no} · 수신 ${r.party}. 인쇄·PDF로 보내고 발송을 기록하세요`, href: `/corr/${r.id}`, action: "발송 기록" });
  }
  return out;
}

/** 매일: 처리 기한 하루 전·지난 받은 문서를 담당에게, 담당이 없는 문서는 대장 관리자에게 알린다 */
export async function corrDailyAlerts(db: Db, now = new Date()) {
  const today = seoulDate(now);
  const rows = await db.select().from(corrDoc).where(and(eq(corrDoc.dir, "in"), eq(corrDoc.status, "open"), isNotNull(corrDoc.dueOn)));
  let n = 0;
  for (const r of rows) {
    if (!r.dueOn || r.dueOn > addDays(today, 1)) continue;
    const title = `${r.dueOn < today ? "처리 기한 지남" : "처리 기한 임박"}: ${r.party} · ${r.title} (${r.dueOn})`;
    if (r.ownerId) await notifyUser(db, r.ownerId, title, `corr-due-${r.id}-${today}`, `/corr/${r.id}`);
    else await notifyRole(db, "owner", title, `corr-due-${r.id}-${today}`, `/corr/${r.id}`);
    n++;
  }
  return `받은 문서 기한 알림 ${n}건`;
}
