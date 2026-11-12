import Link from "next/link";
import { getDb } from "@/db/runtime";
import { can } from "@/modules/auth/permissions";
import { depreciationRegister } from "@/modules/asset/service";
import { DEP_METHODS } from "@/modules/asset/rules";
import { seoulDate } from "@/modules/platform/time";
import { requireUser } from "../../_lib/session";
import { buttonClass, Card, Empty, PageTitle } from "../../_ui";

const won = (n: number) => n.toLocaleString("ko-KR");

/** 감가상각 대장(대표 지시 2026-11-12): 자사 소유 비품·설비의 그 해 상각비·누계·장부가 */
export default async function DepreciationPage({ searchParams }: { searchParams: Promise<{ y?: string }> }) {
  const q = await searchParams;
  const user = await requireUser();
  if (!can(user, "expense.pay") && !can(user, "fixture.manage")) {
    return (
      <>
        <PageTitle help="money.depreciation">감가상각 대장</PageTitle>
        <p className="text-sm text-[var(--muted)]">감가상각 대장은 회계 담당·대표가 봅니다.</p>
      </>
    );
  }
  const now = Number(seoulDate().slice(0, 4));
  const year = /^\d{4}$/.test(q.y ?? "") ? Number(q.y) : now;
  const rows = await depreciationRegister(await getDb(), year);
  const sum = rows.reduce((t, r) => ({ cost: t.cost + r.cost, dep: t.dep + r.thisYear, accum: t.accum + r.accum, book: t.book + r.book }), { cost: 0, dep: 0, accum: 0, book: 0 });
  return (
    <>
      <PageTitle
        help="money.depreciation"
        sub={`${year}년 · 자사 소유 ${rows.length}개 · 올해 상각비 ${won(sum.dep)}원 · 장부가 ${won(sum.book)}원`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {[now - 1, now, now + 1].map((y) => (
              <Link key={y} href={`/money/depreciation?y=${y}`} className={buttonClass(y === year ? "primary" : "secondary")}>
                {y}
              </Link>
            ))}
            <a href={`/money/depreciation/csv?y=${year}`} className={buttonClass("secondary")}>
              CSV 내려받기
            </a>
          </div>
        }
      >
        감가상각 대장
      </PageTitle>
      <Card title={`${year}년`} help={{ kind: "panel", id: "dep.register" }}>
        {rows.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[52rem] text-sm">
              <thead className="text-left text-xs text-[var(--muted)]">
                <tr>
                  <th className="py-1.5 pr-2 font-medium">번호</th>
                  <th className="py-1.5 pr-2 font-medium">품명</th>
                  <th className="py-1.5 pr-2 font-medium">방법·연수</th>
                  <th className="py-1.5 pr-2 font-medium">사용 시작</th>
                  <th className="py-1.5 pr-2 text-right font-medium">취득가(자본적 지출 포함)</th>
                  <th className="py-1.5 pr-2 text-right font-medium">올해 상각비</th>
                  <th className="py-1.5 pr-2 text-right font-medium">누계</th>
                  <th className="py-1.5 text-right font-medium">장부가</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--line)]">
                {rows.map((r) => (
                  <tr key={r.a.id}>
                    <td className="py-1.5 pr-2">
                      <Link href={r.a.kind === "fixture" ? `/fixtures/${r.a.id}` : `/equipment/${r.a.id}`} className="font-mono text-[var(--accent)]">
                        {r.a.no}
                      </Link>
                    </td>
                    <td className="py-1.5 pr-2">{r.a.name}</td>
                    <td className="py-1.5 pr-2">
                      {DEP_METHODS[r.a.depMethod as keyof typeof DEP_METHODS] ?? r.a.depMethod}
                      {(r.a.depMethod === "sl" || r.a.depMethod === "db") && r.a.usefulYears ? ` ${r.a.usefulYears}년` : ""}
                    </td>
                    <td className="py-1.5 pr-2">{r.a.depStartOn ?? <span className="text-[var(--warn)]">없음</span>}</td>
                    <td className="py-1.5 pr-2 text-right">{won(r.cost)}</td>
                    <td className="py-1.5 pr-2 text-right">{won(r.thisYear)}</td>
                    <td className="py-1.5 pr-2 text-right">{won(r.accum)}</td>
                    <td className="py-1.5 text-right font-semibold">{won(r.book)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 border-[var(--line-strong)] font-semibold">
                <tr>
                  <td colSpan={4} className="py-1.5 pr-2">
                    합계
                  </td>
                  <td className="py-1.5 pr-2 text-right">{won(sum.cost)}</td>
                  <td className="py-1.5 pr-2 text-right">{won(sum.dep)}</td>
                  <td className="py-1.5 pr-2 text-right">{won(sum.accum)}</td>
                  <td className="py-1.5 text-right">{won(sum.book)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        ) : (
          <Empty>자사 소유로 상각하는 비품·설비가 없습니다.</Empty>
        )}
        <p className="mt-3 text-xs text-[var(--muted)]">
          첫해·처분한 해는 쓴 달 수만큼(월할) 상각합니다. 상각이 끝나도 비망가액(취득가의 5%와 1,000원 중 적은 것)은 남깁니다. 빌린 장비·고객 물건은 이 표에 없습니다. 정액법·정률법·내용연수는 세무사와 확인해 정책값과 각 화면에서 정합니다.
        </p>
      </Card>
    </>
  );
}
