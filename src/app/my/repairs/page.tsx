// 수리 이력: 우리 공업사에서 고친 기록(최근 것부터)
import Link from "next/link";
import { getDb } from "@/db/runtime";
import { myRepairs } from "@/modules/carbook/service";
import { Badge, Empty, PageTitle } from "../../_ui";
import { requireMy } from "../_session";
import { LinkOnlyNote } from "../_parts";

export default async function MyRepairsPage() {
  const s = await requireMy();
  const list = await myRepairs(await getDb(), s);
  return (
    <div className="space-y-4 pt-2">
      <PageTitle help="my.repairs" sub={`${list.length}건`}>
        수리 이력
      </PageTitle>
      {s.scope === "link" && <LinkOnlyNote next="/my/repairs" />}
      {list.length ? (
        <ul className="space-y-2">
          {list.map((r) => (
            <li key={r.id}>
              <Link href={`/my/repairs/${r.id}`} className="block rounded-lg border border-[var(--line)] bg-[var(--surface)] p-3 shadow-[var(--shadow)] hover:bg-[var(--surface-2)]">
                <p className="flex items-center justify-between gap-2">
                  <span className="font-semibold">{r.inOn} 입고</span>
                  {r.inWarranty ? <Badge tone="ok">보증 중</Badge> : r.status === "delivered" ? null : <Badge tone="accent">{r.statusLabel}</Badge>}
                </p>
                <p className="text-sm">
                  {r.plateNo} <span className="text-[var(--muted)]">{r.car}</span>
                </p>
                <p className="text-xs text-[var(--muted)]">{[r.deliveredOn ? `${r.deliveredOn} 출고` : null, r.total != null ? `${r.total.toLocaleString("ko-KR")}원` : null].filter(Boolean).join(" · ") || r.statusLabel}</p>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <Empty>아직 수리 기록이 없습니다.</Empty>
      )}
    </div>
  );
}
