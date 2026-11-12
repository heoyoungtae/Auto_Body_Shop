// 직원 서류함(대표 지시 2026-11-12): 이력서·자격증 사본 등을 암호화해 보관한다.
// 보는 사람: 대표·회계 담당(staff.roster)과 본인. 본인이 올린 파일은 대표·회계가 확인한다.
// 보존: 근로기준법 제42조(계약 서류 3년)에 맞춰 퇴직 3년이 지나면 파기 대상으로 알린다.
import { and, desc, eq, isNull } from "drizzle-orm";
import type { Db } from "@/db/client";
import { appUser, staffFile, staffProfile } from "@/db/schema";
import { decryptBytes, encryptBytes } from "@/modules/auth/crypto";
import { can } from "@/modules/auth/permissions";
import type { Role } from "@/modules/auth/roles";
import { writeAudit } from "@/modules/platform/audit";
import { UserError } from "@/modules/platform/errors";
import { notifyRole } from "@/modules/platform/notify";
import { MAX_DOC_BYTES, readStored, removeStored, sniffDoc, storeFile } from "@/modules/platform/storage";
import { addDays, seoulDate } from "@/modules/platform/time";

type Actor = { id: string; roles: Role[] };
export class StaffFileError extends UserError {}

export const STAFF_FILE_KINDS = {
  resume: "이력서",
  license: "자격증 사본",
  career: "경력·재직 증명서",
  edu: "졸업·교육 수료증",
  health: "건강진단 결과",
  bank: "급여 통장 사본",
  other: "기타",
} as const;
export type StaffFileKind = keyof typeof STAFF_FILE_KINDS;
export const isStaffFileKind = (s: string): s is StaffFileKind => s in STAFF_FILE_KINDS;

/** 퇴직 뒤 보존 연수(근로기준법 제42조 3년) */
export const KEEP_YEARS_AFTER_EXIT = 3;

const roster = (a: Actor) => can(a, "staff.roster");
const mayOpen = (a: Actor, userId: string) => roster(a) || a.id === userId;

/** 파기할 날: 퇴직일 + 3년. 퇴직 전이면 null */
export function purgeOn(leftOn: string | null | undefined): string | null {
  if (!leftOn) return null;
  const [y, m, d] = leftOn.split("-").map(Number);
  return `${y + KEEP_YEARS_AFTER_EXIT}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export async function listStaffFiles(db: Db, actor: Actor, userId: string) {
  if (!mayOpen(actor, userId)) throw new StaffFileError("직원 서류는 대표·회계 담당과 본인만 봅니다");
  return db
    .select({ f: staffFile, by: appUser.name })
    .from(staffFile)
    .leftJoin(appUser, eq(appUser.id, staffFile.uploadedBy))
    .where(and(eq(staffFile.userId, userId), isNull(staffFile.removedAt)))
    .orderBy(staffFile.kind, desc(staffFile.createdAt));
}

export type StaffFileInput = { kind: string; title: string; licenseName?: string; fileName: string; bytes: Uint8Array };

export async function addStaffFile(db: Db, actor: Actor, userId: string, input: StaffFileInput, now = new Date()) {
  if (!mayOpen(actor, userId)) throw new StaffFileError("직원 서류는 대표·회계 담당과 본인만 올립니다");
  if (!isStaffFileKind(input.kind)) throw new StaffFileError("서류 종류를 골라 주세요");
  if (!input.bytes.length) throw new StaffFileError("파일을 골라 주세요");
  if (input.bytes.length > MAX_DOC_BYTES) throw new StaffFileError("파일이 8MB를 넘습니다. 사진은 줄여서 올려 주세요");
  const mime = sniffDoc(input.bytes);
  if (!mime) throw new StaffFileError("PDF나 사진(JPG·PNG·WEBP)만 올립니다");
  const [u] = await db.select({ id: appUser.id }).from(appUser).where(eq(appUser.id, userId));
  if (!u) throw new StaffFileError("직원을 찾을 수 없습니다");
  const title = input.title.trim() || (input.kind === "license" && input.licenseName?.trim()) || STAFF_FILE_KINDS[input.kind];
  // 암호화한 내용은 .bin 으로 둔다(파일 보기 경로로는 열 수 없고 /api/staff-files 로만 연다)
  const path = await storeFile(`hr/${userId}`, encryptBytes(input.bytes), "bin");
  const self = actor.id === userId && !roster(actor);
  const [row] = await db
    .insert(staffFile)
    .values({ userId, kind: input.kind, title: title.slice(0, 80), licenseName: input.kind === "license" ? input.licenseName?.trim() || null : null, path, fileName: input.fileName.slice(0, 120), mime, size: input.bytes.length, uploadedBy: actor.id, checkedBy: self ? null : actor.id, checkedAt: self ? null : now, createdAt: now })
    .returning({ id: staffFile.id });
  await writeAudit(db, { actorId: actor.id, action: "staff.file_add", entityType: "staff_file", entityId: row.id, after: { userId, kind: input.kind } });
  if (self) await notifyRole(db, "owner", `직원 서류 확인 요청: ${STAFF_FILE_KINDS[input.kind]} — 본인이 올림`, `staff-file-${row.id}`, `/staff/${userId}#files`);
  return row.id;
}

