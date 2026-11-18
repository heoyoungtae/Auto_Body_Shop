import Link from "next/link";
import { can } from "@/modules/auth/permissions";
import { AssistForm } from "../../_assist";
import { TextAreaField, TextField } from "../../_input";
import { requireUser } from "../../_lib/session";
import { SubmitButton } from "../../_submit";
import { buttonClass, Card, ErrorBox, PageTitle } from "../../_ui";
import { createBusinessAction } from "../actions";
import { BusinessFields } from "../business-fields";

/** 업체 고객 등록: 렌터카·중고차 상품화(테크베이 등)·법인처럼 외상으로 거래하는 고객. 개인 고객은 상담에서 생긴다 */
export default async function NewBusinessCustomer({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const user = await requireUser();
  if (!can(user, "customer.write")) return <p className="text-sm text-[var(--muted)]">고객 등록은 대표·공장장·상담원이 합니다.</p>;
  return (
    <>
      <PageTitle
        help="customers.new"
        sub="외상으로 거래하고 달마다 청구하는 업체를 등록합니다. 개인 고객은 상담을 적을 때 저절로 등록됩니다."
        actions={
          <Link href="/customers" className={buttonClass("secondary")}>
            고객 목록
          </Link>
        }
      >
        업체 고객 등록
      </PageTitle>
      <ErrorBox message={error} />
      <AssistForm id="customer-biz-new" action={createBusinessAction} className="mt-4 space-y-4" draft>
        <Card title="업체" help={{ kind: "panel", id: "customer.biz" }}>
          <div className="grid gap-4 md:grid-cols-2">
            <TextField help="cust.bizName" name="name" required />
            <TextField help="cust.bizPhone" name="phone" inputMode="tel" autoComplete="off" />
            <div className="md:col-span-2">
              <TextAreaField help="cust.memo" name="memo" rows={2} />
            </div>
          </div>
        </Card>
        <Card title="거래 조건·주문 앱" help={{ kind: "panel", id: "customer.terms" }}>
          <BusinessFields />
        </Card>
        <SubmitButton>업체 고객 등록</SubmitButton>
      </AssistForm>
    </>
  );
}
