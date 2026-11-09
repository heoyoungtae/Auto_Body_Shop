// 외주 의뢰서 칸(새로 만들기·되돌림 뒤 고치기 같이 씀)
import { OUT_TYPES, SUPPLIER_STATUS, type SupplierStatus } from "@/modules/purchase/rules";
import { DateField, NumberField, RadioRow, SelectField, TextAreaField } from "../_input";

type V = { supplierId?: string; workType?: string; scope?: string; required?: string; dueOn?: string | null; amountWon?: number | null; moveOut?: boolean };

export function OutsourceFields({ v, suppliers, today, from }: { v: V; suppliers: { id: string; name: string; status: string; emergencyOn: string | null }[]; today: string; from?: { scope?: string; amount?: string; due?: string; type?: string } }) {
  const hasCandidate = suppliers.some((s) => s.status !== "registered");
  return (
    <>
      <SelectField help="os.supplierId" name="supplierId" required defaultValue={v.supplierId ?? ""} placeholder="외주 업체 고르기" options={suppliers.map((s) => ({ value: s.id, label: `${s.name}${s.status === "registered" ? "" : ` (${SUPPLIER_STATUS[s.status as SupplierStatus]}${s.emergencyOn ? " · 긴급 사용함" : ""})`}` }))} />
      <SelectField help="os.workType" name="workType" required defaultValue={v.workType ?? ""} from={from?.type} options={Object.entries(OUT_TYPES).map(([value, label]) => ({ value, label }))} />
      <div className="md:col-span-2">
        <TextAreaField help="os.scope" name="scope" required rows={2} defaultValue={v.scope ?? ""} from={from?.scope} />
      </div>
      <div className="md:col-span-2">
        <TextAreaField help="os.required" name="required" required rows={2} defaultValue={v.required ?? ""} />
      </div>
      <DateField help="os.dueOn" name="dueOn" required min={today} defaultValue={v.dueOn ?? ""} from={from?.due} quick={["tomorrow", "week"]} />
      <NumberField help="os.amountWon" name="amountWon" required min={0} unit="원" defaultValue={v.amountWon ?? null} from={from?.amount} />
      <RadioRow help="os.moveOut" name="moveOut" required defaultValue={v.moveOut === false ? "0" : "1"} options={[
        { value: "1", label: "업체로 옮김" },
        { value: "0", label: "출장 작업(이동 없음)" },
      ]} />
      {hasCandidate && (
        <RadioRow help="po.emergency" name="emergency" defaultValue="0" options={[
          { value: "0", label: "등록 업체만" },
          { value: "1", label: "후보 업체 긴급 사용(1회)", tone: "warn" },
        ]} />
      )}
    </>
  );
}
