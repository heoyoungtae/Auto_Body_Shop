// 기록 한 건의 변경 이력 카드(대표·품질 담당만 보임). 기록 화면 아래에 붙인다
import type { Db } from "@/db/client";
import type { CurrentUser } from "@/modules/auth/service";
import { can } from "@/modules/auth/permissions";
import { recordHistory } from "@/modules/platform/history";
import { Card, fmtTime } from "./_ui";

export async function HistoryCard({ db, user, keys }: { db: Db; user: CurrentUser; keys: string[] }) {
  if (!can(user, "records.history")) return null;
  const rows = await recordHistory(db, keys);
  return (
    <Card title={`변경 이력 ${rows.length}건`} help={{ kind: "panel", id: "records.history" }}>
      {rows.length ? (
        <ol className="space-y-2 text-sm">
          {rows.map((r, i) => (
            <li key={i} className="border-l-2 border-[var(--line)] pl-3">
              <p>
                <span className="font-medium">{r.label}</span> <span className="text-xs text-[var(--muted)]">{r.who} · {fmtTime(r.at)}</span>
              </p>
              {r.changes.length > 0 && (
                <ul className="mt-0.5 text-xs text-[var(--muted)]">
                  {r.changes.map((c, j) => (
                    <li key={j}>
                      {c.key}: {c.before ? <s>{c.before}</s> : null}
                      {c.before && c.after ? " → " : ""}
                      {c.after}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-sm text-[var(--muted)]">남은 이력이 없습니다.</p>
      )}
    </Card>
  );
}
