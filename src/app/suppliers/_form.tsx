// 협력업체 기본 정보 칸(새로 등록·고치기 같이 씀)
import { SUPPLIER_KINDS } from "@/modules/purchase/rules";
import { CheckGroup, NumberField, TextAreaField, TextField } from "../_input";
import { DocChecks } from "./doc-checks";

type S = { name: string; bizNo: string | null; kinds: string[]; items: string | null; contactName: string | null; phone: string | null; email: string | null; leadDays: number | null; returnTerms: string | null; docs: string[]; note: string | null };

/** noNote: 메모·서류 칸을 빼고 그린다(입금 계좌 칸 뒤에 SupplierNote·SupplierDocs 를 따로 둘 때) */
export function SupplierFields({ s, noNote }: { s?: S; noNote?: boolean }) {
  return (
    <>
      <TextField help="sup.name" name="name" required defaultValue={s?.name} />
      <TextField help="sup.bizNo" name="bizNo" inputMode="numeric" defaultValue={s?.bizNo ?? ""} />
      <div className="md:col-span-2">
        <CheckGroup help="sup.kinds" name="kinds" defaultChecked={s?.kinds ?? []} options={Object.entries(SUPPLIER_KINDS).map(([value, label]) => ({ value, label }))} />
      </div>
      <div className="md:col-span-2">
        <TextField help="sup.items" name="items" defaultValue={s?.items ?? ""} />
      </div>
      <TextField help="sup.contactName" name="contactName" defaultValue={s?.contactName ?? ""} />
      <TextField help="sup.phone" name="phone" type="tel" defaultValue={s?.phone ?? ""} />
      <TextField help="sup.email" name="email" type="email" defaultValue={s?.email ?? ""} />
      <NumberField help="sup.leadDays" name="leadDays" unit="일" min={0} max={90} defaultValue={s?.leadDays ?? null} />
      <div className="md:col-span-2">
        <TextField help="sup.returnTerms" name="returnTerms" defaultValue={s?.returnTerms ?? ""} />
      </div>
      {!noNote && <SupplierNote s={s} />}
      {!noNote && <SupplierDocs s={s} />}
    </>
  );
}

/** 확인한 서류(맨 아래): 체크 + 파일 붙이기 */
export function SupplierDocs({ s }: { s?: S & { docFiles?: { doc: string }[] } }) {
  const saved: Record<string, number> = {};
  for (const f of s?.docFiles ?? []) saved[f.doc] = (saved[f.doc] ?? 0) + 1;
  return <DocChecks checked={s?.docs ?? []} saved={saved} />;
}

export function SupplierNote({ s }: { s?: S }) {
  return (
    <div className="md:col-span-2">
      <TextAreaField help="sup.note" name="note" rows={2} defaultValue={s?.note ?? ""} />
    </div>
  );
}
