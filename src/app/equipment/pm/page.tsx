import Link from "next/link";
import { getDb } from "@/db/runtime";
import { can } from "@/modules/auth/permissions";
import { monthsForCycle } from "@/modules/equipment/rules";
import { getPlan, listEquipment, monthKpi } from "@/modules/equipment/service";
import { seoulDate } from "@/modules/platform/time";
import { AssistForm } from "../../_assist";
import { CheckGroup, DateField, NumberField, RadioRow, SelectField, TextField } from "../../_input";
import { requireUser } from "../../_lib/session";
import { SubmitButton } from "../../_submit";
import { Badge, Card, Empty, ErrorBox, Notice, PageTitle } from "../../_ui";
import { pmAction } from "../actions";

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

/** 예방정비 계획·실적(F-08-07): 공장장 계획 → 대표 승인 → 월별 일정·알림 → 실적·월간 집계 */
export default async function PmPage({ searchParams }: { searchParams: Promise<{ year?: string; error?: string; notice?: string }> }) {
  const q = await searchParams;
  const user = await requireUser();
  const db = await getDb();
  const today = seoulDate();
  const year = Number(q.year) || +today.slice(0, 4);
  const [data, eqs] = await Promise.all([getPlan(db, year), listEquipment(db)]);
  const ym = today.slice(0, 7);
  const kpi = await monthKpi(db, ym, today);
  const manage = can(user, "equip.manage");
  const approver = can(user, "pm.approve");
  const doWork = can(user, "equip.check");
  const draft = data?.plan.status === "draft";
  const itemOf = new Map(data?.items.map((i) => [i.id, i]) ?? []);
  const nowTasks = (data?.tasks ?? []).filter((t) => !t.doneOn && t.dueOn <= `${ym}-31`);
  const yearLink = (y: number) => `/equipment/pm?year=${y}`;
  return (
    <>
      <PageTitle
        help="equip.pm"
        sub="공장장이 매년 12월 다음 해 계획을 세우고 대표가 승인합니다. 승인하면 월별 정비 일정이 생기고 7일 전에 알림이 갑니다(STD-08 9절)."
        actions={
          <div className="flex gap-2 text-sm">
            <Link href={yearLink(year - 1)} className="text-[var(--accent)]">
              ← {year - 1}
            </Link>
            <b>{year}년</b>
            <Link href={yearLink(year + 1)} className="text-[var(--accent)]">
              {year + 1} →
            </Link>
          </div>
        }
      >
        예방정비
      </PageTitle>
      <ErrorBox message={q.error} />
      {q.notice && <Notice>{q.notice}</Notice>}
      <div className="grid gap-4 xl:grid-cols-[3fr_1fr]">
        <div className="space-y-4">
          <Card
            title={`${year}년 계획`}
            help={{ kind: "panel", id: "pm.plan" }}
            actions={data && <Badge tone={draft ? "warn" : "ok"}>{draft ? "작성 중(승인 전)" : `승인 ${data.plan.approvedAt ? seoulDate(data.plan.approvedAt) : ""}`}</Badge>}
          >
            {!data ? (
              <Empty
                action={
                  manage && (
                    <form action={pmAction}>
                      <input type="hidden" name="intent" value="create" />
                      <input type="hidden" name="year" value={year} />
                      <SubmitButton variant="secondary">{year}년 계획 만들기(지난해 항목 불러오기)</SubmitButton>
                    </form>
                  )
                }
              >
                {year}년 예방정비 계획이 없습니다.
              </Empty>
            ) : (
              <>
                {data.items.length ? (
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-xs">
                      <thead>
                        <tr className="bg-[var(--surface-2)] text-left">
                          <th className="border border-[var(--line)] px-2 py-1">설비</th>
                          <th className="border border-[var(--line)] px-2">정비 항목</th>
                          <th className="border border-[var(--line)] px-2">주기</th>
                          <th className="border border-[var(--line)] px-2">자체·외부</th>
                          <th className="border border-[var(--line)] px-2">예상 비용</th>
                          {MONTHS.map((m) => (
                            <th key={m} className="w-7 border border-[var(--line)] text-center">
                              {m}
                            </th>
                          ))}
                          {draft && manage && <th className="border border-[var(--line)]" />}
                        </tr>
                      </thead>
                      <tbody>
                        {data.items.map((i) => (
                          <tr key={i.id}>
                            <td className="border border-[var(--line)] px-2 py-1">
                              <Link href={`/equipment/${i.equipmentId}`} className="text-[var(--accent)]">
                                {i.eqNo}
                              </Link>{" "}
                              {i.eqName}
                            </td>
                            <td className="border border-[var(--line)] px-2">{i.task}</td>
                            <td className="border border-[var(--line)] px-2">{i.cycleMonths}개월</td>
                            <td className="border border-[var(--line)] px-2">{i.external ? "외부" : "자체"}</td>
                            <td className="border border-[var(--line)] px-2 text-right">{i.cost ? i.cost.toLocaleString("ko-KR") : "-"}</td>
                            {MONTHS.map((m) => {
                              const t = data.tasks.find((x) => x.itemId === i.id && +x.dueOn.slice(5, 7) === m);
                              const planned = i.months.includes(m);
                              const mark = t?.doneOn ? "✓" : planned ? "●" : "";
                              const late = t && !t.doneOn && t.dueOn < today;
                              return (
                                <td key={m} title={t ? `${t.dueOn}${t.doneOn ? ` 실시 ${t.doneOn}` : ""}` : ""} className={`border border-[var(--line)] text-center ${t?.doneOn ? "text-[var(--ok)]" : late ? "bg-[var(--danger-soft)] text-[var(--danger)]" : ""}`}>
                                  {mark}
                                </td>
                              );
                            })}
                            {draft && manage && (
                              <td className="border border-[var(--line)] px-1">
                                <form action={pmAction}>
                                  <input type="hidden" name="intent" value="removeItem" />
                                  <input type="hidden" name="year" value={year} />
                                  <input type="hidden" name="itemId" value={i.id} />
                                  <button className="text-[var(--muted)] underline">빼기</button>
                                </form>
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <p className="mt-1 text-xs text-[var(--muted)]">
                      ● 계획 · ✓ 실시 · 빨간 칸 기한 지남 · 예상 비용 합계 {data.items.reduce((a, i) => a + (i.cost ?? 0) * i.months.length, 0).toLocaleString("ko-KR")}원
                    </p>
                  </div>
                ) : (
                  <p className="text-sm text-[var(--muted)]">정비 항목이 없습니다. 아래에서 더하세요. 도장 부스 필터, 컴프레서 오일·필터·에어드라이어는 꼭 넣습니다.</p>
                )}
                <div className="mt-3 flex flex-wrap gap-2">
                  {draft && approver && data.items.length > 0 && (
                    <form action={pmAction}>
                      <input type="hidden" name="intent" value="approve" />
                      <input type="hidden" name="year" value={year} />
                      <input type="hidden" name="planId" value={data.plan.id} />
                      <SubmitButton>승인(일정 만들기)</SubmitButton>
                    </form>
                  )}
                  {draft && !approver && data.items.length > 0 && <p className="text-sm text-[var(--muted)]">다 세웠으면 대표에게 승인을 요청하세요.</p>}
                  {!draft && approver && (
                    <form action={pmAction}>
                      <input type="hidden" name="intent" value="reopen" />
                      <input type="hidden" name="year" value={year} />
                      <input type="hidden" name="planId" value={data.plan.id} />
                      <SubmitButton variant="secondary">계획 고치기(다시 열기)</SubmitButton>
                    </form>
                  )}
                </div>
              </>
            )}
          </Card>

          {data && draft && manage && (
            <Card title="정비 항목 더하기" help={{ kind: "panel", id: "pm.item" }}>
              <AssistForm id={`pmitem-${year}`} action={pmAction} className="grid gap-3 md:grid-cols-2">
                <input type="hidden" name="intent" value="item" />
                <input type="hidden" name="year" value={year} />
                <input type="hidden" name="planId" value={data.plan.id} />
                <SelectField help="pm.equipment" name="equipmentId" required placeholder="고르세요" options={eqs.map((e) => ({ value: e.id, label: `${e.no} ${e.name}` }))} />
                <TextField help="pm.task" name="task" required />
                <SelectField help="pm.cycle" name="cycleMonths" required defaultValue="3" options={[1, 2, 3, 6, 12].map((m) => ({ value: String(m), label: `${m}개월` }))} />
                <NumberField help="pm.day" name="day" unit="일" min={1} max={31} defaultValue={10} />
                <div className="md:col-span-2">
                  <CheckGroup help="pm.months" name="months" defaultChecked={monthsForCycle(3).map(String)} options={MONTHS.map((m) => ({ value: String(m), label: `${m}월` }))} />
                </div>
                <RadioRow help="pm.external" name="external" required defaultValue="0" options={[
                  { value: "0", label: "자체" },
                  { value: "1", label: "외부(제조사·업체)" },
                ]} />
                <NumberField help="pm.cost" name="cost" unit="원" min={0} />
                <div className="md:col-span-2">
                  <SubmitButton variant="secondary">항목 더하기</SubmitButton>
                </div>
              </AssistForm>
            </Card>
          )}

          <Card title="이번 달까지 할 정비(실적란)" help={{ kind: "panel", id: "pm.tasks" }}>
            {nowTasks.length ? (
              <div className="grid gap-3 md:grid-cols-2">
                {nowTasks.map((t) => {
                  const i = itemOf.get(t.itemId)!;
                  return (
                    <div key={t.id} className="rounded-md border border-[var(--line)] p-3">
                      <div className="mb-2 text-sm">
                        <b>
                          {i.eqNo} {i.eqName}
                        </b>{" "}
                        — {i.task} {i.external && <Badge>외부</Badge>} <Badge tone={t.dueOn < today ? "danger" : "warn"}>{t.dueOn}</Badge>
                      </div>
                      {doWork && (
                        <AssistForm id={`pmtask-${t.id}`} action={pmAction} className="grid gap-2 sm:grid-cols-2">
                          <input type="hidden" name="intent" value="done" />
                          <input type="hidden" name="year" value={year} />
                          <input type="hidden" name="taskId" value={t.id} />
                          <DateField help="pmt.doneOn" name="doneOn" required defaultValue={today} quick={["today"]} />
                          <TextField help="pmt.work" name="work" required defaultValue={i.task} from="정비 항목" />
                          <TextField help="pmt.parts" name="parts" />
                          <NumberField help="pmt.minutes" name="minutes" unit="분" min={0} />
                          <NumberField help="pmt.cost" name="cost" unit="원" min={0} defaultValue={i.cost} from={i.cost ? "예상 비용" : undefined} />
                          <TextField help="pmt.vendor" name="vendor" required={i.external} />
                          <div className="sm:col-span-2">
                            <SubmitButton variant="secondary">실적 저장</SubmitButton>
                          </div>
                        </AssistForm>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-[var(--muted)]">{data && !draft ? "이번 달까지 남은 정비가 없습니다." : "승인한 계획이 있어야 일정이 생깁니다."}</p>
            )}
          </Card>
        </div>

        <Card title={`${ym} 집계`} help={{ kind: "panel", id: "pm.kpi" }}>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt>계획 대비 실시율</dt>
              <dd className="font-semibold">{kpi.rate == null ? "-" : `${kpi.rate}%`}</dd>
            </div>
            <div className="flex justify-between">
              <dt>고장 건수</dt>
              <dd className="font-semibold">{kpi.failures}건</dd>
            </div>
            <div className="flex justify-between">
              <dt>고장 정지 시간</dt>
              <dd className="font-semibold">{kpi.downMinutes}분</dd>
            </div>
            <div className="flex justify-between">
              <dt>평균 수리 시간(MTTR)</dt>
              <dd className="font-semibold">{kpi.mttr == null ? "-" : `${kpi.mttr}분`}</dd>
            </div>
            <div className="flex justify-between">
              <dt>평균 고장 간격(MTBF)</dt>
              <dd className="font-semibold">{kpi.mtbfDays == null ? "-" : `${kpi.mtbfDays}일`}</dd>
            </div>
          </dl>
        </Card>
      </div>
    </>
  );
}
