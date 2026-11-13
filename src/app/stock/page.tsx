import Link from "next/link";
import { getDb } from "@/db/runtime";
import { runList, type Q } from "@/modules/listq/core";
import { stockList } from "@/modules/listq/defs/purchase";
import { can } from "@/modules/auth/permissions";
import { STOCK_KINDS, STOP_REASONS, suggestOrderQty, type StockKind, type StopReason } from "@/modules/purchase/rules";
import { listStock, type StockFilter } from "@/modules/purchase/stock";
import { seoulDate } from "@/modules/platform/time";
import { AssistForm } from "../_assist";
import { CheckGroup } from "../_input";
import { requireUser } from "../_lib/session";
import { ListBar, ListPager } from "../_list-bar";
import { SubmitButton } from "../_submit";
import { Badge, buttonClass, Card, Empty, ErrorBox, Notice, PageTitle } from "../_ui";
import { stockAction } from "./actions";

const TABS: [StockFilter, string][] = [
  ["all", "전체"],
  ["low", "안전 재고 미달"],
  ["expiry", "유효기간 임박·지남"],
  ["paint", "도료"],
  ["consumable", "소모품"],
  ["part", "상비 부품"],
  ["docs", "문서 기한"],
  ["stopped", "사용 중지"],
];

/** 재고(STD-07 7절): 품목·수량·안전 재고·유효기간, 미달 품목 발주 요청 */
export default async function StockPage({ searchParams }: { searchParams: Promise<Q> }) {
  const q = await searchParams;
  const user = await requireUser();
  const db = await getDb();
  const f = (TABS.find(([k]) => k === q.f)?.[0] ?? "all") as StockFilter;
  const lr = await runList(db, stockList, user, q);
  const rows = lr.rows;
  const low = f === "low" ? rows : await listStock(db, "low");
  const manage = can(user, "stock.manage");
  const today = seoulDate();
  return (
    <>
      <PageTitle
        help="stock"
        sub="입고 검수에서 합격한 수량이 저절로 더해지고, 기술자가 쓴 양을 적으면 빠집니다. 도료는 유효기간 빠른 것부터 빠지고(선입선출) 30일 전에 알림이 갑니다."
        actions={
          <div className="flex flex-wrap gap-2">
            {can(user, "stock.use") && (
              <Link href="/stock/use" className={buttonClass()}>
                자재 사용 기록
              </Link>
            )}
            {manage && (
              <>
                <Link href="/stock/count" className={buttonClass("secondary")}>
                  실사
                </Link>
                <Link href="/stock/new" className={buttonClass("secondary")}>
                  품목 등록
                </Link>
              </>
            )}
          </div>
        }
      >
        재고
      </PageTitle>
      <ErrorBox message={q.error} />
      {q.notice && <Notice>{q.notice}</Notice>}
      {manage && low.length > 0 && (
        <Card title={`안전 재고 미달 ${low.length}개 품목`} help={{ kind: "panel", id: "stock.low" }}>
          <AssistForm id="stock-order-low" action={stockAction} className="space-y-3" guard={false}>
            <input type="hidden" name="intent" value="orderLow" />
            <input type="hidden" name="back" value="/stock?f=low" />
            <CheckGroup help="po.stockItem" name="itemIds" label="발주할 품목" defaultChecked={low.map((r) => r.id)} options={low.map((r) => ({ value: r.id, label: `${r.name} ${r.qty}/${r.safetyQty}${r.unit} → ${suggestOrderQty(r)}${r.unit}${r.supplierName ? ` · ${r.supplierName}` : " · 업체 미정"}` }))} />
            <SubmitButton>발주 요청 만들기(업체별 한 장)</SubmitButton>
          </AssistForm>
        </Card>
      )}
      <div className="mt-4">
        <Card title="재고 품목" help={{ kind: "panel", id: "stock.list" }}>
          <div className="mb-3 flex flex-wrap gap-1.5 text-sm">
            {TABS.map(([k, label]) => (
              <Link key={k} href={`/stock${lr.qs({ f: k === "all" ? null : k })}`} className={`rounded-full border px-3 py-1 ${f === k ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]" : "border-[var(--line)]"}`}>
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
                    <th className="py-1.5 pr-2">품목</th>
                    <th className="pr-2">구분</th>
                    <th className="pr-2">위치</th>
                    <th className="pr-2 text-right">수량</th>
                    <th className="pr-2 text-right">안전 재고</th>
                    <th className="pr-2">가까운 유효기간</th>
                    <th>업체</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--line)]">
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <td className="py-2 pr-2">
                        <Link href={`/stock/${r.id}`} className="font-semibold text-[var(--accent)]">
                          {r.name}
                        </Link>
                        {r.spec && <span className="ml-1 text-xs text-[var(--muted)]">{r.spec}</span>}
                        {r.windDown && <Badge tone="warn">소진 후 중지</Badge>}
                        {r.docState && <Badge tone={r.docState === "expired" ? "danger" : "warn"}>{r.docState === "expired" ? "문서 기한 지남" : "문서 기한 임박"}</Badge>}
                        {(r.windDown || !r.active) && r.stopReason && (
                          <span className="block text-xs text-[var(--muted)]">
                            {STOP_REASONS[r.stopReason as StopReason] ?? r.stopReason}
                            {r.replacedByName && ` → 대신 ${r.replacedByName}`}
                          </span>
                        )}
                      </td>
                      <td className="pr-2 text-xs">{STOCK_KINDS[r.kind as StockKind]}</td>
                      <td className="pr-2 text-xs">{r.location ?? "-"}</td>
                      <td className={`pr-2 text-right whitespace-nowrap ${r.low ? "font-bold text-[var(--danger)]" : ""}`}>
                        {r.qty}
                        {r.unit}
                      </td>
                      <td className="pr-2 text-right text-xs whitespace-nowrap">
                        {r.safetyQty}
                        {r.unit}
                      </td>
                      <td className="pr-2 text-xs whitespace-nowrap">
                        {r.lots[0] ? (
                          <span className={r.lots[0].expiresOn < today ? "font-bold text-[var(--danger)]" : r.expiring.length ? "text-[var(--warn)]" : ""}>
                            {r.lots[0].expiresOn}
                            {r.expired.length > 0 && <Badge tone="danger">지남</Badge>}
                          </span>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td className="text-xs">{r.supplierName ?? "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty>{f === "all" ? "등록된 재고 품목이 없습니다. 도료·소모품부터 등록하세요." : f === "stopped" ? "사용 중지한 품목이 없습니다." : "해당하는 품목이 없습니다."}</Empty>
          )}
        <ListPager r={lr} />
        </Card>
      </div>
    </>
  );
}
