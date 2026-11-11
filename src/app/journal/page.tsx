// 개인별 일일 업무일지 — 그날 앱 기록에서 저절로 만든다(src/modules/journal). 입력 칸은 날짜·직원 고르기뿐이다.
import Link from "next/link";
import { getDb } from "@/db/runtime";
import { can } from "@/modules/auth/permissions";
import { ROLE_LABEL } from "@/modules/auth/roles";
import { confirmRoleFor, entryStatuses, getEntry, JOURNAL_STATUS, tomorrowPlan, type JournalStatus } from "@/modules/journal/entry";
import { buildJournal, canViewJournal, journalUsers, teamJournal } from "@/modules/journal/service";
import { addDays, seoulDate } from "@/modules/platform/time";
import { dayLabel } from "../_format";
import { DateField, SelectField } from "../_input";
import { requireUser } from "../_lib/session";
import { Badge, Button, buttonClass, Card, Empty, ErrorBox, Notice, PageTitle } from "../_ui";
import { MyEntryPanel, OtherEntryPanel } from "./entry-panel";
import { PrintButton } from "../reports/print-button";

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const hm = (d: Date | null) => (d ? d.toLocaleTimeString("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hour12: false }) : "-");
const mins = (n: number) => (n >= 60 ? `${Math.floor(n / 60)}시간 ${n % 60}분` : `${n}분`);
const TONE = { ok: "border-l-[var(--ok)]", warn: "border-l-[var(--warn)]", danger: "border-l-[var(--danger)]" } as const;

export default async function JournalPage({ searchParams }: { searchParams: Promise<{ d?: string; u?: string; error?: string; notice?: string }> }) {
  const q = await searchParams;
  const user = await requireUser();
  const db = await getDb();
  const today = seoulDate();
  const date = q.d && ISO.test(q.d) && q.d <= today ? q.d : today;
  const team = can(user, "journal.team");
  const target = q.u && canViewJournal(user, q.u) ? q.u : user.id;
  const url = (d: string, u = target) => `/journal?d=${d}${u !== user.id ? `&u=${u}` : ""}`;
  const [j, users, summary, entry, statuses] = await Promise.all([
    buildJournal(db, user, target, date).catch((e: Error) => e),
    journalUsers(db, user),
    team ? teamJournal(db, user, date) : Promise.resolve(null),
    getEntry(db, target, date),
    team ? entryStatuses(db, date) : Promise.resolve(new Map()),
  ]);
  if (j instanceof Error) return <ErrorBox message={j.message} />;
  const mine = target === user.id;
  const plan = mine ? await tomorrowPlan(db, user, target, date) : null;
  const cRole = confirmRoleFor(j.user.roles);
  const confirmerLabel = cRole ? ROLE_LABEL[cRole] : null;
  const canReview = !mine && !!cRole && (user.roles.includes(cRole) || user.roles.includes("owner"));
  const eff = j.workMinutes ? Math.round((j.stdMinutes / j.workMinutes) * 100) : null;

  return (
    <>
      <PageTitle
        help="journal"
        sub={`${mine ? "내" : `${j.user.name} 님의`} ${date} 업무일지입니다. 앱에서 한 일은 저절로 모이고, 아래 '내가 적는 칸'만 적어 퇴근 전에 마감합니다.`}
        actions={
          <div className="no-print flex flex-wrap gap-2">
            <PrintButton />
            <Link href="/todo" className={buttonClass("secondary")}>내 할 일</Link>
          </div>
        }
      >
        업무일지
      </PageTitle>
      <ErrorBox message={q.error} />
      {q.notice && <Notice>{q.notice}</Notice>}

      <Card title="날짜·직원" help={{ kind: "panel", id: "journal.day" }}>
        <div className="flex flex-wrap items-center gap-2">
          <Link href={url(addDays(date, -1))} className={`no-print ${buttonClass("secondary")}`}>◀ 앞날</Link>
          <b className="text-lg">
            {j.user.name} · {date} ({dayLabel(date, today)})
          </b>
          {date < today && <Link href={url(addDays(date, 1))} className={`no-print ${buttonClass("secondary")}`}>다음날 ▶</Link>}
          {date !== today && <Link href={url(today)} className={`no-print ${buttonClass("secondary")}`}>오늘</Link>}
          {date === today && <Badge tone="warn">오늘 · 지금까지 기록</Badge>}
        </div>
        <form method="get" className="no-print mt-3 flex flex-wrap items-end gap-2">
          <DateField help="journal.date" name="d" defaultValue={date} quick={["today"]} />
          {team && users.length > 1 ? (
            <SelectField help="journal.user" name="u" defaultValue={target} options={users.map((u) => ({ value: u.id, label: u.id === user.id ? `${u.name}(나)` : u.name }))} />
          ) : (
            <input type="hidden" name="u" value={target} />
          )}
          <Button type="submit" variant="secondary">일지 보기</Button>
        </form>
      </Card>

      <Card title="하루 요약" help={{ kind: "panel", id: "journal.summary" }}>
        <div className="grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-4">
          <div>
            <p className="text-xs text-[var(--muted)]">역할</p>
            <p>{j.user.roles.map((r) => ROLE_LABEL[r]).join(", ") || "-"}</p>
          </div>
          <div>
            <p className="text-xs text-[var(--muted)]">첫 기록 ~ 마지막 기록</p>
            <p>
              {hm(j.firstAt)} ~ {hm(j.lastAt)}
            </p>
          </div>
          <div>
            <p className="text-xs text-[var(--muted)]">끝낸 공정 · 작업 시간</p>
            <p>
              {j.steps.length}개 · {mins(j.workMinutes)}
              {eff !== null && j.stdMinutes > 0 && <span className="text-[var(--muted)]"> (표준 {mins(j.stdMinutes)}, 효율 {eff}%)</span>}
            </p>
          </div>
          <div>
            <p className="text-xs text-[var(--muted)]">근태</p>
            <p>{j.leave.length ? j.leave.map((l) => <Badge key={l} tone="accent">{l}</Badge>) : "정상(확정된 휴가·외출 없음)"}</p>
          </div>
        </div>
        {j.areas.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1">
            {j.areas.map((a) => (
              <Badge key={a.area}>
                {a.area} {a.count}
              </Badge>
            ))}
          </div>
        )}
      </Card>

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <Card title={`한 일 ${j.entries.length}건`} help={{ kind: "panel", id: "journal.entries" }}>
            {j.entries.length === 0 ? (
              <Empty>{date === today ? "아직 오늘 기록이 없습니다. 앱에서 일을 저장하면 여기 저절로 쌓입니다." : "이날 앱에 남은 기록이 없습니다."}</Empty>
            ) : (
              <ol className="space-y-1">
                {j.entries.map((e, i) => (
                  <li key={i}>
                    <Link href={e.href ?? "#"} className={`flex flex-wrap items-baseline gap-x-3 gap-y-0.5 rounded-md border border-l-4 border-[var(--line)] px-3 py-1.5 text-sm hover:bg-[var(--surface-2)] ${e.tone ? TONE[e.tone] : ""}`}>
                      <span className="w-12 shrink-0 tabular-nums text-[var(--muted)]">{hm(e.at)}</span>
                      <span className="w-20 shrink-0 text-xs text-[var(--muted)]">{e.area}</span>
                      <span className="font-medium">{e.text}</span>
                      {e.ref && <span className="text-xs text-[var(--muted)]">{e.ref}</span>}
                      {e.note && <span className="text-xs">{e.note}</span>}
                    </Link>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </div>
        <div className="space-y-4">
          <Card title={`끝낸 공정 ${j.steps.length}개`} help={{ kind: "panel", id: "journal.steps" }}>
            {j.steps.length === 0 ? (
              <p className="text-sm text-[var(--muted)]">이날 끝낸 공정이 없습니다.</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {j.steps.map((s, i) => (
                  <li key={i} className="flex justify-between gap-2">
                    <Link href={s.href} className="text-[var(--accent)]">
                      {s.process} · {s.plate || s.woNo}
                    </Link>
                    <span className="tabular-nums">
                      {s.minutes ?? 0}분{s.std ? ` / ${s.std}분` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title={`넘어가는 일 ${j.carry.length}건`} help={{ kind: "panel", id: "journal.carry" }}>
            {j.carry.length === 0 ? (
              <p className="text-sm text-[var(--muted)]">남은 일이 없습니다.</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {j.carry.map((c, i) => (
                  <li key={i}>
                    <Link href={c.href} className="text-[var(--accent)]">
                      {c.text}
                    </Link>
                    <span className="text-xs text-[var(--muted)]">
                      {" "}
                      {c.ref}
                      {c.due ? ` · 예정·기한 ${c.due}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>

      {mine ? <MyEntryPanel e={entry} day={date} plan={plan!} confirmerLabel={confirmerLabel} /> : <OtherEntryPanel e={entry} day={date} userId={target} canReview={canReview} confirmerLabel={confirmerLabel} />}

      {summary && (
        <Card title={`직원별 요약 · ${date}`} help={{ kind: "panel", id: "journal.team" }}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="text-left text-xs text-[var(--muted)]">
                  <th className="py-1 pr-2">직원</th>
                  <th className="pr-2">첫 ~ 마지막 기록</th>
                  <th className="pr-2 text-right">기록</th>
                  <th className="pr-2">영역</th>
                  <th className="pr-2 text-right">공정 · 시간</th>
                  <th className="pr-2">근태</th>
                  <th className="pr-2 text-right">넘어가는 일</th>
                  <th>일지</th>
                </tr>
              </thead>
              <tbody>
                {summary.map((r) => (
                  <tr key={r.id} className={`border-t border-[var(--line)] ${r.id === target ? "bg-[var(--surface-2)]" : ""}`}>
                    <td className="py-1.5 pr-2">
                      <Link href={url(date, r.id)} className="text-[var(--accent)]">
                        {r.name}
                      </Link>
                      <span className="text-xs text-[var(--muted)]"> {r.roles.map((x) => ROLE_LABEL[x]).join("·")}</span>
                    </td>
                    <td className="pr-2 tabular-nums">{r.firstAt ? `${hm(r.firstAt)} ~ ${hm(r.lastAt)}` : "-"}</td>
                    <td className="pr-2 text-right tabular-nums">{r.count}</td>
                    <td className="pr-2 text-xs">{r.areas.map((a) => `${a.area} ${a.count}`).join(" · ")}</td>
                    <td className="pr-2 text-right tabular-nums">{r.steps ? `${r.steps}개 · ${mins(r.workMinutes)}` : "-"}</td>
                    <td className="pr-2">{r.leave.join(", ")}</td>
                    <td className={`pr-2 text-right tabular-nums ${r.carry ? "text-[var(--warn)]" : ""}`}>{r.carry || ""}</td>
                    <td>
                      {statuses.get(r.id) ? <Badge tone={statuses.get(r.id)!.status === "confirmed" ? "ok" : statuses.get(r.id)!.status === "returned" ? "warn" : "neutral"}>{JOURNAL_STATUS[statuses.get(r.id)!.status as JournalStatus]}</Badge> : <span className="text-xs text-[var(--muted)]">안 씀</span>}
                      {statuses.get(r.id)?.safetyOk === false && <Badge tone="danger">안전 있음</Badge>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </>
  );
}
