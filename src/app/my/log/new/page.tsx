// 새 기록 적기: 종류(주유·소모품·세차·보험·세금·기타)를 위에서 고르고, 칸은 지난 기록·공업사 확인 주행거리로 미리 채운다.
// 주유는 금액·넣은 양·단가 중 둘만, 소모품은 고르면 다음 교체 주기가 기본값으로 들어간다
import Link from "next/link";
import { redirect } from "next/navigation";
import { getDb } from "@/db/runtime";
import { entryDefaults } from "@/modules/carbook/records";
import { ENTRY_KIND_LABEL, FEES, FUELS, ITEMS, subLabel, type EntryKind } from "@/modules/carbook/rules";
import { UserError } from "@/modules/platform/errors";
import { AssistForm } from "../../../_assist";
import { DateField, NumberField, RadioRow, SelectField, TextField } from "../../../_input";
import { SubmitButton } from "../../../_submit";
import { ErrorBox, Notice, PageTitle } from "../../../_ui";
import { addEntryAction } from "../../actions";
import { requireMy } from "../../_session";
import { FuelCalc } from "./fuel-calc";

export default async function MyLogNewPage({ searchParams }: { searchParams: Promise<{ kind?: string; sub?: string; car?: string; copy?: string; error?: string; saved?: string }> }) {
  const q = await searchParams;
  const s = await requireMy(true);
  let d: Awaited<ReturnType<typeof entryDefaults>>;
  try {
    d = await entryDefaults(await getDb(), s, q);
  } catch (e) {
    if (e instanceof UserError) redirect(`/my/log${q.car ? `?car=${encodeURIComponent(q.car)}` : ""}`);
    throw e;
  }
  const k: EntryKind = d.kind;
  const unit = k === "fuel" ? (FUELS[d.sub as keyof typeof FUELS]?.unit ?? "L") : "L";
  const subOpts = k === "fuel" ? Object.entries(FUELS).map(([v, x]) => ({ value: v, label: x.label })) : k === "item" ? Object.entries(ITEMS).map(([v, x]) => ({ value: v, label: x.label })) : k === "fee" ? Object.entries(FEES).map(([v, l]) => ({ value: v, label: l })) : null;
  const subHelp = k === "fuel" ? "my.fuel" : k === "item" ? "my.item" : "my.fee";
  return (
    <div className="space-y-4 pt-2">
      <PageTitle help="my.logNew" sub={d.from ? `${d.from}에서 불러옴` : undefined}>
        {subLabel(k, d.sub)} 적기
      </PageTitle>
      <ErrorBox message={q.error} />
      {q.saved && <Notice>적었습니다. 이어서 하나 더 적을 수 있습니다.</Notice>}

      <nav aria-label="무엇을 적을까요" className="flex flex-wrap gap-1.5">
        {(Object.keys(ENTRY_KIND_LABEL) as EntryKind[]).map((x) => (
          <Link key={x} href={`/my/log/new?kind=${x}&car=${d.car}`} aria-current={x === k ? "page" : undefined} className={`rounded-full border px-3 py-1.5 text-sm ${x === k ? "border-[var(--accent)] bg-[var(--accent-soft)] font-semibold" : "border-[var(--line)]"}`}>
            {ENTRY_KIND_LABEL[x]}
          </Link>
        ))}
      </nav>

      <AssistForm id={`my-log-${k}`} action={addEntryAction} className="space-y-4">
        <input type="hidden" name="kind" value={k} />
        {d.cars.length > 1 ? <SelectField help="my.vehicle" name="vehicleId" required defaultValue={d.car} options={d.cars.map((c) => ({ value: c.id, label: c.label }))} /> : <input type="hidden" name="vehicleId" value={d.car} />}
        {subOpts && (
          // 소모품은 고른 품목의 기본 주기를 칸에 넣어야 해서, 품목을 바꾸면 그 품목 화면으로 다시 연다
          k === "item" ? (
            <div className="space-y-1">
              <RadioRow help={subHelp} name="sub" required defaultValue={d.sub ?? undefined} options={subOpts} />
              <p className="flex flex-wrap gap-x-3 text-xs text-[var(--muted)]">
                주기 기본값 다시 넣기:
                {subOpts.map((o) => (
                  <Link key={o.value} href={`/my/log/new?kind=item&sub=${o.value}&car=${d.car}`} className="text-[var(--accent)] underline">
                    {o.label}
                  </Link>
                ))}
              </p>
            </div>
          ) : (
            <RadioRow help={subHelp} name="sub" required defaultValue={d.sub ?? undefined} options={subOpts} />
          )
        )}
        <DateField help="my.on" name="on" required defaultValue={d.on} quick={["today"]} />
        <NumberField help="my.mileage" name="mileage" unit="km" defaultValue={d.mileage} from={d.mileageFrom ?? undefined} max={2000000} />
        <NumberField help="my.amount" name="amount" unit="원" required={k !== "fuel" && k !== "item"} defaultValue={d.amount} max={100000000} />
        {k === "fuel" && (
          <>
            <TextField help="my.qty" name="qty" defaultValue={d.qty == null ? "" : String(d.qty)} placeholder={unit} />
            <NumberField help="my.unitPrice" name="unitPrice" unit={`원/${unit}`} defaultValue={d.unitPrice} max={100000} />
            <FuelCalc unit={unit} />
          </>
        )}
        {k === "item" && (
          <div className="grid gap-4 sm:grid-cols-2">
            <NumberField help="my.intervalKm" name="intervalKm" unit="km" defaultValue={d.intervalKm} max={500000} />
            <NumberField help="my.intervalMonths" name="intervalMonths" unit="개월" defaultValue={d.intervalMonths} max={240} />
          </div>
        )}
        {k === "fee" && d.sub === "insurance" && <DateField help="my.insuranceUntil" name="insuranceUntil" defaultValue={d.insuranceUntil ?? undefined} quick={[]} />}
        {k !== "fee" && <TextField help="my.place" name="place" defaultValue={d.place} />}
        <TextField help="my.memo" name="memo" defaultValue={d.memo} />
        <div className="grid grid-cols-2 gap-2">
          <SubmitButton full>저장</SubmitButton>
          <SubmitButton full variant="secondary" name="again" value="1">
            저장하고 하나 더
          </SubmitButton>
        </div>
      </AssistForm>
      <p className="text-center text-sm">
        <Link href={`/my/log?car=${d.car}`} className="text-[var(--accent)] underline">
          내 기록으로 돌아가기
        </Link>
      </p>
    </div>
  );
}
