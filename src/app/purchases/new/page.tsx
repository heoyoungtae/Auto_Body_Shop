import Link from "next/link";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/runtime";
import { repairOrder, vehicle } from "@/db/schema";
import { can } from "@/modules/auth/permissions";
import { roDueDate } from "@/modules/purchase/order";
import { SUPPLIER_STATUS, type SupplierStatus } from "@/modules/purchase/rules";
import { supplierOptions } from "@/modules/purchase/supplier";
import { addDays, seoulDate } from "@/modules/platform/time";
import { AssistForm } from "../../_assist";
import { DateField, SelectField, TextAreaField } from "../../_input";
import { requireUser } from "../../_lib/session";
import { SubmitButton } from "../../_submit";
import { Card, ErrorBox, PageTitle } from "../../_ui";
import { createOrderAction } from "../actions";

/** 발주서 만들기: 수리 건에서 열면 그 차의 부품 발주(?ro=), 아니면 도료·소모품 발주 */
export default async function NewPurchasePage({ searchParams }: { searchParams: Promise<{ ro?: string; error?: string }> }) {
  const q = await searchParams;
  const user = await requireUser();
  const db = await getDb();
  const [ro] = q.ro ? await db.select({ id: repairOrder.id, docNo: repairOrder.docNo, plateNo: vehicle.plateNo }).from(repairOrder).innerJoin(vehicle, eq(vehicle.id, repairOrder.vehicleId)).where(eq(repairOrder.id, q.ro)) : [];
  const due = ro ? await roDueDate(db, ro.id) : null;
  const today = seoulDate();
  const sups = await supplierOptions(db, ro ? "parts" : undefined);
  return (
    <>
      <PageTitle
        help="purchases.new"
        sub={ro ? "견적에 없던 부품을 더 사야 할 때 씁니다(견적 승인 부품은 발주서가 저절로 만들어짐). 견적에 없는 부품은 추가 견적으로 고객 승인을 먼저 받으세요." : "도료·소모품 발주입니다. 안전 재고 미달 품목은 재고 화면에서 고르면 품목이 채워진 발주서가 만들어집니다."}
        actions={
          <Link href="/purchases" className="text-sm text-[var(--accent)]">
            ← 발주·입고
          </Link>
        }
      >
        발주서 만들기
      </PageTitle>
      <ErrorBox message={q.error} />
      {!can(user, "purchase.order") ? (
        <p className="text-sm text-[var(--muted)]">발주는 공장장·대표가 합니다.</p>
      ) : (
        <Card title="발주서 머리" help={{ kind: "panel", id: "po.header" }}>
          <AssistForm id={`po-new-${q.ro ?? "stock"}`} action={createOrderAction} className="grid gap-3 md:grid-cols-2">
            <input type="hidden" name="kind" value={ro ? "repair" : "stock"} />
            <input type="hidden" name="repairOrderId" value={ro?.id ?? ""} />
            {ro && (
              <p className="text-sm md:col-span-2">
                수리 건: <b>{ro.plateNo} {ro.docNo}</b> <span className="text-xs text-[var(--muted)]">(앞 화면에서 불러옴{due ? ` · 출고 약속 ${due}` : ""})</span>
              </p>
            )}
            <SelectField help="po.supplierId" name="supplierId" placeholder="업체 고르기" options={sups.map((s) => ({ value: s.id, label: `${s.name}${s.status === "registered" ? "" : ` (${SUPPLIER_STATUS[s.status as SupplierStatus]})`}${s.leadDays != null ? ` · 보통 ${s.leadDays}일` : ""}` }))} />
            <DateField help="po.dueOn" name="dueOn" min={today} defaultValue={due && due > today ? addDays(due, -1) : addDays(today, 2)} from={due ? "출고 약속일" : undefined} quick={["tomorrow", "week"]} />
            <div className="md:col-span-2">
              <TextAreaField help="po.note" name="note" rows={2} />
            </div>
            <div className="md:col-span-2">
              <SubmitButton>만들고 품목 넣기</SubmitButton>
            </div>
          </AssistForm>
        </Card>
      )}
    </>
  );
}
