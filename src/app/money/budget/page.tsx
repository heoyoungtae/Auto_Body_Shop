import Link from "next/link";
import { getDb } from "@/db/runtime";
import { BUDGET_ROWS, canBudget, derived, getBudget, lastYearActual, monthsOf, zeroVals } from "@/modules/acct/budget";
import { seoulDate } from "@/modules/platform/time";
import { AssistForm } from "../../_assist";
import { NumberField, RadioRow } from "../../_input";
import { requireUser } from "../../_lib/session";
import { SubmitButton } from "../../_submit";
import { buttonClass, Card, ErrorBox, Notice, PageTitle } from "../../_ui";
import { annualAction, monthAction } from "./actions";

const won = (n: number) => n.toLocaleString("ko-KR");

/** 연간 예산(보고서 센터 5단계): 연초에 한 해 금액을 적으면 12달로 나눈다. 달별로 고칠 수 있다. 지난해 실적을 기본값으로 */
export default async function BudgetPage({ searchParams }: { searchParams: Promise<{ y?: string; m?: string; notice?: string; error?: string }> }) {
  const q = await searchParams;
  const user = await requireUser();
  if (!canBudget(user))
    return (
      <>
        <PageTitle help="budget">연간 예산</PageTitle>
        <p className="text-sm text-[var(--muted)]">예산은 대표(또는 회계 담당)가 적습니다.</p>
      </>
    );
  const today = seoulDate();
  const thisYear = Number(today.slice(0, 4));
  // 11월부터는 내년 예산을 먼저 보여 준다(연초 입력 준비)
  const year = /^\d{4}$/.test(q.y ?? "") ? Number(q.y) : today.slice(5, 7) >= "11" ? thisYear + 1 : thisYear;
  const db = await getDb();
  const bud = await getBudget(db, year);
  const last = await lastYearActual(db, year);
  const months = monthsOf(year);
  const pick = q.m && months.includes(q.m) ? q.m : null;
  const base = bud.has ? bud.total : last.has ? last.total : zeroVals();
  const from = bud.has ? undefined : last.has ? `${year - 1}년 실적` : undefined;
  const dT = derived(bud.total);
  return (
    <>
      <PageTitle
        help="budget"
        std="STD-12"
        sub="한 해 매출·비용 예산을 적으면 12달로 나눕니다. 보고서 센터 '손익분기·예산 대비'와 월간 경영보고서가 이 예산과 실적을 견줍니다."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href={`/money/budget?y=${year - 1}`} className={buttonClass("secondary")}>
              {year - 1}년
            </Link>
            <Link href={`/money/budget?y=${year + 1}`} className={buttonClass("secondary")}>
              {year + 1}년
            </Link>
            <Link href={`/reports/budget?k=year&at=${year}-01-01`} className={buttonClass("secondary")}>
              예산 대비 보고서
            </Link>
          </div>
        }
      >
        {year}년 예산
      </PageTitle>
      {q.notice && <Notice>{q.notice}</Notice>}
      <ErrorBox message={q.error} />

      <Card title="한 해 예산 적기" help={{ kind: "panel", id: "budget.annual" }}>
        <p className="mb-3 text-sm text-[var(--muted)]">
          {bud.has ? "지금 저장된 한 해 합계가 채워져 있습니다." : last.has ? `${year - 1}년 실적이 채워져 있습니다. 올해 목표로 고쳐 적으세요.` : "지난해 실적이 없어 비어 있습니다(개업 첫해)."} 금액은 부가세를 뺀 원입니다.
        </p>
        <AssistForm id={`budget-${year}`} action={annualAction} className="grid gap-3 md:grid-cols-2">
          <input type="hidden" name="year" value={year} />
          {BUDGET_ROWS.map((r) => (
            <NumberField key={r.key} help={r.key === "nonop" ? "budget.nonop" : "budget.annual"} name={`a_${r.key}`} label={`${r.label}(한 해)`} unit="원" min={r.key === "nonop" ? undefined : 0} defaultValue={base[r.key] || null} from={from} />
          ))}
          <div className="md:col-span-2">
            <RadioRow
              help="budget.method"
              name="method"
              required
              defaultValue={last.has ? "last" : "even"}
              options={[
                { value: "even", label: "12달 고르게" },
                ...(last.has ? [{ value: "last", label: `${year - 1}년 달별 비율대로` }] : []),
              ]}
            />
          </div>
          <div className="md:col-span-2">
            <SubmitButton>12달로 나눠 저장</SubmitButton>
          </div>
        </AssistForm>
      </Card>

      <Card title="달별 예산" help={{ kind: "panel", id: "budget.table" }}>
        {bud.has ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[56rem] text-sm">
              <thead className="text-left text-xs text-[var(--muted)]">
                <tr>
                  <th className="py-1.5 pr-2 font-medium">달</th>
                  {BUDGET_ROWS.map((r) => (
                    <th key={r.key} className="py-1.5 pr-2 text-right font-medium">
                      {r.label.replace(/\(.*\)/, "")}
                    </th>
                  ))}
                  <th className="py-1.5 pr-2 text-right font-medium">영업이익</th>
                  <th className="py-1.5 font-medium" />
                </tr>
              </thead>
              <tbody>
                {months.map((ym) => {
                  const v = bud.byYm.get(ym) ?? zeroVals();
                  const d = derived(v);
                  return (
                    <tr key={ym} className={`border-t border-[var(--line)] ${ym === pick ? "bg-[var(--accent-soft)]" : ""}`}>
                      <td className="py-1.5 pr-2">{ym}</td>
                      {BUDGET_ROWS.map((r) => (
                        <td key={r.key} className="py-1.5 pr-2 text-right tabular-nums">
                          {won(v[r.key])}
                        </td>
                      ))}
                      <td className={`py-1.5 pr-2 text-right font-semibold tabular-nums ${d.op < 0 ? "text-[var(--danger)]" : ""}`}>{won(d.op)}</td>
                      <td className="py-1.5">
                        <Link href={`/money/budget?y=${year}&m=${ym}#month`} className="text-[var(--accent)]">
                          고치기
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-[var(--line)] font-semibold">
                  <td className="py-1.5 pr-2">합계</td>
                  {BUDGET_ROWS.map((r) => (
                    <td key={r.key} className="py-1.5 pr-2 text-right tabular-nums">
                      {won(bud.total[r.key])}
                    </td>
                  ))}
                  <td className="py-1.5 pr-2 text-right tabular-nums">{won(dT.op)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        ) : (
          <p className="text-sm text-[var(--muted)]">아직 {year}년 예산이 없습니다. 위에서 한 해 금액을 적고 저장하면 12달로 나뉘어 여기 보입니다.</p>
        )}
      </Card>

      {pick && (
        <div id="month">
          <Card title={`${pick} 예산 고치기`} help={{ kind: "panel", id: "budget.month" }}>
            <AssistForm id={`budget-m-${pick}`} action={monthAction} className="grid gap-3 md:grid-cols-2">
              <input type="hidden" name="ym" value={pick} />
              {BUDGET_ROWS.map((r) => (
                <NumberField key={r.key} help={r.key === "nonop" ? "budget.nonop" : "budget.monthVal"} name={`m_${r.key}`} label={r.label} unit="원" min={r.key === "nonop" ? undefined : 0} defaultValue={bud.byYm.get(pick)?.[r.key] ?? null} from="달별 예산" />
              ))}
              <div className="md:col-span-2 flex flex-wrap gap-2">
                <SubmitButton>{pick} 저장</SubmitButton>
                <Link href={`/money/budget?y=${year}`} className={buttonClass("secondary")}>
                  닫기
                </Link>
              </div>
            </AssistForm>
          </Card>
        </div>
      )}
    </>
  );
}
