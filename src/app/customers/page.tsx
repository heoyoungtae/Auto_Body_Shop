import Link from "next/link";
import { getDb } from "@/db/runtime";
import { runList, type Q } from "@/modules/listq/core";
import { customersList } from "@/modules/listq/defs/repair";
import { RESULT_LABEL, seoulParts } from "@/modules/customer/rules";
import { requireUser } from "../_lib/session";
import { ListBar, ListPager } from "../_list-bar";
import { Badge, buttonClass, Empty, PageTitle } from "../_ui";

export default async function CustomersPage({ searchParams }: { searchParams: Promise<Q> }) {
  const sp = await searchParams;
  if (sp.q && !sp.s) sp.s = sp.q; // 예전 주소(?q=)
  const user = await requireUser();
  const db = await getDb();
  const r = await runList(db, customersList, user, sp);
  const q = r.lq.s;
  const rows = r.rows;
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
      <div className="mb-3">
        <ListBar r={r} unitLabel="명" />
      </div>
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
        <Empty action={<Link href="/consults/new" className={buttonClass()}>새 상담</Link>}>{q || r.loaded ? "조건에 맞는 고객이 없습니다." : "아직 고객이 없습니다. 첫 상담을 적으면 고객과 차량이 함께 등록됩니다."}</Empty>
      )}
      <ListPager r={r} />
    </>
  );
}
