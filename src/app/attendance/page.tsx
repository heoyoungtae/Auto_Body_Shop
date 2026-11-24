import Link from "next/link";
import { getDb } from "@/db/runtime";
import { loadShopCalendar } from "@/modules/platform/calendar";
import { loadPolicy } from "@/modules/platform/policy";
import { seoulDate } from "@/modules/platform/time";
import { canSeeTeamLeave, leaveBalance, listLeaves } from "@/modules/staff/attendance";
import { addDaysIso, leaveSummary } from "@/modules/staff/leave-rules";
import { AssistForm } from "../_assist";
import { SubmitButton } from "../_submit";
import { requireUser } from "../_lib/session";
import { Card, Empty, ErrorBox, Notice, PageTitle, StatusBadge } from "../_ui";
import { requestLeaveAction } from "./actions";
import { LeaveFields } from "./leave-form";
import { FixCard, OrderCard, OrdersCard, TeamTodayCard, TodayCard } from "./punch-panels";
import { eq } from "drizzle-orm";
import { appUser } from "@/db/schema";
import { can } from "@/modules/auth/permissions";
import { getEntry } from "@/modules/journal/entry";
import { pendingOrders } from "@/modules/staff/attendance";
import { dayStatus, loadPunchConfig, missingDays, teamToday } from "@/modules/staff/punch";
import { fixedOtHoursOf } from "@/modules/staff/documents";
import { myNotices } from "@/modules/staff/leave-promote";
import { planDue } from "@/modules/staff/leave-rules";
import { answerNoticeAction } from "../staff/leave-promote/actions";
import { closedReason } from "@/modules/platform/business-days";

