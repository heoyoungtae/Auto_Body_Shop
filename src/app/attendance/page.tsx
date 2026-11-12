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
              <p className="text-sm text-[var(--muted)]">정비소 와이파이에 연결한 휴대폰이나 사무실 PC에서 출근을 누릅니다. 퇴근은 업무일지를 마감하면서 함께 누릅니다. 연장근무는 미리 신청해 승인받은 시간 중 실제로 남아 있던 시간만 인정됩니다.</p>
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
              <Card title="정비소 인터넷 주소" help={{ kind: "panel", id: "punch.config" }}>
                <p className="text-sm">
                  {cfg.ips.length ? `${cfg.ips.join(", ")} 에서만 출퇴근을 누를 수 있습니다.` : "아직 주소가 없어 어디서나 출퇴근을 누를 수 있습니다."}{" "}
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
