// 감사 로그 기록 — 앱 설계서 9.3: 누가, 언제, 무엇을 바꿨는지
import type { Db } from "@/db/client";
import { auditLog } from "@/db/schema";

export type AuditEntry = {
  actorId: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  ip?: string | null;
  userAgent?: string | null;
};

export async function writeAudit(db: Db, e: AuditEntry): Promise<void> {
  await db.insert(auditLog).values({
    actorId: e.actorId,
    action: e.action,
    entityType: e.entityType,
    entityId: e.entityId ?? null,
    before: e.before ?? null,
    after: e.after ?? null,
    ip: e.ip ?? null,
    userAgent: e.userAgent ?? null,
  });
}
