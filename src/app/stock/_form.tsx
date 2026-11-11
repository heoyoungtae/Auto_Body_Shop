// 재고 품목 칸(새로 등록·고치기 같이 씀)
import Link from "next/link";
import { EXP_CATEGORIES } from "@/modules/money/rules";
import { itemExpCategory, PACK_UNITS, shownUnitWon, STOCK_KINDS, STOCK_UNITS, VAT_MODES, isVatMode, type VatMode } from "@/modules/purchase/rules";
import { NumberField, RadioRow, SelectField, TextField } from "../_input";
import { KindLinksCategory, VatPreview } from "./item-assist";
import { SupplierPicker, type SupOpt } from "./supplier-picker";

type I = {
  name: string;
  kind: string;
  spec: string | null;
  unit: string;
  location: string | null;
  safetyQty: number;
  unitWon: number;
  vatMode: string;
  packAmount: number | null;
  packUnit: string | null;
  expCategory: string | null;
  chemicalId: string | null;
  expiryTracked: boolean;
  supplierId: string | null;
};

export function ItemFields({
  i,
  suppliers,
  chemicals,
  canAddSupplier,
  canAddChemical,
  vatModeDefault = "excluded",
}: {
  i?: I;
  suppliers: SupOpt[];
  chemicals: { id: string; name: string; maker: string | null; hasMsds: string | null }[];
  canAddSupplier: boolean;
  canAddChemical: boolean;
  /** 새 등록: 직전에 등록한 품목의 방식 */
  vatModeDefault?: VatMode;
}) {
  const mode: VatMode = i && isVatMode(i.vatMode) ? i.vatMode : vatModeDefault;
  return (
    <>
      <TextField help="st.name" name="name" required defaultValue={i?.name} />
      <RadioRow help="st.kind" name="kind" required defaultValue={i?.kind} options={Object.entries(STOCK_KINDS).map(([value, label]) => ({ value, label }))} />
      <TextField help="st.spec" name="spec" defaultValue={i?.spec ?? ""} />
      <SelectField help="st.unit" name="unit" required defaultValue={i?.unit ?? "개"} options={STOCK_UNITS.map((u) => ({ value: u, label: u }))} />
      <NumberField help="st.packAmount" name="packAmount" min={1} defaultValue={i?.packAmount ?? null} />
      <SelectField help="st.packUnit" name="packUnit" defaultValue={i?.packUnit ?? ""} placeholder="단위" options={PACK_UNITS.map((u) => ({ value: u, label: u }))} />
      <TextField help="st.location" name="location" defaultValue={i?.location ?? ""} />
      <NumberField help="st.safetyQty" name="safetyQty" required min={0} defaultValue={i?.safetyQty ?? 0} />
      <NumberField help="st.unitWon" name="unitWon" min={0} unit="원" defaultValue={i ? shownUnitWon(i.unitWon, mode) : null} />
      <RadioRow help="st.vatMode" name="vatMode" required defaultValue={mode} options={Object.entries(VAT_MODES).map(([value, label]) => ({ value, label }))} />
      <VatPreview />
      <SelectField
        help="st.expCategory"
        name="expCategory"
        required
        defaultValue={i ? itemExpCategory(i) : ""}
        placeholder="구분을 고르면 저절로 들어감"
        options={Object.entries(EXP_CATEGORIES)
          .filter(([k]) => ["paint", "consumable", "parts", "equipment", "repair", "welfare", "other"].includes(k))
          .map(([value, label]) => ({ value, label }))}
      />
      <KindLinksCategory />
      <RadioRow help="st.expiryTracked" name="expiryTracked" required defaultValue={i ? (i.expiryTracked ? "1" : "0") : undefined} options={[
        { value: "1", label: "관리함(도료·퍼티·경화제)" },
        { value: "0", label: "안 함" },
      ]} />
      <div>
        <SelectField
          help="st.chemicalId"
          name="chemicalId"
          defaultValue={i?.chemicalId ?? ""}
          placeholder="연결 안 함(화학물질 아님)"
          options={chemicals.map((c) => ({ value: c.id, label: `${c.name}${c.maker ? ` · ${c.maker}` : ""}${c.hasMsds ? "" : " (MSDS 없음)"}` }))}
        />
        <p className="mt-1 text-xs text-[var(--muted)]">
          목록에 없으면{" "}
          {canAddChemical ? (
            <Link href="/chemicals/new" target="_blank" className="text-[var(--accent)]">
              화학물질 등록(새 창)
            </Link>
          ) : (
            "안전환경 담당·대표에게 화학물질 등록을 요청"
          )}{" "}
          한 뒤 고릅니다.
        </p>
      </div>
      <div className="md:col-span-2">
        <SupplierPicker suppliers={suppliers} defaultValue={i?.supplierId} canCreate={canAddSupplier} />
      </div>
    </>
  );
}
