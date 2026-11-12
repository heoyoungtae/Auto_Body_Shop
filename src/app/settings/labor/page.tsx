import { can } from "@/modules/auth/permissions";
import Link from "next/link";
import { getDb } from "@/db/runtime";
import { fmtMinutes, LABOR_CATS, LABOR_LOCKED, type LaborDef } from "@/modules/repair/labor";
import { LINE_CATEGORIES } from "@/modules/repair/estimate-rules";
import { laborCatalog, laborChanges, loadLabor } from "@/modules/repair/labor-store";
import { seoulDate } from "@/modules/platform/time";
import { AssistForm } from "../../_assist";
import { DateField, NumberField, SelectField, TextField } from "../../_input";
import { SubmitButton } from "../../_submit";
import { requireUser } from "../../_lib/session";
import { Badge, Card, ErrorBox, fmtTime, Notice, PageTitle } from "../../_ui";
import { addLaborAction, changeLaborAction, hideLaborAction } from "./actions";

const show = (d: LaborDef, v: number) => (d.kind === "hours" ? fmtMinutes(v) : d.kind === "pct" ? `${v}%` : `${v.toLocaleString("ko-KR")}원`);
const unit = (d: LaborDef) => (d.kind === "hours" ? "분" : d.kind === "pct" ? "%" : "원");

