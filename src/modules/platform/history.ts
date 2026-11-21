// 기록 변경 이력(STD-Q 8절, 2026-11-21 대표 결정): 앱이 모든 저장·결재 때 남기는 감사 기록(audit_log)을 기록 한 건 기준으로 보여 준다.
// 기록마다 감사 기록의 대상 번호가 문서 번호(예: RC-2611-0001)이거나 내부 id 라서, 둘 다 열쇠로 찾는다.
import { desc, inArray } from "drizzle-orm";
import type { Db } from "@/db/client";
import { appUser, auditLog } from "@/db/schema";
import { actionLabel } from "@/modules/journal/labels";

/** 바뀐 칸 이름(감사 기록의 영어 키 → 화면 말). 없는 키는 그대로 */
const KEY_LABEL: Record<string, string> = {
  title: "제목",
  name: "이름",
  rev: "판",
  status: "상태",
  note: "메모",
  body: "내용",
  amount: "금액",
  reason: "사유",
  dueOn: "기한",
  ownerId: "담당",
  party: "상대",
  kind: "구분",
  sentOn: "보낸 날",
  via: "방법",
  doneNote: "처리 결과",
  reviewedOn: "검토일",
  count: "건수",
  added: "더한 수",
  qty: "수량",
  price: "단가",
};

export type HistoryRow = { at: Date; who: string; label: string; changes: { key: string; before: string; after: string }[] };

const short = (v: unknown): string => {
  if (v == null) return "";
  if (typeof v === "string") return v.length > 80 ? `${v.slice(0, 80)}…` : v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  const s = JSON.stringify(v);
  return s.length > 80 ? `${s.slice(0, 80)}…` : s;
};

/** 감사 기록 before/after → 칸별 '전 → 후' */
export function diffOf(before: unknown, after: unknown): HistoryRow["changes"] {
  const b = before && typeof before === "object" && !Array.isArray(before) ? (before as Record<string, unknown>) : before == null ? {} : { 값: before };
  const a = after && typeof after === "object" && !Array.isArray(after) ? (after as Record<string, unknown>) : after == null ? {} : { 값: after };
  const keys = [...new Set([...Object.keys(b), ...Object.keys(a)])];
  return keys
    .map((k) => ({ key: KEY_LABEL[k] ?? k, before: short(b[k]), after: short(a[k]) }))
    .filter((c) => c.before !== c.after);
}

/** 기록 한 건의 이력(최근 순). keys = 그 기록의 문서 번호·id 들 */
export async function recordHistory(db: Db, keys: string[], limit = 200): Promise<HistoryRow[]> {
  const ks = [...new Set(keys.filter(Boolean))];
  if (!ks.length) return [];
  const rows = await db.select().from(auditLog).where(inArray(auditLog.entityId, ks)).orderBy(desc(auditLog.at), desc(auditLog.id)).limit(limit);
  const ids = [...new Set(rows.map((r) => r.actorId).filter((x): x is string => !!x))];
  const users = ids.length ? await db.select({ id: appUser.id, name: appUser.name }).from(appUser).where(inArray(appUser.id, ids)) : [];
  const nm = new Map(users.map((u) => [u.id, u.name]));
  return rows.map((r) => ({ at: r.at, who: r.actorId ? (nm.get(r.actorId) ?? "(지운 계정)") : "앱(자동)", label: actionLabel(r.action, r.entityType), changes: diffOf(r.before, r.after) }));
}
