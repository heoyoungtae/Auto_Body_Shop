// 업체 고객 칸(새 업체 등록·고객 화면 같이 씀): 사업자번호·담당자·세금계산서·결제 조건·외상 한도·주문 앱
import { AR_PAY_TERMS, INVOICE_MODES, PORTALS } from "@/modules/money/credit-rules";
import { NumberField, RadioRow, TextAreaField, TextField } from "../_input";
import { ShowWhen } from "../consults/show-when";

export type BizValues = {
  bizNo?: string | null;
  contactName?: string | null;
  taxEmail?: string | null;
  payTerm?: string | null;
  payDay?: number | null;
  creditLimitWon?: number | null;
  invoiceMode?: string | null;
  portal?: string | null;
  portalUrl?: string | null;
  portalNote?: string | null;
};

const opts = (o: Record<string, string>) => Object.entries(o).map(([value, label]) => ({ value, label }));

export function BusinessFields({ v }: { v?: BizValues }) {
  const term = v?.payTerm ?? "next_day";
  const portal = v?.portal ?? "none";
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <TextField help="cust.bizNo" name="bizNo" required inputMode="numeric" defaultValue={v?.bizNo ?? ""} />
      <TextField help="cust.contactName" name="contactName" defaultValue={v?.contactName ?? ""} />
      <TextField help="cust.taxEmail" name="taxEmail" type="email" defaultValue={v?.taxEmail ?? ""} />
      <NumberField help="cust.creditLimit" name="creditLimitWon" unit="원" min={0} defaultValue={v?.creditLimitWon ?? null} />
      <div className="md:col-span-2">
        {/* 결제일은 '익월 ○일'일 때만 */}
        <ShowWhen field="payTerm" initial={term} cases={{ next_day: <NumberField help="cust.payDay" name="payDay" unit="일" min={1} max={31} required defaultValue={v?.payDay ?? 10} /> }}>
          <RadioRow help="cust.payTerm" name="payTerm" required defaultValue={term} options={opts(AR_PAY_TERMS)} />
        </ShowWhen>
      </div>
      <div className="md:col-span-2">
        <RadioRow help="cust.invoiceMode" name="invoiceMode" required defaultValue={v?.invoiceMode ?? "monthly"} options={opts(INVOICE_MODES)} />
      </div>
      <div className="md:col-span-2">
        <ShowWhen
          field="portal"
          initial={portal}
          cases={{
            techbay: (
              <div className="grid gap-4 md:grid-cols-2">
                <TextField help="cust.portalUrl" name="portalUrl" type="url" placeholder="https://techbay-reconditioning.prnd.co.kr" defaultValue={v?.portalUrl ?? ""} />
                <TextAreaField help="cust.portalNote" name="portalNote" rows={2} defaultValue={v?.portalNote ?? ""} />
              </div>
            ),
            other: (
              <div className="grid gap-4 md:grid-cols-2">
                <TextField help="cust.portalUrl" name="portalUrl" type="url" required defaultValue={v?.portalUrl ?? ""} />
                <TextAreaField help="cust.portalNote" name="portalNote" rows={2} defaultValue={v?.portalNote ?? ""} />
              </div>
            ),
          }}
        >
          <RadioRow help="cust.portal" name="portal" defaultValue={portal} options={[{ value: "none", label: "없음" }, ...opts(PORTALS)]} />
        </ShowWhen>
      </div>
    </div>
  );
}