export default async function LaborPage({ searchParams }: { searchParams: Promise<{ code?: string; error?: string; notice?: string }> }) {
  const { code, error, notice } = await searchParams;
  const user = await requireUser();
  const owner = can(user, "settings.edit");
  const db = await getDb();
  const [table, changes, catalog] = await Promise.all([loadLabor(db), laborChanges(db), laborCatalog(db)]);
  const changed = new Set(changes.map((c) => c.key.slice(6)));
  const sel = code ? catalog.find((d) => d.code === code) : undefined;
  const sections = [...new Set(catalog.map((d) => d.section))];
  const defOf = (k: string) => catalog.find((d) => d.code === k);
  return (
    <>
      <PageTitle help="settings.labor" std="F-03-01 · STD-03 4·7절" sub="견적의 공임·도장 금액이 이 표로 계산됩니다. 처음 값은 개업 전 제안값입니다.">
        공임 기준표
      </PageTitle>
      <ErrorBox message={error} />
      {notice && <Notice>{notice}</Notice>}
      <p className="my-3 rounded-md border border-[var(--warn)] bg-[var(--warn-soft)] px-3 py-2 text-sm">
        [확인 필요] 처음 숫자는 업계 공개 자료를 참고한 제안값입니다. 개업 전에 공장장이 실제 작업 시간을 재어 정하고 대표가 승인해 바꾸세요. 보험 수리는 보험사 계약 단가가 우선입니다.
      </p>
      <div className="grid gap-4 xl:grid-cols-3 xl:items-start">
        <div className="grid gap-4 md:grid-cols-2 xl:col-span-2">
          {sections.map((sec) => (
            <Card key={sec} title={sec} help={{ kind: "panel", id: "labor.section" }}>
              <table className="w-full text-sm">
                <tbody className="divide-y divide-[var(--line)]">
                  {catalog
                    .filter((d) => d.section === sec)
                    .map((d) => (
                      <tr key={d.code} className={`${sel?.code === d.code ? "bg-[var(--accent-soft)]" : ""} ${d.hidden ? "opacity-50" : ""}`}>
                        <td className="py-1.5 pr-2">
                          {d.name}
                          {d.custom && <Badge tone="ok">추가</Badge>}
                          {d.hidden && <Badge>숨김</Badge>}
                          {d.hint && <span className="block text-xs text-[var(--muted)]">{d.hint}</span>}
                        </td>
                        <td className="py-1.5 pr-2 text-right whitespace-nowrap tabular-nums">
                          <b>{show(d, table[d.code])}</b>
                          {changed.has(d.code) ? <Badge tone="accent">바꿈</Badge> : !d.custom && <span className="ml-1 text-xs text-[var(--muted)]">제안값</span>}
                        </td>
                        <td className="py-1.5 text-right whitespace-nowrap">
                          {owner && (
                            <>
                              <Link href={`/settings/labor?code=${d.code}`} className="text-xs text-[var(--accent)]">
                                바꾸기
                              </Link>
                              {!LABOR_LOCKED.has(d.code) && (
                                <form action={hideLaborAction} className="ml-2 inline">
                                  <input type="hidden" name="code" value={d.code} />
                                  <input type="hidden" name="hidden" value={d.hidden ? "0" : "1"} />
                                  <button type="submit" className="text-xs text-[var(--muted)] hover:text-[var(--accent)] hover:underline">
                                    {d.hidden ? "다시 쓰기" : "숨기기"}
                                  </button>
                                </form>
                              )}
                            </>
                          )}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </Card>
          ))}
        </div>
        <div className="space-y-4 xl:sticky xl:top-4">
          {owner && (
            <Card title={sel ? `바꾸기: ${sel.section} › ${sel.name}` : "바꾸기"} help={{ kind: "panel", id: "labor.change" }}>
              {sel ? (
                <AssistForm id={`labor-${sel.code}`} action={changeLaborAction} className="space-y-3">
                  <input type="hidden" name="code" value={sel.code} />
                  <NumberField help="labor.value" name="value" required unit={unit(sel)} min={sel.kind === "pct" ? 50 : 0} max={sel.kind === "pct" ? 300 : undefined} current={table[sel.code]} suggested={sel.value} />
                  <DateField help="policy.effectiveFrom" name="effectiveFrom" defaultValue={seoulDate()} min={seoulDate()} required />
                  <TextField help="labor.reason" name="reason" required />
                  <TextField help="policy.revisionRequestNo" name="revisionRequestNo" />
                  <SubmitButton>바꾸기</SubmitButton>
                </AssistForm>
              ) : (
                <p className="text-sm text-[var(--muted)]">왼쪽 표에서 바꿀 항목의 &lsquo;바꾸기&rsquo;를 누르세요.</p>
              )}
            </Card>
          )}
          {owner && (
            <Card title="항목 추가" help={{ kind: "panel", id: "labor.add" }}>
              <AssistForm id="labor-add" action={addLaborAction} className="space-y-3">
                <TextField help="labor.newSection" name="section" required suggestions={sections.map((x) => ({ value: x }))} />
                <TextField help="labor.newName" name="name" required />
                <div className="grid gap-3 sm:grid-cols-2">
                  <SelectField help="labor.newKind" name="kind" required defaultValue="hours" options={[{ value: "hours", label: "표준 시간(분)" }, { value: "price", label: "고정 금액(원)" }]} />
                  <SelectField help="labor.newCat" name="cat" required placeholder="고르기" options={LABOR_CATS.map((c) => ({ value: c, label: LINE_CATEGORIES[c] }))} />
                </div>
                <NumberField help="labor.newValue" name="value" required min={1} />
                <TextField help="labor.newHint" name="hint" />
                <SubmitButton>항목 추가</SubmitButton>
              </AssistForm>
            </Card>
          )}
          <Card title="바꾼 이력" help={{ kind: "panel", id: "labor.history" }}>
            {changes.length ? (
              <ul className="space-y-1.5 text-sm">
                {changes.slice(0, 20).map((c) => {
                  const d = defOf(c.key.slice(6));
                  return (
                    <li key={c.key + String(c.at)}>
                      {d ? `${d.section} › ${d.name}` : c.key} → <b>{d ? show(d, c.value as number) : String(c.value)}</b> ({c.effectiveFrom}부터) · {c.reason} <span className="text-xs text-[var(--muted)]">{c.by} {fmtTime(c.at)}</span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-sm text-[var(--muted)]">아직 바꾼 적이 없습니다. 모두 제안값입니다.</p>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
