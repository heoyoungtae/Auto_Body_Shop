import Link from "next/link";
import { getDb } from "@/db/runtime";
import { can } from "@/modules/auth/permissions";
import { supplierOptions } from "@/modules/purchase/supplier";
import { seoulDate } from "@/modules/platform/time";
import { AssistForm } from "../../_assist";
import { DateField, NumberField } from "../../_input";
import { requireUser } from "../../_lib/session";
import { SubmitButton } from "../../_submit";
import { Card, ErrorBox, PageTitle } from "../../_ui";
import { saveItemAction } from "../actions";
import { ItemFields } from "../_form";

/** 재고 품목 등록 */
export default async function NewStockItemPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const q = await searchParams;
  const user = await requireUser();
  const db = await getDb();
  const sups = await supplierOptions(db);
  return (
    <>
      <PageTitle
        help="stock.new"
        sub="도료·소모품·상비 부품을 재고로 관리하려면 먼저 품목을 등록합니다. 지금 있는 수량을 적으면 기초 재고로 들어갑니다."
        actions={
          <Link href="/stock" className="text-sm text-[var(--accent)]">
            ← 재고
          </Link>
        }
      >
        재고 품목 등록
      </PageTitle>
      <ErrorBox message={q.error} />
      {can(user, "stock.manage") ? (
        <Card title="품목" help={{ kind: "panel", id: "stock.item" }}>
          <AssistForm id="stock-new" action={saveItemAction} className="grid gap-3 md:grid-cols-2">
            <ItemFields suppliers={sups} />
            <NumberField help="st.openingQty" name="openingQty" min={0} defaultValue={0} />
            <DateField help="st.openingExpiresOn" name="openingExpiresOn" min={seoulDate()} quick={[]} />
            <div className="md:col-span-2">
              <SubmitButton>등록</SubmitButton>
            </div>
          </AssistForm>
        </Card>
      ) : (
        <p className="text-sm text-[var(--muted)]">재고 품목은 공장장·대표가 등록합니다.</p>
      )}
    </>
  );
}
