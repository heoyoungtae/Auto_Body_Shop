// 비품 칸(등록·고치기 같이 씀)
import { FX_CATEGORIES } from "@/modules/purchase/rules";
import { DateField, NumberField, RadioRow, SelectField, TextAreaField, TextField } from "../_input";

type F = { name: string; category: string; spec: string | null; purchasedOn: string | null; priceWon: number; location: string | null; holderId: string | null; warrantyUntil: string | null; supplierId: string | null; expenseRef: string | null; note: string | null };

/** pre: 지출 결의에서 불러온 값(새로 등록할 때만). managers: 새로 등록할 때 관리자 정/부 칸(상세 화면은 따로 카드) */
export function FixtureFields({ f, users, suppliers, assetMin, pre, managers }: { f?: F; users: { id: string; name: string }[]; suppliers: { id: string; name: string }[]; assetMin: number; pre?: Partial<F> & { from: string }; managers?: { managerId?: string } }) {
  const d = f ?? pre;
  const from = pre?.from;
  return (
    <>
      <TextField help="fx.name" name="name" required defaultValue={d?.name} from={pre?.name ? from : undefined} />
      <div className="md:col-span-2">
        <RadioRow help="fx.category" name="category" required defaultValue={f?.category} options={Object.entries(FX_CATEGORIES).map(([value, label]) => ({ value, label }))} />
      </div>
      <TextField help="fx.spec" name="spec" defaultValue={f?.spec ?? ""} />
      <DateField help="fx.purchasedOn" name="purchasedOn" defaultValue={d?.purchasedOn ?? ""} from={pre?.purchasedOn ? from : undefined} quick={["today"]} />
      <NumberField help="fx.priceWon" name="priceWon" required min={0} unit="원" defaultValue={d?.priceWon ?? null} from={pre?.priceWon ? from : undefined} />
      <p className="self-end pb-2 text-xs text-[var(--muted)]">{assetMin.toLocaleString("ko-KR")}원 이상이면 자산 비품으로 구분됩니다(정책값).</p>
      <TextField help="fx.location" name="location" defaultValue={f?.location ?? ""} />
      <SelectField help="fx.holderId" name="holderId" defaultValue={f?.holderId ?? ""} placeholder="공용(사용자 없음)" options={users.map((u) => ({ value: u.id, label: u.name }))} />
      <DateField help="fx.warrantyUntil" name="warrantyUntil" defaultValue={f?.warrantyUntil ?? ""} quick={[]} />
      <SelectField help="fx.supplierId" name="supplierId" defaultValue={d?.supplierId ?? ""} from={pre?.supplierId ? from : undefined} placeholder="구입처 고르기" options={suppliers.map((s) => ({ value: s.id, label: s.name }))} />
      <TextField help="fx.expenseRef" name="expenseRef" defaultValue={d?.expenseRef ?? ""} from={pre?.expenseRef ? from : undefined} />
      {managers && (
        <>
          <SelectField help="fx.managerId" name="managerId" defaultValue={managers.managerId ?? ""} placeholder="나중에" options={users.map((u) => ({ value: u.id, label: u.name }))} />
          <SelectField help="fx.subManagerId" name="subManagerId" placeholder="없음" options={users.map((u) => ({ value: u.id, label: u.name }))} />
        </>
      )}
      <div className="md:col-span-2">
        <TextAreaField help="fx.note" name="note" rows={2} defaultValue={f?.note ?? ""} />
      </div>
    </>
  );
}
