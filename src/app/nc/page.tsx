import Link from "next/link";
import { getDb } from "@/db/runtime";
import { runList, type Q } from "@/modules/listq/core";
import { ncList } from "@/modules/listq/defs/quality";
import { NC_SOURCES, NC_STATUS, NC_TONE, type NcStatus } from "@/modules/quality/rules";
import { seoulDate } from "@/modules/platform/time";
import { requireUser } from "../_lib/session";
import { ListBar, ListPager } from "../_list-bar";
import { Badge, buttonClass, Card, Empty, fmtTime, PageTitle } from "../_ui";

/** 부적합·시정 조치 목록(F-Q-10) */
export default async function NcListPage({ searchParams }: { searchParams: Promise<Q> }) {
  const q = await searchParams;
  const user = await requireUser();
  // 예전 주소(?s=closed|all|openish)는 상태로 읽는다(지금 s 는 찾기 칸)
  if (q.s === "closed" || q.s === "all" || q.s === "openish") {
    q.st = q.s;
    delete q.s;
  }
  const db = await getDb();
  const status = q.st === "closed" ? "closed" : q.st === "all" ? "all" : "openish";
  const lr = await runList(db, ncList, user, q);
  const rows = lr.rows;
  const today = seoulDate();
  const link = (s: string, src = q.src) => `/nc${lr.qs({ st: s === "openish" ? null : s, src: src || null })}`;
  return (
    <>
      <PageTitle
        help="nc.list"
        sub="기준에서 벗어난 일을 누구나 발행하고, 원인 분석 → 시정 조치 → 효과 확인 → 종결까지 따라갑니다(STD-Q Q.9)."
        actions={
          <Link href="/nc/new" className={buttonClass()}>
            부적합 발행
          </Link>
        }
      >
        부적합·시정 조치
      </PageTitle>
      <Card title="보고서" help={{ kind: "panel", id: "nc.list" }}>
        <div className="mb-3 flex flex-wrap gap-1.5 text-sm">
          {(
            [
              ["openish", "진행 중"],
              ["closed", "종결"],
              ["all", "전체"],
            ] as const
          ).map(([k, label]) => (
            <Link key={k} href={link(k)} className={`rounded-full border px-3 py-1 ${status === k ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]" : "border-[var(--line)]"}`}>
              {label}
            </Link>
          ))}
          <span className="mx-1 text-[var(--line-strong)]">|</span>
          {Object.entries(NC_SOURCES).map(([k, label]) => (
            <Link key={k} href={q.src === k ? link(status, "") : link(status, k)} className={`rounded-full border px-2.5 py-1 text-xs ${q.src === k ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]" : "border-[var(--line)]"}`}>
              {label}
            </Link>
          ))}
        </div>
        <ListBar r={lr} bare />
        {rows.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-[var(--muted)]">
                <tr>
                  <th className="py-1.5 pr-2">번호</th>
                  <th className="pr-2">출처</th>
                  <th className="pr-2">내용</th>
                  <th className="pr-2">관련 건</th>
                  <th className="pr-2">발생</th>
                  <th className="pr-2">조치 담당·기한</th>
                  <th>상태</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--line)]">
                {rows.map(({ n, assigneeName }) => (
                  <tr key={n.id}>
                    <td className="py-2 pr-2 font-mono text-xs">
                      <Link href={`/nc/${n.id}`} className="text-[var(--accent)]">
                        {n.docNo}
                      </Link>
                      {n.major && <Badge tone="danger">중대</Badge>}
                    </td>
                    <td className="pr-2">{NC_SOURCES[n.source as keyof typeof NC_SOURCES]}</td>
                    <td className="max-w-md pr-2">{n.content}</td>
                    <td className="pr-2 text-xs">{n.refLabel ?? "-"}</td>
                    <td className="pr-2 text-xs">{fmtTime(n.occurredAt)}</td>
                    <td className="pr-2 text-xs">
                      {assigneeName ?? "-"}
                      {n.dueOn && (
                        <span className={n.status === "planned" && n.dueOn < today ? "font-bold text-[var(--danger)]" : ""}> · {n.dueOn}</span>
                      )}
                    </td>
                    <td>
                      <Badge tone={NC_TONE[n.status as NcStatus]}>{NC_STATUS[n.status as NcStatus]}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>{status === "openish" ? "진행 중인 부적합이 없습니다." : "보고서가 없습니다."}</Empty>
        )}
        <ListPager r={lr} />
      </Card>
    </>
  );
}
