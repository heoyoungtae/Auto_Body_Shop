import { getDb } from "@/db/runtime";
import { seoulDate } from "@/modules/platform/time";
import { canAssign, promoteBoard } from "@/modules/staff/leave-promote";
import { planDue } from "@/modules/staff/leave-rules";
import { SubmitButton } from "../../_submit";
import { requireUser } from "../../_lib/session";
import { Badge, Card, Empty, ErrorBox, Notice, PageTitle } from "../../_ui";
import { assignDatesAction, sendFirstAction } from "./actions";

/** 연차 사용 촉진 현황(근로기준법 제61조, STD-11 7.4): 대표·회계 */
export default async function LeavePromotePage({ searchParams }: { searchParams: Promise<{ error?: string; notice?: string }> }) {
  const { error, notice } = await searchParams;
  const user = await requireUser();
  const db = await getDb();
  const today = seoulDate();
  if (!canAssign(user))
    return (
      <>
        <PageTitle help="staff.leavePromote">연차 사용 촉진</PageTitle>
        <ErrorBox message="대표·회계 담당만 봅니다" />
      </>
    );
  const rows = await promoteBoard(db, user, today);
  return (
    <>
      <PageTitle help="staff.leavePromote" std="STD-11" sub="연차는 월급에 미리 넣지 않고, 앱이 사용을 촉진한 뒤 연도 끝에 남은 연차만 정산합니다. 1차는 앱이 기간에 자동으로 보내고, 직원이 10일 안에 쓸 날을 내지 않으면 여기서 2차(쓸 날 지정)를 보냅니다.">
        연차 사용 촉진
      </PageTitle>
      <ErrorBox message={error} />
      {notice && <Notice>{notice}</Notice>}
      <div className="mt-4">
        <Card title={`직원 ${rows.length}명`} help={{ kind: "panel", id: "lp.board" }}>
          {rows.length === 0 ? (
            <Empty>근로자 명부에 입사일이 있는 직원이 없습니다.</Empty>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-[var(--muted)]">
                  <tr>
                    <th className="py-1.5 pr-2">이름</th>
                    <th className="py-1.5 pr-2">연차 연도</th>
                    <th className="py-1.5 pr-2 text-right">생김·씀·남음</th>
                    <th className="py-1.5 pr-2">1차(기간)</th>
                    <th className="py-1.5 pr-2">직원이 낸 날</th>
                    <th className="py-1.5 pr-2">2차(기한)</th>
                    <th className="py-1.5">상태</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const remain = Math.max(0, r.bal.days - r.bal.used - r.bal.pending);
                    return (
                      <tr key={r.userId} className="border-t border-[var(--line)] align-top">
                        <td className="py-2 pr-2 font-medium">{r.name}</td>
                        <td className="py-2 pr-2 text-xs">
                          {r.bal.from} ~ {r.bal.to}
                          {r.bal.firstYear ? " (1년 미만)" : ""}
                        </td>
                        <td className="py-2 pr-2 text-right tabular-nums">
                          {r.bal.days} · {r.bal.used} · <b>{remain}</b>
                        </td>
                        <td className="py-2 pr-2 text-xs">
                          {r.r1 ? (
                            <>
                              {r.r1.sentOn} 보냄{r.r1.confirmedAt ? " · 확인" : " · 미확인"}
                            </>
                          ) : (
                            <>
                              {r.w.r1From}~{r.w.r1To}
                              <form action={sendFirstAction} className="mt-1">
                                <input type="hidden" name="userId" value={r.userId} />
                                <SubmitButton>지금 보내기</SubmitButton>
                              </form>
                            </>
                          )}
                        </td>
                        <td className="py-2 pr-2 text-xs">{r.r1?.planText ? `${r.r1.planText} (${r.r1.planOn})` : r.r1 ? `${planDue(r.r1.sentOn)}까지` : "—"}</td>
                        <td className="py-2 pr-2 text-xs">
                          {r.r2 ? (
                            <>
                              {r.r2.sentOn} 지정: {r.r2.dates}
                              {r.r2.confirmedAt ? " · 확인" : " · 미확인"}
                            </>
                          ) : r.needR2 ? (
                            <form action={assignDatesAction} className="grid gap-1">
                              <input type="hidden" name="userId" value={r.userId} />
                              <input name="dates" required placeholder="예: 12월 24일, 12월 26일" className="h-9 rounded-md border border-[var(--line)] bg-[var(--bg)] px-2" />
                              <span className="text-[var(--muted)]">{r.w.r2Due}까지</span>
                              <SubmitButton>쓸 날 지정해 보내기</SubmitButton>
                            </form>
                          ) : (
                            <span className="text-[var(--muted)]">{r.w.r2Due}까지(필요하면)</span>
                          )}
                        </td>
                        <td className="py-2">
                          {r.done ? <Badge tone="ok">촉진 완료</Badge> : r.needR2 ? <Badge tone="warn">2차 필요</Badge> : today > r.w.r1To && !r.r1 ? <Badge tone="danger">1차 기간 지남</Badge> : <Badge>진행 전</Badge>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <p className="mt-3 text-xs text-[var(--muted)]">
            촉진을 기간 안에 다 하면(1차 + 직원이 쓸 날을 냄 또는 2차 지정) 연도 끝에 남은 연차를 보상하지 않습니다. 못 하면 연도가 끝난 달 급여에 &lsquo;미사용 연차수당&rsquo;이 자동으로 들어갑니다. 퇴직하는 달에는 남은 연차를 촉진과 관계없이 정산합니다. 지정한 날에 직원이 출근하면 일을 시키지 않는다는 뜻을 분명히 해야 합니다(노무사 확인 권장).
          </p>
        </Card>
      </div>
    </>
  );
}
