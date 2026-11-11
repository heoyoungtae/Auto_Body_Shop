// 출퇴근 화면 조각(사용자 결정 2026-11-11): 오늘 출퇴근, 받은 연장 지시, 출퇴근 정정, 오늘 팀 현황, 연장 지시, 정비소 인터넷 주소.
// 신고서·신청서는 출퇴근 기록과 근로계약서 시각으로 미리 채워 다시 입력하지 않게 한다.
import Link from "next/link";
import type { ReactNode } from "react";
import type { LeaveData } from "@/modules/staff/attendance";
import type { DayStatus } from "@/modules/staff/punch";
import { durText } from "@/modules/staff/punch-rules";
import { TIME_OPTIONS } from "@/modules/staff/leave-rules";
import { AssistForm } from "../_assist";
import { DateField, SelectField, TextAreaField } from "../_input";
import { SubmitButton } from "../_submit";
import { Badge, buttonClass, Card, Empty } from "../_ui";
import { answerOrderAction, orderOvertimeAction, punchInAction, punchOutAction, requestLeaveAction, savePunchConfigAction } from "./actions";

/** 미리 채운 근태 신고서(지각·조퇴·사후 연장·휴일근로·정정): 숨은 칸 + 사유만 적는다 */
function QuickLeave({ id, kind, day, from, to, reason, children, button }: { id: string; kind: string; day: string; from: string; to: string; reason?: string; children: ReactNode; button: string }) {
  return (
    <AssistForm id={id} action={requestLeaveAction} className="mt-2 space-y-2 rounded-md border border-[var(--warn)] bg-[var(--warn-soft)] p-3" guard={false}>
      <div className="text-sm">{children}</div>
      <input type="hidden" name="leaveKind" value={kind} />
      <input type="hidden" name="fromDate" value={day} />
      <input type="hidden" name="fromTime" value={from} />
      <input type="hidden" name="toTime" value={to} />
      <input type="hidden" name="back" value="/attendance" />
      <TextAreaField help="leave.reason" name="reason" required rows={1} defaultValue={reason} />
      <SubmitButton>{button}</SubmitButton>
    </AssistForm>
  );
}

export function TodayCard({ st, isToday, journalClosed }: { st: DayStatus; isToday: boolean; journalClosed: boolean }) {
  const title = isToday ? "오늘 출퇴근" : `${st.day} 출퇴근`;
  return (
    <Card title={title} help={{ kind: "panel", id: "punch.today" }}>
      <div id="today" className="grid grid-cols-2 gap-2 text-center md:grid-cols-4">
        {[
          ["정해진 시간", `${st.schedule.start}~${st.schedule.end}`],
          ["출근", st.inText ?? "—"],
          ["퇴근", st.outText ?? (st.open ? "근무 중" : "—")],
          ["인정 연장", st.recognized ? durText(st.recognized) : "—"],
        ].map(([l, v]) => (
          <div key={l} className="rounded-md border border-[var(--line)] p-2">
            <div className="text-xs text-[var(--muted)]">{l}</div>
            <div className="text-lg font-semibold tabular-nums">{v}</div>
          </div>
        ))}
      </div>
      <p className="mt-2 text-xs text-[var(--muted)]">
        {st.business ? "영업일" : "쉬는 날"} · 시간은 {st.schedule.fromContract ? "근로계약서" : "취업규칙 기본(계약서 없음)"}에서 불러옴{st.fixed ? " · 확정된 출퇴근 정정 값" : ""}
        {st.off ? " · 종일 휴가" : ""}
      </p>

      {isToday && (
        <div className="mt-3 flex flex-wrap gap-2">
          {!st.punched && (
            <form action={punchInAction}>
              <SubmitButton>출근</SubmitButton>
            </form>
          )}
          {st.open &&
            (journalClosed ? (
              <form action={punchOutAction}>
                <SubmitButton>퇴근</SubmitButton>
              </form>
            ) : (
              <Link href={`/journal?d=${st.day}#close`} className={buttonClass()}>
                업무일지 마감하고 퇴근
              </Link>
            ))}
          {st.punched && !st.open && <Badge tone="ok">오늘 출퇴근 끝</Badge>}
        </div>
      )}

      {st.overtime.length > 0 && (
        <ul className="mt-3 divide-y divide-[var(--line)] text-sm">
          {st.overtime.map((o) => (
            <li key={o.id} className="flex flex-wrap items-center gap-2 py-1.5">
              <Link href={`/approvals/${o.id}`} className="text-[var(--accent)]">
                {o.docNo}
              </Link>
              <span>
                연장 {o.from}~{o.to}
                {o.after ? " (사후)" : ""}
              </span>
              {o.done ? <Badge tone="ok">승인 · 인정 {durText(o.recognized)}</Badge> : <Badge tone="warn">결재 중</Badge>}
            </li>
          ))}
        </ul>
      )}

      {st.late > 0 && (
        <QuickLeave id="quick-late" kind="late" day={st.day} from={st.schedule.start} to={st.inText!} button="지각 신고">
          정해진 출근 {st.schedule.start}보다 <b>{durText(st.late)}</b> 늦게 출근했습니다. 시각은 출근 기록에서 불러왔습니다. 사유만 적어 올리세요.
        </QuickLeave>
      )}
      {st.early > 0 && st.outText && (
        <QuickLeave id="quick-early" kind="early" day={st.day} from={st.outText} to={st.schedule.end} button="조퇴 신고">
          정해진 퇴근 {st.schedule.end}보다 <b>{durText(st.early)}</b> 일찍 퇴근했습니다. 사유를 적어 조퇴로 올리세요.
        </QuickLeave>
      )}
      {st.overstay && st.afterTo && (
        <QuickLeave id="quick-after" kind="overtime" day={st.day} from={st.afterFrom} to={st.afterTo} button="사후 연장 신청">
          승인 없이 <b>{durText(st.unapproved)}</b> 더 일했습니다({st.afterFrom}~{st.afterTo}). 신청하지 않으면 수당에 들어가지 않습니다. 공장장이 인정 여부를 정합니다.
        </QuickLeave>
      )}
      {isToday && st.holidayWork && (
        <QuickLeave id="quick-holiday" kind="overtime" day={st.day} from={st.inText!} to={st.schedule.end} button="휴일근로 신청">
          오늘은 쉬는 날인데 승인된 휴일근로가 없습니다. 끝 시각은 정해진 퇴근으로 채웠습니다. 다르면 퇴근한 뒤 정정하세요. 승인 없이 일한 시간은 인정되지 않습니다.
        </QuickLeave>
      )}
    </Card>
  );
}

