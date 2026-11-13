import Link from "next/link";
import { getDb } from "@/db/runtime";
import { runList, type Q } from "@/modules/listq/core";
import { suppliersList } from "@/modules/listq/defs/purchase";
import { can } from "@/modules/auth/permissions";
import { SUPPLIER_KINDS, SUPPLIER_STATUS, SUPPLIER_TONE, type SupplierStatus } from "@/modules/purchase/rules";
import { listSuppliers, type SupplierFilter } from "@/modules/purchase/supplier";
import { requireUser } from "../_lib/session";
import { ListBar, ListPager } from "../_list-bar";
import { Badge, buttonClass, Card, Empty, Notice, PageTitle } from "../_ui";

const TABS: [SupplierFilter, string][] = [
  ["registered", "등록 업체"],
  ["candidate", "후보·승인 대기"],
  ["stopped", "중지·등록 안 함"],
  ["all", "전체"],
];

/** 협력업체 대장(F-07-01) */
export default async function SuppliersPage({ searchParams }: { searchParams: Promise<Q> }) {
  const q = await searchParams;
  const user = await requireUser();
  const db = await getDb();
  const f = (TABS.find(([k]) => k === q.f)?.[0] ?? "registered") as SupplierFilter;
  const lr = await runList(db, suppliersList, user, q);
  const rows = lr.rows;
  return (
    <>
      <PageTitle
        help="suppliers"
        sub="부품·도료·소모품을 사거나 외주를 맡길 업체입니다. 서류를 확인하고 평가해 70점 이상이면 대표 승인으로 등록하고, 매년 12월 다시 평가합니다."
        actions={
          can(user, "supplier.manage") && (
            <Link href="/suppliers/new" className={buttonClass()}>
              후보 업체 등록
            </Link>
          )
        }
      >
        협력업체
      </PageTitle>
      {q.notice && <Notice>{q.notice}</Notice>}
      <Card title="협력업체 대장" help={{ kind: "panel", id: "sup.list" }}>
        <div className="mb-3 flex flex-wrap gap-1.5 text-sm">
          {TABS.map(([k, label]) => (
            <Link key={k} href={`/suppliers${lr.qs({ f: k === "registered" ? null : k })}`} className={`rounded-full border px-3 py-1 ${f === k ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]" : "border-[var(--line)]"}`}>
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
                  <th className="py-1.5 pr-2">업체</th>
                  <th className="pr-2">분야</th>
                  <th className="pr-2">품목</th>
                  <th className="pr-2">연락처</th>
                  <th className="pr-2">점수</th>
                  <th>상태</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--line)]">
                {rows.map((s) => (
                  <tr key={s.id}>
                    <td className="py-2 pr-2">
                      <Link href={`/suppliers/${s.id}`} className="font-semibold text-[var(--accent)]">
                        {s.name}
                      </Link>
                      {s.emergencyOn && s.status !== "registered" && <Badge tone="warn">긴급 사용</Badge>}
                    </td>
                    <td className="pr-2 text-xs">{s.kinds.map((k) => SUPPLIER_KINDS[k as keyof typeof SUPPLIER_KINDS]).join("·")}</td>
                    <td className="pr-2 text-xs text-[var(--muted)]">{s.items ?? "-"}</td>
                    <td className="pr-2 text-xs whitespace-nowrap">{[s.contactName, s.phone].filter(Boolean).join(" ") || "-"}</td>
                    <td className="pr-2 text-xs">{s.score ?? "-"}</td>
                    <td>
                      <Badge tone={SUPPLIER_TONE[s.status as SupplierStatus]}>{SUPPLIER_STATUS[s.status as SupplierStatus]}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>{f === "registered" ? "등록된 협력업체가 없습니다. 후보 업체를 등록하고 평가하세요." : "해당하는 업체가 없습니다."}</Empty>
        )}
        <ListPager r={lr} />
      </Card>
    </>
  );
}
