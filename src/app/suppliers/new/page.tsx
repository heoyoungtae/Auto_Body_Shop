import Link from "next/link";
import { getDb } from "@/db/runtime";
import { can } from "@/modules/auth/permissions";
import { AssistForm } from "../../_assist";
import { requireUser } from "../../_lib/session";
import { SubmitButton } from "../../_submit";
import { Card, ErrorBox, PageTitle } from "../../_ui";
import { createSupplierAction } from "../actions";
import { SupplierFields, SupplierNote } from "../_form";
import { BankFields } from "../bank-fields";

/** 후보 업체 등록(STD-07 4.1) */
export default async function NewSupplierPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const q = await searchParams;
  const user = await requireUser();
  await getDb();
  return (
    <>
      <PageTitle
        help="suppliers.new"
        sub="거래 전에 사업자등록·품목·단가표·납기·반품 조건을 확인합니다. 등록 평가는 저장한 뒤 다음 화면에서 합니다."
        actions={
          <Link href="/suppliers" className="text-sm text-[var(--accent)]">
            ← 협력업체
          </Link>
        }
      >
        후보 업체 등록
      </PageTitle>
      <ErrorBox message={q.error} />
      {can(user, "supplier.manage") ? (
        <Card title="업체 정보(F-07-01)" help={{ kind: "panel", id: "sup.info" }}>
          <AssistForm id="sup-new" action={createSupplierAction} className="grid gap-3 md:grid-cols-2">
            <SupplierFields noNote />
            <h3 className="mt-2 border-t border-[var(--line)] pt-3 text-sm font-semibold md:col-span-2">입금 계좌(통장 사본을 받았으면)</h3>
            <BankFields bankName="" holder="" hasAccount={false} optional nameField="name" />
            <p className="text-xs text-[var(--muted)] md:col-span-2">
              비워 두고 나중에 업체 화면에서 넣어도 됩니다. 넣은 계좌는 넣은 사람이 아닌 회계 담당·대표가 업체에 전화로 확인해야 지급에 씁니다. 전체 번호는 회계 담당·대표만 봅니다.
            </p>
            <SupplierNote />
            <div className="md:col-span-2">
              <SubmitButton>후보로 등록</SubmitButton>
            </div>
          </AssistForm>
        </Card>
      ) : (
        <p className="text-sm text-[var(--muted)]">협력업체 등록은 공장장·대표가 합니다.</p>
      )}
    </>
  );
}
