// 재고 품목 칸(새로 등록·고치기 같이 씀)
import { STOCK_KINDS, STOCK_UNITS } from "@/modules/purchase/rules";
import { NumberField, RadioRow, SelectField, TextField } from "../_input";

type I = { name: string; kind: string; spec: string | null; unit: string; location: string | null; safetyQty: number; unitWon: number; expiryTracked: boolean; supplierId: string | null };

export function ItemFields({ i, suppliers }: { i?: I; suppliers: { id: string; name: string }[] }) {
  return (
    <>
      <TextField help="st.name" name="name" required defaultValue={i?.name} />
      <RadioRow help="st.kind" name="kind" required defaultValue={i?.kind} options={Object.entries(STOCK_KINDS).map(([value, label]) => ({ value, label }))} />
      <TextField help="st.spec" name="spec" defaultValue={i?.spec ?? ""} />
      <SelectField help="st.unit" name="unit" required defaultValue={i?.unit ?? "개"} options={STOCK_UNITS.map((u) => ({ value: u, label: u }))} />
      <TextField help="st.location" name="location" defaultValue={i?.location ?? ""} />
      <NumberField help="st.safetyQty" name="safetyQty" required min={0} defaultValue={i?.safetyQty ?? 0} />
      <NumberField help="st.unitWon" name="unitWon" min={0} unit="원" defaultValue={i?.unitWon ?? null} />
      <RadioRow help="st.expiryTracked" name="expiryTracked" required defaultValue={i ? (i.expiryTracked ? "1" : "0") : undefined} options={[
        { value: "1", label: "관리함(도료·퍼티·경화제)" },
        { value: "0", label: "안 함" },
      ]} />
      <SelectField help="st.supplierId" name="supplierId" defaultValue={i?.supplierId ?? ""} placeholder="업체 고르기" options={suppliers.map((s) => ({ value: s.id, label: s.name }))} />
    </>
  );
}