/** 근태·휴가·연장근로 신청서(F-11-04, STD-11 4절) */
export default async function AttendancePage({ searchParams }: { searchParams: Promise<{ error?: string; notice?: string; m?: string; d?: string; fix?: string }> }) {
  const { error, notice, m, d, fix } = await searchParams;
  const user = await requireUser();
  const db = await getDb();
  const today = seoulDate();
  const month = /^\d{4}-\d{2}$/.test(m ?? "") ? m! : today.slice(0, 7);
  const mFrom = `${month}-01`;
  const mTo = addDaysIso(`${addDaysIso(mFrom, 32).slice(0, 7)}-01`, -1);
  const team = canSeeTeamLeave(user);
  const [bal, mine, cal, pol, all] = await Promise.all([leaveBalance(db, user.id, today), listLeaves(db, user), loadShopCalendar(db), loadPolicy(db, today), team ? listLeaves(db, user, { all: true, from: mFrom, to: mTo }) : Promise.resolve([])]);
  const day = /^\d{4}-\d{2}-\d{2}$/.test(d ?? "") && d! <= today ? d! : today;
  const owner = user.roles.includes("owner");
  const orderer = can(user, "leave.approve");
  const [st, orders, missing, journal, teamRows, cfg, staff] = await Promise.all([
    dayStatus(db, user.id, day),
    pendingOrders(db, user.id),
    missingDays(db, user.id),
    getEntry(db, user.id, today),
    teamToday(db, user, today),
    owner ? loadPunchConfig(db) : Promise.resolve(null),
    orderer ? db.select({ id: appUser.id, name: appUser.name }).from(appUser).where(eq(appUser.active, true)).orderBy(appUser.name) : Promise.resolve([]),
  ]);
  // 고정 연장근로수당(포괄 약정)을 받는 직원: 이달 승인된 평일 연장 vs 약정 시간
  const fixH = await fixedOtHoursOf(db, user.id, today);
  const lp = await myNotices(db, user.id, today);
  const lpOpen = lp && ((lp.r1 && !lp.r1.planOn && !lp.r2) || (lp.r2 && !lp.r2.confirmedAt));
  const otMonth = mine
    .filter((r) => r.data.leaveKind === "overtime" && ["confirmed", "checked"].includes(r.doc.status) && r.data.fromDate.slice(0, 7) === today.slice(0, 7) && closedReason(cal, r.data.fromDate) == null)
    .reduce((s, r) => s + (r.data.hours ?? 0), 0);
  const journalClosed = journal?.status === "closed" || journal?.status === "confirmed";
  const prev = addDaysIso(mFrom, -1).slice(0, 7);
  const next = addDaysIso(mTo, 1).slice(0, 7);
  return (
    <>
      <PageTitle help="attendance" sub="출근·퇴근을 누르고, 연차·반차·병가·외출·조퇴·지각·결근·연장근무를 신청서로 올립니다. 공장장이 승인합니다(공장장 본인은 대표). 연장근무는 승인된 시간 중 실제로 일한 시간만 인정합니다. 사내 표준서 STD-11 4절.">
        출퇴근·근태
      </PageTitle>
      <ErrorBox message={error} />
      {notice && <Notice>{notice}</Notice>}
      <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_1fr]">
        <TodayCard st={st} isToday={day === today} journalClosed={journalClosed} />
        <div className="space-y-4">
          <OrdersCard orders={orders} />
          <FixCard missing={missing} pick={fix} />
          {!orders.length && !missing.length && (
            <Card title="출퇴근 안내" help={{ kind: "panel", id: "punch.today" }}>
              <p className="text-sm text-[var(--muted)]">공업사 와이파이에 연결한 휴대폰이나 사무실 PC에서 출근을 누릅니다. 퇴근은 업무일지를 마감하면서 함께 누릅니다. 연장근무는 미리 신청해 승인받은 시간 중 실제로 남아 있던 시간만 인정됩니다.</p>
            </Card>
          )}
        </div>
      </div>
      {(teamRows.length > 0 || orderer || cfg) && (
        <div className="mt-4 grid gap-4 xl:grid-cols-[2fr_1fr]">
          {teamRows.length > 0 && <TeamTodayCard rows={teamRows} day={today} />}
          <div className="space-y-4">
            {orderer && <OrderCard users={staff.filter((u) => u.id !== user.id)} today={today} defaultFrom={st.schedule.end} />}
            {cfg && (
              <Card title="공업사 인터넷 주소" help={{ kind: "panel", id: "punch.config" }}>
                <p className="text-sm">
                  {cfg.ips.length || cfg.sameAsServer ? `${[cfg.sameAsServer ? "서버와 같은 공업사 인터넷" : "", ...cfg.ips].filter(Boolean).join(", ")} 에서만 출퇴근을 누를 수 있습니다.` : "아직 주소가 없어 어디서나 출퇴근을 누를 수 있습니다."}{" "}
                  <Link href="/settings/punch" className="text-[var(--accent)] hover:underline">
                    설정에서 바꾸기
                  </Link>
                </p>
              </Card>
            )}
          </div>
        </div>
      )}
      <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_1fr]">
        <Card title="내 연차" help={{ kind: "panel", id: "leave.balance" }}>
          {bal ? (
            <>
              <div className="grid grid-cols-4 gap-2 text-center">
                {[
                  ["생김", bal.days],
                  ["씀", bal.used],
                  ["결재 중", bal.pending],
                  ["남음", bal.remain],
                ].map(([l, v]) => (
                  <div key={l} className="rounded-md border border-[var(--line)] p-2">
                    <div className="text-xs text-[var(--muted)]">{l}</div>
                    <div className="text-xl font-semibold tabular-nums">{v}일</div>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-xs text-[var(--muted)]">
                연차 연도 {bal.from} ~ {bal.to} (입사일 {bal.hiredOn} 기준{bal.firstYear ? ", 입사 1년 미만: 1개월 개근마다 1일" : ""}). {bal.legal ? "근로기준법 제60조" : "상시 5명 미만 사업장 사내 연차(정책값)"} · 입사일은 근로자 명부에서 불러옴.
              </p>
            </>
          ) : (
            <p className="text-sm text-[var(--muted)]">근로자 명부에 입사일이 없어 연차를 계산하지 못합니다. 회계 담당에게 명부 작성을 요청하세요. 연차·반차 외의 근태는 지금도 신청할 수 있습니다.</p>
          )}
        </Card>

        {lpOpen && lp && (
          <Card title="연차 사용 촉진" help={{ kind: "panel", id: "leave.promote" }}>
            {lp.r2 ? (
              <form action={answerNoticeAction} className="space-y-2 text-sm">
                <input type="hidden" name="id" value={lp.r2.id} />
                <input type="hidden" name="plan" value="" />
                <p>
                  회사가 남은 연차 <b>{lp.r2.remain}일</b>을 쓸 날을 정했습니다: <b>{lp.r2.dates}</b>
                </p>
                <p className="text-xs text-[var(--muted)]">이 날에는 연차 신청서를 올려 쉬세요. 촉진을 받고도 쓰지 않은 연차는 수당으로 받지 못할 수 있습니다.</p>
                <SubmitButton>받았음 확인</SubmitButton>
              </form>
            ) : lp.r1 ? (
              <form action={answerNoticeAction} className="space-y-2 text-sm">
                <input type="hidden" name="id" value={lp.r1.id} />
                <p>
                  연차 연도 {lp.bal.from} ~ {lp.bal.to}에 남은 연차가 <b>{lp.r1.remain}일</b>입니다. <b>{planDue(lp.r1.sentOn)}</b>까지 쓸 날을 정해 내 주세요.
                </p>
                <textarea name="plan" required rows={2} maxLength={300} placeholder="예: 12월 24일, 12월 26일, 1월 2일" className="w-full rounded-md border border-[var(--line)] bg-[var(--bg)] p-2" />
                <p className="text-xs text-[var(--muted)]">내지 않으면 회사가 쓸 날을 정해 보냅니다. 낸 날에도 연차 신청서는 따로 올립니다.</p>
                <SubmitButton>쓸 날 내기</SubmitButton>
              </form>
            ) : null}
          </Card>
        )}

        {fixH > 0 && (
          <Card title="이달 연장(고정 연장근로수당)" help={{ kind: "panel", id: "leave.fixedOt" }}>
            <div className="h-3 w-full overflow-hidden rounded-full bg-[var(--line)]">
              <div className={`h-full ${otMonth > fixH ? "bg-[var(--warn)]" : "bg-[var(--accent)]"}`} style={{ width: `${Math.min(100, (otMonth / fixH) * 100)}%` }} />
            </div>
            <p className="mt-2 text-sm">
              승인된 평일 연장 <b>{Math.round(otMonth * 100) / 100}시간</b> / 약정 {fixH}시간
            </p>
            <p className="mt-1 text-xs text-[var(--muted)]">
              약정 시간만큼의 연장수당은 매달 고정으로 받습니다(덜 일해도 그대로). 약정을 넘긴 시간은 급여에서 차액으로 더 받습니다. 최종 인정은 승인 시간 중 실제 출퇴근과 겹친 시간입니다. 연장은 지금처럼 미리 신청합니다.
            </p>
          </Card>
        )}

        <Card title="근태 신청서 쓰기" help={{ kind: "panel", id: "leave.new" }}>
          <AssistForm id="leave-new" action={requestLeaveAction} className="space-y-3">
            <LeaveFields cal={cal} today={today} remain={bal?.remain ?? null} overtimeCap />
            <SubmitButton>신청(상신)</SubmitButton>
          </AssistForm>
        </Card>
      </div>

      <div className="mt-4 space-y-4">
        <Card title="내 신청" help={{ kind: "panel", id: "leave.mine" }}>
          {mine.length ? (
            <ul className="divide-y divide-[var(--line)] text-sm">
              {mine.slice(0, 30).map((r) => (
                <li key={r.doc.id} className="flex flex-wrap items-center gap-2 py-2">
                  <Link href={`/approvals/${r.doc.id}`} className="font-medium text-[var(--accent)]">
                    {r.doc.docNo}
                  </Link>
                  <span className="min-w-0 flex-1">{leaveSummary(r.data)}</span>
                  <StatusBadge status={r.doc.status} />
                </li>
              ))}
            </ul>
          ) : (
            <Empty>아직 신청한 근태가 없습니다.</Empty>
          )}
          <p className="mt-2 text-xs text-[var(--muted)]">승인된 신청을 바꾸려면 문서를 열어 &apos;취소 요청&apos;을 올린 뒤 새로 신청합니다.</p>
        </Card>

        {team && (
          <Card
            title={`직원 근태 ${month}`}
            help={{ kind: "panel", id: "leave.team" }}
            actions={
              <span className="flex gap-3 text-sm">
                <Link href={`/attendance?m=${prev}`} className="text-[var(--accent)]">
                  ← {prev}
                </Link>
                <Link href={`/attendance?m=${next}`} className="text-[var(--accent)]">
                  {next} →
                </Link>
              </span>
            }
          >
            {all.length ? (
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-[var(--muted)]">
                  <tr>
                    <th className="py-1.5 pr-2">문서</th>
                    <th className="py-1.5 pr-2">직원</th>
                    <th className="py-1.5 pr-2">내용</th>
                    <th className="py-1.5 pr-2">사유</th>
                    <th className="py-1.5 pr-2">상태</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--line)]">
                  {all.map((r) => (
                    <tr key={r.doc.id}>
                      <td className="py-1.5 pr-2">
                        <Link href={`/approvals/${r.doc.id}`} className="text-[var(--accent)]">
                          {r.doc.docNo}
                        </Link>
                      </td>
                      <td className="py-1.5 pr-2">{r.name}</td>
                      <td className="py-1.5 pr-2">{leaveSummary(r.data)}</td>
                      <td className="py-1.5 pr-2 text-[var(--muted)]">{r.data.reason}</td>
                      <td className="py-1.5 pr-2">
                        <StatusBadge status={r.doc.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <Empty>이 달 근태 신청이 없습니다.</Empty>
            )}
          </Card>
        )}
      </div>
    </>
  );
}
