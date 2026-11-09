import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/db/runtime";
import { can } from "@/modules/auth/permissions";
import { MOVE_REASON, STOCK_KINDS, type StockKind } from "@/modules/purchase/rules";
import { getItem } from "@/modules/purchase/stock";
import { supplierOptions } from "@/modules/purchase/supplier";
import { seoulDate } from "@/modules/platform/time";
import { AssistForm } from "../../_assist";
import { TextField } from "../../_input";
import { requireUser } from "../../_lib/session";
import { SubmitButton } from "../../_submit";
import { Badge, buttonClass, Card, ErrorBox, fmtTime, Notice, PageTitle } from "../../_ui";
import { saveItemAction, stockAction } from "../actions";
import { ItemFields } from "../_form";

/** 재고 품목 한 개: 로트(유효기간)·움직임 기록·폐기·품목 고치기 */
export default async function StockItemPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; notice?: string }> }) {
  const { id } = await params;
  const q = await searchParams;
  const user = await requireUser();
  const db = await getDb();
  const r = await getItem(db, id).catch(() => null);
  if (!r) notFound();
  const { i, lots, moves } = r;
  const manage = can(user, "stock.manage");
  const today = seoulDate();
  const sups = manage ? await supplierOptions(db) : [];
  return (
    <>
      <PageTitle
        help="stock.detail"
        sub={`${STOCK_KINDS[i.kind as StockKind]}${i.spec ? ` · ${i.spec}` : ""} · ${i.location ?? "위치 미정"} · 안전 재고 ${i.safetyQty}${i.unit}`}
        actions={
          <div className="flex flex-wrap gap-2">
            {can(user, "stock.use") && (
              <Link href={`/stock/use?item=${id}`} className={buttonClass()}>
                사용 기록
              </Link>
            )}
            <Link href="/stock" className="self-center text-sm text-[var(--accent)]">
              ← 재고
            </Link>
          </div>
        }
      >
        {i.name}{" "}
        <Badge tone={i.safetyQty > 0 && i.qty < i.safetyQty ? "danger" : "ok"}>
          {i.qty}
          {i.unit}
        </Badge>
      </PageTitle>
      <ErrorBox message={q.error} />
      {q.notice && <Notice>{q.notice}</Notice>}
      <div className="grid gap-4 xl:grid-cols-2">
        {i.expiryTracked && (
          <Card title="로트·유효기간(빠른 것부터 씀)" help={{ kind: "panel", id: "stock.lots" }}>
            {lots.length ? (
              <ul className="divide-y divide-[var(--line)] text-sm">
                {lots.map((l) => (
                  <li key={l.id} className="flex flex-wrap items-center gap-2 py-2">
                    <span className={l.expiresOn < today ? "font-bold text-[var(--danger)]" : ""}>
                      {l.expiresOn}까지 · {l.qty}
                      {i.unit}
                      {l.lot ? ` · 로트 ${l.lot}` : ""}
                    </span>
                    {l.expiresOn < today && <Badge tone="danger">사용 금지</Badge>}
                    {l.expiresOn < today && manage && (
                      <AssistForm id={`stock-discard-${l.id}`} action={stockAction} className="flex flex-wrap items-end gap-2">
                        <input type="hidden" name="id" value={id} />
                        <input type="hidden" name="intent" value="discard" />
                        <input type="hidden" name="lotId" value={l.id} />
                        <TextField help="st.discardNote" name="discardNote" />
                        <SubmitButton variant="danger">폐기 처리</SubmitButton>
                      </AssistForm>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-[var(--muted)]">남은 로트가 없습니다.</p>
            )}
          </Card>
        )}
        <Card title="움직임(최근 50건)" help={{ kind: "panel", id: "stock.moves" }}>
          {moves.length ? (
            <ul className="divide-y divide-[var(--line)] text-sm">
              {moves.map(({ m, by }) => (
                <li key={m.id} className="flex flex-wrap gap-2 py-1.5">
                  <span className="text-xs text-[var(--muted)]">{fmtTime(m.at)}</span>
                  <Badge tone={m.qty > 0 ? "ok" : m.reason === "discard" ? "danger" : "neutral"}>{MOVE_REASON[m.reason as keyof typeof MOVE_REASON]}</Badge>
                  <b>
                    {m.qty > 0 ? "+" : ""}
                    {m.qty}
                    {i.unit}
                  </b>
                  {m.ref && <span className="text-xs">{m.ref}</span>}
                  {m.lot && <span className="text-xs">로트 {m.lot}</span>}
                  {m.note && <span className="text-xs text-[var(--muted)]">{m.note}</span>}
                  <span className="text-xs text-[var(--muted)]">{by ?? ""}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-[var(--muted)]">기록이 없습니다.</p>
          )}
        </Card>
        {manage && (
          <Card title="품목 고치기" help={{ kind: "panel", id: "stock.item" }}>
            <AssistForm id={`stock-edit-${id}`} action={saveItemAction} className="grid gap-3 md:grid-cols-2">
              <input type="hidden" name="id" value={id} />
              <ItemFields i={i} suppliers={sups} />
              <div className="md:col-span-2">
                <SubmitButton>저장</SubmitButton>
              </div>
            </AssistForm>
            {i.qty === 0 && (
              <AssistForm id={`stock-off-${id}`} action={stockAction} className="mt-3" guard={false}>
                <input type="hidden" name="id" value={id} />
                <input type="hidden" name="intent" value="deactivate" />
                <SubmitButton variant="secondary">더 쓰지 않는 품목으로 빼기</SubmitButton>
              </AssistForm>
            )}
          </Card>
        )}
      </div>
    </>
  );
}
