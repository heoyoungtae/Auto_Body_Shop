import Link from "next/link";
import { getDb } from "@/db/runtime";
import { can } from "@/modules/auth/permissions";
import { listStock } from "@/modules/purchase/stock";
import { listRepairs } from "@/modules/repair/service";
import { AssistForm } from "../../_assist";
import { NumberField, SelectField, TextField } from "../../_input";
import { requireUser } from "../../_lib/session";
import { SubmitButton } from "../../_submit";
import { Card, ErrorBox, Notice, PageTitle } from "../../_ui";
import { stockAction } from "../actions";

/** 자재 사용 기록(휴대폰): 자재·양·어느 차 */
export default async function StockUsePage({ searchParams }: { searchParams: Promise<{ item?: string; ro?: string; error?: string; notice?: string }> }) {
  const q = await searchParams;
  const user = await requireUser();
  const db = await getDb();
  const [items, ros] = await Promise.all([listStock(db, "all"), listRepairs(db, "open")]);
  const working = ros.filter((r) => ["working", "inspecting", "estimating", "checked"].includes(r.status));
  const back = `/stock/use${q.item ? `?item=${q.item}` : ""}`;
  return (
    <>
      <PageTitle
        help="stock.use"
        sub="쓴 자재와 양을 적으면 재고에서 빠집니다. 유효기간 있는 도료는 빠른 것부터 빠지고, 지난 것은 쓸 수 없습니다."
        actions={
          <Link href="/stock" className="text-sm text-[var(--accent)]">
            ← 재고
          </Link>
        }
      >
        자재 사용 기록
      </PageTitle>
      <ErrorBox message={q.error} />
      {q.notice && <Notice>{q.notice}</Notice>}
      {!can(user, "stock.use") ? (
        <p className="text-sm text-[var(--muted)]">자재 사용은 기술자·공장장이 적습니다.</p>
      ) : (
        <Card title="사용" help={{ kind: "panel", id: "stock.use" }}>
          <AssistForm id={`stock-use-${q.item ?? "x"}`} action={stockAction} className="grid gap-3 md:grid-cols-2">
            <input type="hidden" name="intent" value="use" />
            <input type="hidden" name="back" value={back} />
            <div className="md:col-span-2">
              <SelectField help="st.item" name="itemId" required defaultValue={q.item ?? ""} placeholder="자재 고르기" options={items.map((i) => ({ value: i.id, label: `${i.name}${i.spec ? ` ${i.spec}` : ""} · 남은 ${i.qty}${i.unit}${i.location ? ` · ${i.location}` : ""}${i.windDown ? ` · 소진 후 중지${i.replacedByName ? `(다 쓰면 대신 ${i.replacedByName})` : ""}` : ""}` }))} />
            </div>
            <NumberField help="st.qty" name="qty" required min={1} defaultValue={1} />
            <SelectField help="st.roId" name="repairOrderId" defaultValue={q.ro ?? ""} placeholder="공용(수리 건 없음)" options={working.map((r) => ({ value: r.id, label: `${r.plateNo} ${r.model ?? ""} · ${r.docNo}` }))} />
            <div className="md:col-span-2">
              <TextField help="st.useNote" name="useNote" />
            </div>
            <div className="md:col-span-2">
              <SubmitButton full>사용 기록</SubmitButton>
            </div>
          </AssistForm>
        </Card>
      )}
    </>
  );
}
