import Link from "next/link";
import { getDb } from "@/db/runtime";
import { can } from "@/modules/auth/permissions";
import { AssistForm } from "../../_assist";
import { requireUser } from "../../_lib/session";
import { SubmitButton } from "../../_submit";
import { Card, ErrorBox, PageTitle } from "../../_ui";
import { createSupplierAction } from "../actions";
import { SupplierFields } from "../_form";

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
            <SupplierFields />
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
