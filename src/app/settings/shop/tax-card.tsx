// 세금·사업 형태(개인/법인, 지역·감면, 원천세, 사업용 계좌, 세무 대리인) — 대표만 고친다
import { BIZ_FORMS, REGIONS, RELIEF_KINDS } from "@/modules/money/tax-rules";
import type { taxOverview } from "@/modules/money/tax-profile";
import { BANKS } from "@/modules/purchase/rules";
import { AssistForm } from "../../_assist";
import { CheckGroup, DateField, RadioRow, SelectField, TextField } from "../../_input";
import { SubmitButton } from "../../_submit";
import { Card } from "../../_ui";
import { saveTaxAction } from "./actions";

type O = Awaited<ReturnType<typeof taxOverview>>;

export function TaxCard({ o, owner }: { o: O; owner: boolean }) {
  const { p } = o;
  const form = p.form || o.form || "";
  const rec = o.rec;
  return (
    <div id="tax" className="mt-4">
      <Card title="세금·사업 형태" help={{ kind: "panel", id: "shop.tax" }}>
        <div className="mb-3 space-y-1 text-sm">
          {o.formGuessed && <p>사업자등록번호로 보면 <b>{BIZ_FORMS[o.form!]}</b>입니다. 맞으면 그대로 저장하세요.</p>}
          {o.guessRegion.region && (
            <p className={o.guessRegion.sure ? "text-[var(--muted)]" : "rounded-md border border-[var(--warn)] bg-[var(--warn-soft)] px-2 py-1"}>
              주소로 본 지역: <b>{REGIONS[o.guessRegion.region]}</b> — {o.guessRegion.why}
            </p>
          )}
          {rec && (
            <p className="rounded-md bg-[var(--accent-soft)] px-2 py-1">
              추천 감면: <b>{RELIEF_KINDS[rec.kind]} {rec.rate}%</b> — {rec.why}. 최종 판단은 세무사와 합니다.
            </p>
          )}
        </div>
        {owner ? (
          <AssistForm id="shop-tax" action={saveTaxAction} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <RadioRow help="tax.form" name="form" defaultValue={form} options={Object.entries(BIZ_FORMS).map(([value, label]) => ({ value, label }))} from={o.formGuessed ? "사업자등록번호" : undefined} />
              <DateField help="tax.openedOn" name="openedOn" defaultValue={p.openedOn} quick={[]} />
              <DateField help="tax.formSince" name="formSince" defaultValue={p.formSince} quick={[]} />
              <TextField help="tax.corpRegNo" name="corpRegNo" inputMode="numeric" defaultValue={p.corpRegNo} />
              <SelectField help="tax.fiscalStart" name="fiscalStartMonth" defaultValue={String(p.fiscalStartMonth || 1)} options={Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1), label: `${i + 1}월` }))} />
              <SelectField
                help="tax.region"
                name="region"
                defaultValue={p.region || o.guessRegion.region || ""}
                placeholder="고르기"
                options={Object.entries(REGIONS).map(([value, label]) => ({ value, label }))}
                from={!p.region && o.guessRegion.region ? "주소" : undefined}
              />
              <RadioRow help="tax.ceoYouth" name="ceoYouth" defaultValue={p.ceoYouth == null ? "" : p.ceoYouth ? "1" : "0"} options={[{ value: "1", label: "예" }, { value: "0", label: "아니오" }]} />
              <SelectField help="tax.relief" name="relief" defaultValue={p.relief || rec?.kind || ""} placeholder="고르기" options={Object.entries(RELIEF_KINDS).map(([value, label]) => ({ value, label }))} from={!p.relief && rec ? "추천" : undefined} />
              <CheckGroup help="tax.halfYear" name="halfYearWithholding" options={[{ value: "1", label: "반기납부 승인받음" }]} defaultChecked={p.halfYearWithholding ? ["1"] : []} />
            </div>
            <p className="text-sm font-medium">사업용 계좌</p>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <TextField help="tax.bankName" name="bankName" defaultValue={p.bankName} suggestions={BANKS.map((b) => ({ value: b }))} />
              <TextField help="tax.bankAccount" name="accountNo" inputMode="numeric" autoComplete="off" placeholder={p.bankAccountMasked ? `${p.bankAccountMasked} (비우면 그대로)` : undefined} />
              <TextField help="tax.bankHolder" name="bankHolder" defaultValue={p.bankHolder} />
              {form !== "corporate" && <CheckGroup help="tax.bankReported" name="bankReported" options={[{ value: "1", label: "세무서에 신고함" }]} defaultChecked={p.bankReported ? ["1"] : []} />}
            </div>
            {o.bankFull && <p className="text-xs text-[var(--muted)]">지금 계좌: {p.bankName} {o.bankFull} {p.bankHolder}</p>}
            <div className="grid gap-4 md:grid-cols-2">
              <TextField help="tax.agentName" name="agentName" defaultValue={p.agentName} />
              <TextField help="tax.agentPhone" name="agentPhone" inputMode="tel" defaultValue={p.agentPhone} />
            </div>
            <SubmitButton>세금·사업 형태 저장</SubmitButton>
          </AssistForm>
        ) : (
          <dl className="grid gap-1 text-sm sm:grid-cols-2">
            {[
              ["사업 형태", form ? BIZ_FORMS[form] : "—"],
              ["개업일", p.openedOn],
              ["지역", o.region ? REGIONS[o.region] : ""],
              ["받는 감면", p.relief ? RELIEF_KINDS[p.relief] : ""],
              ["사업용 계좌", p.bankName ? `${p.bankName} ${o.bankFull ?? p.bankAccountMasked} ${p.bankHolder}` : ""],
              ["세무 대리인", [p.agentName, p.agentPhone].filter(Boolean).join(" ")],
            ].map(([k, v]) => (
              <div key={k} className="grid grid-cols-[8rem_1fr]">
                <dt className="text-[var(--muted)]">{k}</dt>
                <dd>{v || "—"}</dd>
              </div>
            ))}
          </dl>
        )}
      </Card>
    </div>
  );
}
