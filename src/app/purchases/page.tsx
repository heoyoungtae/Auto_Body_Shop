import Link from "next/link";
import { getDb } from "@/db/runtime";
import { can } from "@/modules/auth/permissions";
import { listOrders, type OrderFilter } from "@/modules/purchase/order";
import { PO_KINDS, PO_STATUS, PO_TONE, type PoKind, type PoStatus } from "@/modules/purchase/rules";
import { seoulDate } from "@/modules/platform/time";
import { requireUser } from "../_lib/session";
import { Badge, buttonClass, Card, Empty, fmtTime, Notice, PageTitle } from "../_ui";

const TABS: [OrderFilter, string][] = [
  ["open", "진행 중"],
  ["review", "작성·승인"],
  ["receiving", "입고 기다림"],
  ["done", "끝·취소"],
  ["all", "전체"],
];

/** 발주서 목록(F-07-02) */
export default async function PurchasesPage({ searchParams }: { searchParams: Promise<{ f?: string; notice?: string }> }) {
  const q = await searchParams;
  const user = await requireUser();
  const db = await getDb();
  const f = (TABS.find(([k]) => k === q.f)?.[0] ?? "open") as OrderFilter;
  const rows = await listOrders(db, f);
  const today = seoulDate();
  return (
    <>
      <PageTitle
        help="purchases"
        sub="수리 건 부품은 고객이 견적을 승인하면 발주서가 저절로 만들어지고, 도료·소모품은 재고 화면에서 안전 재고 미달 품목으로 만듭니다. 승인(전결) 전에는 발주서를 보낼 수 없습니다."
        actions={
          can(user, "purchase.order") && (
            <Link href="/purchases/new" className={buttonClass()}>
              발주서 만들기
            </Link>
          )
        }
      >
        발주·입고
      </PageTitle>
      {q.notice && <Notice>{q.notice}</Notice>}
      <Card title="발주서" help={{ kind: "panel", id: "po.list" }}>
        <div className="mb-3 flex flex-wrap gap-1.5 text-sm">
          {TABS.map(([k, label]) => (
            <Link key={k} href={`/purchases?f=${k}`} className={`rounded-full border px-3 py-1 ${f === k ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]" : "border-[var(--line)]"}`}>
              {label}
            </Link>
          ))}
        </div>
        {rows.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-[var(--muted)]">
                <tr>
                  <th className="py-1.5 pr-2">번호</th>
                  <th className="pr-2">구분</th>
                  <th className="pr-2">업체</th>
                  <th className="pr-2">수리 건</th>
                  <th className="pr-2 text-right">금액(부가세 포함)</th>
                  <th className="pr-2">납기</th>
                  <th className="pr-2">상태</th>
                  <th>만든 때</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--line)]">
                {rows.map(({ o, supplierName, roDocNo, plateNo }) => {
                  const due = o.replyDueOn ?? o.dueOn;
                  const late = due && due < today && (o.status === "sent" || o.status === "partial");
                  return (
                    <tr key={o.id}>
                      <td className="py-2 pr-2 font-mono text-xs whitespace-nowrap">
                        <Link href={`/purchases/${o.id}`} className="text-[var(--accent)]">
                          {o.docNo}
                        </Link>
                      </td>
                      <td className="pr-2 text-xs">{PO_KINDS[o.kind as PoKind]}</td>
                      <td className="pr-2">{supplierName ?? <span className="text-[var(--danger)]">업체 미정</span>}</td>
                      <td className="pr-2 text-xs whitespace-nowrap">{roDocNo ? `${plateNo} ${roDocNo}` : "-"}</td>
                      <td className="pr-2 text-right whitespace-nowrap">{o.totalWon.toLocaleString("ko-KR")}</td>
                      <td className={`pr-2 text-xs whitespace-nowrap ${late ? "font-bold text-[var(--danger)]" : ""}`}>{due ?? "-"}</td>
                      <td className="pr-2">
                        <Badge tone={PO_TONE[o.status as PoStatus]}>{PO_STATUS[o.status as PoStatus]}</Badge>
                        {o.invoiceNo && <Badge tone="ok">계산서</Badge>}
                      </td>
                      <td className="text-xs whitespace-nowrap text-[var(--muted)]">{fmtTime(o.createdAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>해당하는 발주서가 없습니다.</Empty>
        )}
      </Card>
    </>
  );
}
