// 대시보드 — 로그인하면 처음 보는 화면. 역할에 따라 패널이 달라진다(src/modules/dashboard/service.ts PANELS).
import Link from "next/link";
import type { ReactNode } from "react";
import { getDb } from "@/db/runtime";
import { inbox, myDrafts } from "@/modules/approval/service";
import { CHANNEL_LABEL, seoulParts } from "@/modules/customer/rules";
import { consentPanel, duePanel, intakePanel, monthPanel, PANELS, panelsFor, todayInfo, type PanelId } from "@/modules/dashboard/service";
import { listNotifications } from "@/modules/platform/notify";
import { myTodos } from "@/modules/dashboard/todo";
import { dayLabel } from "../_format";
import { requireUser } from "../_lib/session";
import { Badge, buttonClass, Card, ErrorBox, fmtTime, PageTitle, StatusBadge } from "../_ui";

const More = ({ href, children = "전체" }: { href: string; children?: ReactNode }) => (
  <Link href={href} className="text-sm text-[var(--accent)]">
    {children}
  </Link>
);
const Nothing = ({ children }: { children: ReactNode }) => <p className="text-sm text-[var(--muted)]">{children}</p>;

export default async function HomePage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const user = await requireUser();
  const db = await getDb();
  const ids = panelsFor(user.roles);
  const has = (p: PanelId) => ids.includes(p);
  const [todos, day, todo, mine, notes, intake, due, consents, month] = await Promise.all([
    myTodos(db, user),
    todayInfo(db),
    inbox(db, user.id),
    myDrafts(db, user.id),
    listNotifications(db, user.id),
    has("intake") ? intakePanel(db) : null,
    has("due") ? duePanel(db) : null,
    has("consent") ? consentPanel(db) : null,
    has("month") ? monthPanel(db) : null,
  ]);
  const canWrite = user.roles.some((r) => r === "owner" || r === "plant_manager" || r === "advisor");

  const live: Partial<Record<PanelId, ReactNode>> = {
    intake: intake && (
      <Card key="intake" title={`입고 예약 · 오늘 ${intake.todayRows.length}대`} help={{ kind: "panel", id: "dash.intake" }} actions={<More href="/repairs">입고 받기</More>}>
        {[
          { label: "오늘", date: intake.today, rows: intake.todayRows },
          { label: `다음 영업일 ${dayLabel(intake.next, intake.today)}`, date: intake.next, rows: intake.nextRows },
        ].map((g) => (
          <div key={g.label} className="mb-2 last:mb-0">
            <p className="text-xs font-semibold text-[var(--muted)]">
              {g.label} · {g.rows.length}대
            </p>
            {g.rows.length === 0 ? (
              <Nothing>예약 없음</Nothing>
            ) : (
              <ul className="divide-y divide-[var(--line)] text-sm">
                {g.rows.slice(0, 6).map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-2 py-1.5">
                    <Link href={`/consults/${r.id}`} className="hover:underline">
                      <b className="tabular-nums">{r.reservedAt ? seoulParts(r.reservedAt).time : ""}</b> {r.customerName} {r.plateNo && <span className="text-[var(--muted)]">{r.plateNo}</span>}
                    </Link>
                    {!r.confirmSentAt && <Badge tone="warn">확인 안 보냄</Badge>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </Card>
    ),
    due: due && (
      <Card key="due" title={`챙길 상담 ${due.length}건`} help={{ kind: "panel", id: "dash.due" }} actions={<More href="/consults?f=due" />}>
        {due.length === 0 ? (
          <Nothing>재연락·회신 기한·지난 예약 모두 처리했습니다.</Nothing>
        ) : (
          <ul className="divide-y divide-[var(--line)] text-sm">
            {due.slice(0, 6).map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                <Link href={`/consults/${r.id}`} className="hover:underline">
                  {r.docNo} {r.customerName}
                </Link>
                <span className="flex flex-wrap gap-1">
                  {r.flags.map((f) => (
                    <Badge key={f.label} tone={f.tone}>
                      {f.label}
                    </Badge>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    ),
    consent: consents && (
      <Card key="consent" title={`개인정보 동의 대기 ${consents.length}명`} help={{ kind: "panel", id: "dash.consent" }}>
        {consents.length === 0 ? (
          <Nothing>링크로 요청하고 답을 기다리는 고객이 없습니다.</Nothing>
        ) : (
          <ul className="divide-y divide-[var(--line)] text-sm">
            {consents.slice(0, 6).map((c) => (
              <li key={c.customerId + String(c.expiresAt)} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                <Link href={`/customers/${c.customerId}`} className="hover:underline">
                  {c.name} <span className="text-[var(--muted)]">{c.phone}</span>
                </Link>
                <span className="text-xs text-[var(--muted)]">{fmtTime(c.expiresAt)}까지{!c.sentOk && <Badge tone="danger">발송 실패</Badge>}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    ),
    month: month && (
      <Card key="month" title={`이번 달 상담·문자 (${Number(month.month.slice(5))}월)`} help={{ kind: "panel", id: "dash.month" }}>
        <dl className="grid grid-cols-3 gap-2 text-center">
          {[
            { k: "상담", v: `${month.total}건` },
            { k: "예약 전환", v: month.rate == null ? "—" : `${month.rate}%` },
            { k: "문자·알림톡", v: `${month.messages}건` },
          ].map((x) => (
            <div key={x.k} className="rounded-md bg-[var(--surface-2)] px-2 py-2">
              <dt className="text-xs text-[var(--muted)]">{x.k}</dt>
              <dd className="text-lg font-semibold tabular-nums">{x.v}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-2 text-xs text-[var(--muted)]">
          {month.byChannel.length ? month.byChannel.map((c) => `${CHANNEL_LABEL[c.channel as keyof typeof CHANNEL_LABEL] ?? c.channel} ${c.n}`).join(" · ") : "아직 상담 없음"}
          {month.declined > 0 && ` · 거절·보류 ${month.declined}`}
          {month.failedMessages > 0 && <span className="text-[var(--danger)]"> · 발송 실패 {month.failedMessages}</span>}
        </p>
        <p className="mt-1 text-xs text-[var(--muted)]">자세한 통계 보고서는 개발 예정(2차)입니다.</p>
      </Card>
    ),
    todo: (
      <Card key="todo" title={`결재 대기 ${todo.length}건`} help={{ kind: "panel", id: "home.todo" }} actions={<More href="/approvals">결재함</More>}>
        {todo.length === 0 ? (
          <Nothing>처리할 결재가 없습니다.</Nothing>
        ) : (
          <ul className="divide-y divide-[var(--line)] text-sm">
            {todo.slice(0, 6).map((d) => (
              <li key={d.id} className="py-2">
                <Link href={`/approvals/${d.id}`} className="hover:underline">
                  {d.docNo} {d.title}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    ),
    notes: (
      <Card key="notes" title="최근 알림" help={{ kind: "panel", id: "home.notes" }} actions={<More href="/notifications" />}>
        {notes.length === 0 ? (
          <Nothing>알림이 없습니다.</Nothing>
        ) : (
          <ul className="divide-y divide-[var(--line)] text-sm">
            {notes.slice(0, 6).map((n) => (
              <li key={n.id} className="flex justify-between gap-2 py-2">
                {n.link ? (
                  <Link href={n.link} className={n.readAt ? "text-[var(--muted)]" : "font-medium"}>
                    {n.title}
                  </Link>
                ) : (
                  <span>{n.title}</span>
                )}
                <span className="shrink-0 text-xs text-[var(--muted)]">{fmtTime(n.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    ),
    mine: (
      <Card key="mine" title="내가 올린 문서" help={{ kind: "panel", id: "home.mine" }}>
        {mine.length === 0 ? (
          <Nothing>아직 없습니다.</Nothing>
        ) : (
          <ul className="divide-y divide-[var(--line)] text-sm">
            {mine.slice(0, 6).map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-2 py-2">
                <Link href={`/approvals/${d.id}`} className="hover:underline">
                  {d.docNo} {d.title}
                </Link>
                <StatusBadge status={d.status} />
              </li>
            ))}
          </ul>
        )}
      </Card>
    ),
  };
  const planned = ids.filter((id) => PANELS[id].stage);

  return (
    <>
      <PageTitle
        help="home"
        sub={
          <>
            {dayLabel(day.today, day.today)} · {day.open ? "영업일" : <b className="text-[var(--warn)]">쉬는 날({day.reason})</b>}
            {day.nextOff && ` · 다음 쉬는 날 ${dayLabel(day.nextOff.date, day.today)} ${day.nextOff.reason}`}
          </>
        }
        actions={
          <>
            <Link href="/todo" className={buttonClass(todos.some((t) => t.when === "late") ? "primary" : "secondary")}>
              내 할 일 {todos.length}건{todos.some((t) => t.when === "late") && ` · 늦은 일 ${todos.filter((t) => t.when === "late").length}`}
            </Link>
            {canWrite && (
              <Link href="/consults/new" className={buttonClass("secondary")}>
                새 상담
              </Link>
            )}
          </>
        }
      >
        대시보드
      </PageTitle>
      <ErrorBox message={error} />
      {todo.length === 0 && mine.length === 0 && (
        <div className="mb-4 rounded-md border border-[var(--accent)]/30 bg-[var(--accent-soft)] px-3 py-2.5 text-sm">
          처음 쓰시나요? <Link href="/help" className="font-medium text-[var(--accent)]">도움말 센터</Link>에서 내 역할의 &lsquo;처음 할 일&rsquo;을 보세요. 화면 제목·패널 제목·입력 칸 이름 옆의 ? 를 누르면 오른쪽에 그 도움말이 열립니다.
        </div>
      )}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">{ids.filter((id) => !PANELS[id].stage).map((id) => live[id])}</div>
      {planned.length > 0 && (
        <>
          <h2 className="mt-6 mb-2 text-sm font-semibold text-[var(--muted)]">내 역할에 열릴 패널(개발 예정)</h2>
          <div className="grid gap-4 opacity-60 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {planned.map((id) => (
              <Card key={id} title={`${PANELS[id].title} · ${PANELS[id].stage}`} help={{ kind: "panel", id: "dash.planned" }}>
                <Nothing>{PANELS[id].body}</Nothing>
              </Card>
            ))}
          </div>
        </>
      )}
    </>
  );
}