/** 본인이 올린 서류를 대표·회계가 확인 */
export async function checkStaffFile(db: Db, actor: Actor, id: string, now = new Date()) {
  if (!roster(actor)) throw new StaffFileError("대표·회계 담당이 확인합니다");
  const [f] = await db.select().from(staffFile).where(eq(staffFile.id, id));
  if (!f || f.removedAt) throw new StaffFileError("서류를 찾을 수 없습니다");
  await db.update(staffFile).set({ checkedBy: actor.id, checkedAt: now }).where(eq(staffFile.id, id));
  await writeAudit(db, { actorId: actor.id, action: "staff.file_check", entityType: "staff_file", entityId: id });
  return f.userId;
}

/** 지우기(잘못 올림·파기). 파일은 바로 지우고 줄은 기록으로 남긴다. 본인은 확인 전인 자기 파일만 */
export async function removeStaffFile(db: Db, actor: Actor, id: string, reason: string, now = new Date()) {
  const [f] = await db.select().from(staffFile).where(eq(staffFile.id, id));
  if (!f || f.removedAt) throw new StaffFileError("서류를 찾을 수 없습니다");
  const own = f.userId === actor.id && f.uploadedBy === actor.id && !f.checkedAt;
  if (!roster(actor) && !own) throw new StaffFileError("확인된 서류는 대표·회계 담당이 지웁니다");
  if (!reason.trim()) throw new StaffFileError("지우는 까닭을 적어 주세요(예: 잘못 올림, 보존 기간 지나 파기)");
  if (f.path) await removeStored(f.path);
  await db.update(staffFile).set({ path: null, removedAt: now, removedBy: actor.id, removeReason: reason.trim().slice(0, 200) }).where(eq(staffFile.id, id));
  await writeAudit(db, { actorId: actor.id, action: "staff.file_remove", entityType: "staff_file", entityId: id, after: { reason: reason.trim() } });
  return f.userId;
}

/** 파일 열기(복호화). 권한이 없으면 오류 */
export async function openStaffFile(db: Db, actor: Actor, id: string) {
  const [f] = await db.select().from(staffFile).where(eq(staffFile.id, id));
  if (!f || f.removedAt || !f.path) throw new StaffFileError("없는 파일입니다");
  if (!mayOpen(actor, f.userId)) throw new StaffFileError("직원 서류는 대표·회계 담당과 본인만 봅니다");
  const bytes = decryptBytes(new Uint8Array(await readStored(f.path)));
  return { bytes, mime: f.mime, fileName: f.fileName };
}

/** 파기 대상: 퇴직 3년이 지난 직원의 남은 서류 수 */
export async function filesToPurge(db: Db, now = new Date()) {
  const today = seoulDate(now);
  const rows = await db
    .select({ userId: staffFile.userId, name: appUser.name, leftOn: staffProfile.leftOn })
    .from(staffFile)
    .innerJoin(appUser, eq(appUser.id, staffFile.userId))
    .innerJoin(staffProfile, eq(staffProfile.userId, staffFile.userId))
    .where(isNull(staffFile.removedAt));
  const out = new Map<string, { userId: string; name: string; purgeOn: string; count: number }>();
  for (const r of rows) {
    const p = purgeOn(r.leftOn);
    if (!p || p > today) continue;
    const cur = out.get(r.userId) ?? { userId: r.userId, name: r.name, purgeOn: p, count: 0 };
    cur.count++;
    out.set(r.userId, cur);
  }
  return [...out.values()];
}

/** 확인 기다리는 서류(본인이 올림) */
export async function filesToCheck(db: Db) {
  return db
    .select({ id: staffFile.id, userId: staffFile.userId, name: appUser.name, kind: staffFile.kind })
    .from(staffFile)
    .innerJoin(appUser, eq(appUser.id, staffFile.userId))
    .where(and(isNull(staffFile.removedAt), isNull(staffFile.checkedAt)));
}

export const soonPurge = (leftOn: string | null | undefined, today: string) => {
  const p = purgeOn(leftOn);
  return p && p <= addDays(today, 30) ? p : null;
};

/** 내 할 일: 본인이 올린 서류 확인, 보존 기간 지난 서류 파기(대표·회계) */
export async function staffFileTodos(db: Db, actor: Actor, today: string) {
  const out: { key: string; when: "late" | "today" | "soon"; what: string; detail?: string; href: string; action: string }[] = [];
  if (!roster(actor)) return out;
  const check = await filesToCheck(db);
  const by = new Map<string, { name: string; n: number }>();
  for (const c of check) by.set(c.userId, { name: c.name, n: (by.get(c.userId)?.n ?? 0) + 1 });
  for (const [userId, v] of by) out.push({ key: `staff-file-check-${userId}`, when: "today", what: `${v.name} 직원 서류 ${v.n}건 확인`, detail: "본인이 올린 이력서·자격증 사본 등", href: `/staff/${userId}#files`, action: "확인" });
  for (const p of await filesToPurge(db, new Date(`${today}T12:00:00+09:00`)))
    out.push({ key: `staff-file-purge-${p.userId}`, when: "late", what: `${p.name} 직원 서류 ${p.count}건 파기`, detail: `퇴직 ${KEEP_YEARS_AFTER_EXIT}년 지남(${p.purgeOn}부터 파기 대상)`, href: `/staff/${p.userId}#files`, action: "파기" });
  return out;
}
