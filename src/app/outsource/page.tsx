import Link from "next/link";
import { getDb } from "@/db/runtime";
import { runList, type Q } from "@/modules/listq/core";
import { outsourceList } from "@/modules/listq/defs/purchase";
import { listOutsource, type OsFilter } from "@/modules/purchase/outsource";
import { OS_STATUS, OS_TONE, OUT_TYPES, type OsStatus, type OutType } from "@/modules/purchase/rules";
import { seoulDate } from "@/modules/platform/time";
import { requireUser } from "../_lib/session";
import { ListBar, ListPager } from "../_list-bar";
import { Badge, Card, Empty, Notice, PageTitle } from "../_ui";

const TABS: [OsFilter, string][] = [
  ["open", "진행 중"],
  ["done", "끝·취소"],
  ["all", "전체"],
];

/** 외주 의뢰 목록(F-07-03) */
export default async function OutsourceListPage({ searchParams }: { searchParams: Promise<Q> }) {
  const q = await searchParams;
  const user = await requireUser();
  const db = await getDb();
  const f = (TABS.find(([k]) => k === q.f)?.[0] ?? "open") as OsFilter;
  const lr = await runList(db, outsourceList, user, q);
  const rows = lr.rows;
  const today = seoulDate();
  return (
    <>
      <PageTitle help="outsource" sub="프레임 교정·ADAS 보정·유리·전장·휠처럼 자체로 못 하는 작업을 등록 외주 업체에 맡깁니다. 의뢰는 수리 건 화면의 '외주 의뢰'에서 시작합니다.">
        외주
      </PageTitle>
      {q.notice && <Notice>{q.notice}</Notice>}
      <Card title="외주 의뢰서" help={{ kind: "panel", id: "os.list" }}>
        <div className="mb-3 flex flex-wrap gap-1.5 text-sm">
          {TABS.map(([k, label]) => (
            <Link key={k} href={`/outsource${lr.qs({ f: k === "open" ? null : k })}`} className={`rounded-full border px-3 py-1 ${f === k ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]" : "border-[var(--line)]"}`}>
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
                  <th className="pr-2">차량</th>
                  <th className="pr-2">작업</th>
                  <th className="pr-2">업체</th>
                  <th className="pr-2 text-right">금액</th>
                  <th className="pr-2">납기</th>
                  <th>상태</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--line)]">
                {rows.map(({ j, supplierName, roDocNo, plateNo }) => (
                  <tr key={j.id}>
                    <td className="py-2 pr-2 font-mono text-xs whitespace-nowrap">
                      <Link href={`/outsource/${j.id}`} className="text-[var(--accent)]">
                        {j.docNo}
                      </Link>
                    </td>
                    <td className="pr-2 text-xs whitespace-nowrap">
                      {plateNo} {roDocNo}
                    </td>
                    <td className="pr-2">{OUT_TYPES[j.workType as OutType]}</td>
                    <td className="pr-2">{supplierName}</td>
                    <td className="pr-2 text-right whitespace-nowrap">{j.amountWon.toLocaleString("ko-KR")}</td>
                    <td className={`pr-2 text-xs whitespace-nowrap ${["requested", "out"].includes(j.status) && j.dueOn < today ? "font-bold text-[var(--danger)]" : ""}`}>{j.dueOn}</td>
                    <td>
                      <Badge tone={OS_TONE[j.status as OsStatus]}>{OS_STATUS[j.status as OsStatus]}</Badge>
                      {j.redoCount > 0 && <Badge tone="warn">재작업 {j.redoCount}</Badge>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>해당하는 외주가 없습니다.</Empty>
        )}
        <ListPager r={lr} />
      </Card>
    </>
  );
}
