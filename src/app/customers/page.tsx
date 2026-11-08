import Link from "next/link";
import { getDb } from "@/db/runtime";
import { recentCustomers, searchCustomers } from "@/modules/customer/service";
import { RESULT_LABEL, seoulParts } from "@/modules/customer/rules";
import { requireUser } from "../_lib/session";
import { Badge, buttonClass, Empty, PageTitle } from "../_ui";

export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  await requireUser();
  const db = await getDb();
  const rows = q?.trim() ? await searchCustomers(db, q, 100) : await recentCustomers(db, 50);
  return (
    <>
      <PageTitle
        help="customers"
        sub="고객은 상담할 때 생깁니다. 같은 전화번호·차량번호는 한 고객으로 모입니다."
        actions={
          <Link href="/consults/new" className={buttonClass()}>
            새 상담
          </Link>
        }
      >
        고객·차량
      </PageTitle>
      <form method="get" className="mb-3 flex gap-2">
        <input type="search" name="q" defaultValue={q} placeholder="전화번호, 끝 4자리, 차량번호, 이름" aria-label="고객 찾기" className="h-11 min-w-0 flex-1 rounded-md border border-[var(--line-strong)] bg-[var(--surface)] px-3" />
        <button className={buttonClass("secondary")}>찾기</button>
      </form>
      <p className="mb-2 text-xs text-[var(--muted)]">{q ? `'${q}' 찾은 결과 ${rows.length}명` : "최근에 상담·수정한 고객 50명"}</p>
      {rows.length ? (
        <ul className="divide-y divide-[var(--line)] rounded-lg border border-[var(--line)] bg-[var(--surface)] text-sm">
          {rows.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 hover:bg-[var(--surface-2)]">
              <Link href={`/customers/${c.id}`} className="min-w-40">
                <b className="text-[var(--accent)]">{c.name}</b> <span className="text-[var(--muted)]">{c.phone ?? "연락처 없음"}</span>
              </Link>
              <span className="flex flex-1 flex-wrap gap-1">
                {c.vehicles.map((v) => (
                  <Badge key={v.id}>
                    {v.plateNo} {v.model ?? ""}
                  </Badge>
                ))}
              </span>
              <span className="flex items-center gap-2 text-xs text-[var(--muted)]">
                {!c.consent.required && <Badge tone="warn">동의 없음</Badge>}
                {c.consent.marketing && <Badge>광고 동의</Badge>}
                {c.last && (
                  <Link href={`/consults/${c.last.id}`} className="hover:underline">
                    {c.last.docNo} {seoulParts(c.last.at).date} {RESULT_LABEL[c.last.result]}
                  </Link>
                )}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <Empty action={<Link href="/consults/new" className={buttonClass()}>새 상담</Link>}>{q ? "찾은 고객이 없습니다." : "아직 고객이 없습니다. 첫 상담을 적으면 고객과 차량이 함께 등록됩니다."}</Empty>
      )}
    </>
  );
}