export function OrdersCard({ orders }: { orders: { doc: { id: string; docNo: string }; data: LeaveData }[] }) {
  if (!orders.length) return null;
  return (
    <Card title="받은 연장근무 지시" help={{ kind: "panel", id: "punch.orders" }}>
      <ul id="orders" className="space-y-3 text-sm">
        {orders.map((o) => (
          <li key={o.doc.id} className="rounded-md border border-[var(--line)] p-3">
            <div>
              <b>
                {o.data.fromDate} {o.data.fromTime}~{o.data.toTime}
              </b>{" "}
              ({o.data.hours}시간) · {o.data.orderedByName} 지시 · {o.data.reason}
            </div>
            <AssistForm id={`order-${o.doc.id}`} action={answerOrderAction} className="mt-2 space-y-2" guard={false}>
              <input type="hidden" name="docId" value={o.doc.id} />
              <TextAreaField help="punch.declineNote" name="note" rows={1} />
              <div className="flex gap-2">
                <SubmitButton name="intent" value="agree" noValidate>
                  동의
                </SubmitButton>
                <SubmitButton name="intent" value="decline" variant="secondary">
                  거절
                </SubmitButton>
              </div>
            </AssistForm>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function FixCard({ missing, pick }: { missing: { day: string; kind: "none" | "noOut"; inText: string | null; activity: { first: string; last: string } | null }[]; pick?: string }) {
  if (!missing.length) return null;
  return (
    <Card title="출퇴근 정정" help={{ kind: "panel", id: "punch.fix" }}>
      <div id="fix" className="space-y-3">
        {missing.map((m) => {
          const from = m.inText ?? m.activity?.first ?? "09:00";
          const to = m.activity?.last && m.activity.last > from ? m.activity.last : "18:00";
          return (
            <details key={m.day} open={pick === m.day || missing.length === 1}>
              <summary className="cursor-pointer text-sm">
                <b>{m.day}</b> {m.kind === "noOut" ? `출근 ${m.inText} · 퇴근 기록 없음` : "출근·퇴근 기록 없음"}
                {m.activity ? ` · 앱 기록 ${m.activity.first}~${m.activity.last}` : ""}
              </summary>
              <AssistForm id={`fix-${m.day}`} action={requestLeaveAction} className="mt-2 space-y-2" guard={false}>
                <input type="hidden" name="leaveKind" value="punch_fix" />
                <input type="hidden" name="fromDate" value={m.day} />
                <input type="hidden" name="back" value="/attendance" />
                <div className="grid gap-2 md:grid-cols-2">
                  <SelectField help="punch.fixIn" name="fromTime" required defaultValue={from} options={withValue(from)} />
                  <SelectField help="punch.fixOut" name="toTime" required defaultValue={to} options={withValue(to)} />
                </div>
                <p className="text-xs text-[var(--muted)]">{m.inText ? "출근은 버튼 기록, " : ""}퇴근은 그날 앱에서 마지막으로 기록한 시각에서 불러왔습니다. 실제와 다르면 고치세요.</p>
                <TextAreaField help="leave.reason" name="reason" required rows={1} defaultValue={m.kind === "noOut" ? "퇴근 버튼을 못 누름" : "출퇴근 버튼을 못 누름"} />
                <SubmitButton>정정 신청</SubmitButton>
              </AssistForm>
            </details>
          );
        })}
      </div>
    </Card>
  );
}

/** 30분 목록에 없는 시각(기록에서 불러온 분 단위)도 고를 수 있게 넣는다 */
function withValue(v: string) {
  return TIME_OPTIONS.some((o) => o.value === v) ? TIME_OPTIONS : [...TIME_OPTIONS, { value: v, label: `${v} (기록)` }].sort((a, b) => a.value.localeCompare(b.value));
}

export function TeamTodayCard({ rows, day }: { rows: { id: string; name: string; st: DayStatus }[]; day: string }) {
  return (
    <Card title={`직원 출퇴근 ${day}`} help={{ kind: "panel", id: "punch.team" }}>
      {rows.length ? (
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-[var(--muted)]">
            <tr>
              <th className="py-1.5 pr-2">직원</th>
              <th className="py-1.5 pr-2">출근</th>
              <th className="py-1.5 pr-2">퇴근</th>
              <th className="py-1.5 pr-2">연장(인정)</th>
              <th className="py-1.5 pr-2">살펴볼 것</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--line)]">
            {rows.map(({ id, name, st }) => {
              const flags: ReactNode[] = [];
              if (st.off) flags.push(<Badge key="off">휴가</Badge>);
              else if (st.business && !st.inText) flags.push(<Badge key="no" tone="warn">출근 기록 없음</Badge>);
              if (st.late) flags.push(<Badge key="late" tone="warn">지각 {durText(st.late)} 미신고</Badge>);
              if (st.overstay) flags.push(<Badge key="over" tone="danger">승인 없이 {durText(st.unapproved)}</Badge>);
              if (st.holidayWork) flags.push(<Badge key="hol" tone="danger">휴일근로 승인 없음</Badge>);
              if (st.pendingFix) flags.push(<Badge key="fix">정정 결재 중</Badge>);
              return (
                <tr key={id}>
                  <td className="py-1.5 pr-2">{name}</td>
                  <td className="py-1.5 pr-2 tabular-nums">{st.inText ?? "—"}</td>
                  <td className="py-1.5 pr-2 tabular-nums">{st.outText ?? (st.open ? "근무 중" : "—")}</td>
                  <td className="py-1.5 pr-2">{st.overtime.length ? st.overtime.map((o) => `${o.from}~${o.to}${o.done ? "" : "(결재 중)"}`).join(", ") + (st.recognized ? ` · ${durText(st.recognized)}` : "") : "—"}</td>
                  <td className="py-1.5 pr-2">
                    <span className="flex flex-wrap gap-1">{flags.length ? flags : <span className="text-[var(--muted)]">—</span>}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : (
        <Empty>직원이 없습니다.</Empty>
      )}
    </Card>
  );
}

export function OrderCard({ users, today, defaultFrom }: { users: { id: string; name: string }[]; today: string; defaultFrom: string }) {
  return (
    <Card title="연장근무 지시" help={{ kind: "panel", id: "punch.order" }}>
      <AssistForm id="ot-order" action={orderOvertimeAction} className="space-y-3">
        <div className="grid gap-3 md:grid-cols-2">
          <SelectField help="punch.orderUser" name="userId" required placeholder="고르기" options={users.map((u) => ({ value: u.id, label: u.name }))} />
          <DateField help="leave.date" name="fromDate" required defaultValue={today} quick={["today", "tomorrow"]} />
          <SelectField help="leave.fromTime" name="fromTime" required defaultValue={defaultFrom} options={TIME_OPTIONS} />
          <SelectField help="leave.toTime" name="toTime" required placeholder="고르기" options={TIME_OPTIONS} />
        </div>
        <TextAreaField help="leave.reason" name="reason" required rows={1} />
        <SubmitButton>지시 보내기</SubmitButton>
      </AssistForm>
    </Card>
  );
}

export function PlaceCard({ ips, myIp }: { ips: string[]; myIp: string }) {
  return (
    <Card title="정비소 인터넷 주소" help={{ kind: "panel", id: "punch.config" }}>
      <AssistForm id="punch-config" action={savePunchConfigAction} className="space-y-3">
        <TextAreaField help="punch.ips" name="ips" rows={2} defaultValue={ips.length ? ips.join("\n") : myIp} />
        <p className="text-xs text-[var(--muted)]">
          지금 이 기기의 주소: <b>{myIp || "알 수 없음"}</b>
          {ips.length ? "" : " (아직 저장 전이라 칸에 미리 넣었습니다. 정비소 와이파이에 연결한 상태에서 저장하세요)"}
        </p>
        {!ips.length && <p className="rounded-md border border-[var(--warn)] bg-[var(--warn-soft)] px-3 py-2 text-sm">아직 주소가 없어 어디서나 출퇴근을 누를 수 있습니다.</p>}
        <SubmitButton>저장</SubmitButton>
      </AssistForm>
    </Card>
  );
}
