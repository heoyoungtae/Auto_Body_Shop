import Link from "next/link";
import { getDb } from "@/db/runtime";
import { mySlips } from "@/modules/staff/payroll";
import { requireUser } from "../../_lib/session";
import { Card, Empty, fmtTime, PageTitle } from "../../_ui";

/** 내 임금명세서: 지급된 달만 */
export default async function MySlipsPage() {
  const user = await requireUser();
  const list = await mySlips(await getDb(), user);
  return (
    <>
      <PageTitle
        help="payroll.me"
        sub="급여가 지급되면 그 달 명세서가 여기에 생깁니다. 다른 사람의 급여는 볼 수 없습니다."
      >
        내 임금명세서
      </PageTitle>
      <Card title="달별 명세서" help={{ kind: "panel", id: "pay.mine" }}>
        {list.length ? (
          <ul className="divide-y divide-[var(--line)] text-sm">
            {list.map((x) => (
              <li key={x.id} className="flex flex-wrap items-center gap-2 py-2">
                <Link
                  href={`/payroll/slip/${x.id}`}
                  className="font-medium text-[var(--accent)]"
                >
                  {x.ym}
                </Link>
                <span className="text-xs text-[var(--muted)]">
                  {x.payDate} 지급 · 실지급 {x.net.toLocaleString("ko-KR")}원
                  {x.viewedAt
                    ? ` · ${fmtTime(x.viewedAt)} 열람`
                    : " · 새 명세서"}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <Empty>아직 받은 명세서가 없습니다.</Empty>
        )}
      </Card>
    </>
  );
}
