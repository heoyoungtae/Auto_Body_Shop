import Link from "next/link";
import { getDb } from "@/db/runtime";
import { can } from "@/modules/auth/permissions";
import { listFixtures, type FixtureFilter } from "@/modules/purchase/fixture";
import { FX_CATEGORIES, FX_STATUS, FX_TONE, type FxCategory, type FxStatus } from "@/modules/purchase/rules";
import { requireUser } from "../_lib/session";
import { Badge, buttonClass, Card, Empty, Notice, PageTitle } from "../_ui";

const TABS: [FixtureFilter, string][] = [
  ["active", "사용 중 전체"],
  ["mine", "내 지급품"],
  ["asset", "자산 비품"],
  ["problem", "확인할 것"],
  ["disposed", "처분"],
  ["all", "전체"],
];

/** 비품 대장(F-07-04) */
export default async function FixturesPage({ searchParams }: { searchParams: Promise<{ f?: string; holder?: string; notice?: string }> }) {
  const q = await searchParams;
  const user = await requireUser();
  const db = await getDb();
  const manage = can(user, "fixture.manage");
  const f = (TABS.find(([k]) => k === q.f)?.[0] ?? (manage ? "active" : "mine")) as FixtureFilter;
  const rows = await listFixtures(db, user, f, q.holder);
  const total = rows.reduce((s, r) => s + r.f.priceWon, 0);
  return (
    <>
      <PageTitle
        help="fixtures"
        sub="공구·보호구·전산·집기 같은 비품을 관리 번호로 등록하고, 누가 어디서 쓰는지와 지급품 수령을 남깁니다. 매년 12월에 실물을 확인합니다."
        actions={
          manage && (
            <div className="flex flex-wrap gap-2">
              <Link href="/fixtures/new" className={buttonClass()}>
                비품 등록
              </Link>
              <Link href="/fixtures/check" className={buttonClass("secondary")}>
                실물 확인
              </Link>
              <Link href="/fixtures/labels" className={buttonClass("secondary")}>
                라벨 인쇄
              </Link>
            </div>
          )
        }
      >
        비품·자산
      </PageTitle>
      {q.notice && <Notice>{q.notice}</Notice>}
      <Card title="비품 대장" help={{ kind: "panel", id: "fx.list" }}>
        <div className="mb-3 flex flex-wrap gap-1.5 text-sm">
          {TABS.filter(([k]) => manage || k === "mine").map(([k, label]) => (
            <Link key={k} href={`/fixtures?f=${k}`} className={`rounded-full border px-3 py-1 ${f === k ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]" : "border-[var(--line)]"}`}>
              {label}
            </Link>
          ))}
        </div>
        {rows.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-[var(--muted)]">
                <tr>
                  <th className="py-1.5 pr-2">관리 번호</th>
                  <th className="pr-2">품명</th>
                  <th className="pr-2">구분</th>
                  <th className="pr-2">위치</th>
                  <th className="pr-2">사용자</th>
                  <th className="pr-2 text-right">구입 가격</th>
                  <th>상태</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--line)]">
                {rows.map(({ f: x, holderName }) => (
                  <tr key={x.id}>
                    <td className="py-2 pr-2 font-mono text-xs whitespace-nowrap">
                      <Link href={`/fixtures/${x.id}`} className="text-[var(--accent)]">
                        {x.no}
                      </Link>
                    </td>
                    <td className="pr-2">
                      {x.name}
                      {x.asset && <Badge tone="accent">자산</Badge>}
                    </td>
                    <td className="pr-2 text-xs">{FX_CATEGORIES[x.category as FxCategory]}</td>
                    <td className="pr-2 text-xs">{x.location ?? "-"}</td>
                    <td className="pr-2 text-xs whitespace-nowrap">
                      {holderName ?? "공용"}
                      {x.holderId && !x.receivedAt && <Badge tone="warn">수령 전</Badge>}
                    </td>
                    <td className="pr-2 text-right whitespace-nowrap">{x.priceWon.toLocaleString("ko-KR")}</td>
                    <td className="whitespace-nowrap">
                      <Badge tone={FX_TONE[x.status as FxStatus]}>{FX_STATUS[x.status as FxStatus]}</Badge>
                      {!x.labeledAt && x.status !== "disposed" && <Badge tone="warn">라벨 없음</Badge>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-right text-xs text-[var(--muted)]">
              {rows.length}개 · 구입 가격 합계 {total.toLocaleString("ko-KR")}원
            </p>
          </div>
        ) : (
          <Empty>{f === "mine" ? "나에게 지급된 비품이 없습니다." : "해당하는 비품이 없습니다."}</Empty>
        )}
      </Card>
    </>
  );
}
