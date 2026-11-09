import { can } from "@/modules/auth/permissions";
import { getDb } from "@/db/runtime";
import { addBusinessDays, closedReason, holidayList, DAY_KIND_LABEL, HOLIDAY_DATA_LAST_YEAR, KR_PUBLIC_HOLIDAYS, WEEKDAYS, type DayKind } from "@/modules/platform/business-days";
import { calendarMeta, listShopDays, loadShopCalendar } from "@/modules/platform/calendar";
import { HOLIDAY_API_GUIDE, holidaySyncStatus, holidayTodo } from "@/modules/platform/holidays";
import { addDays, seoulDate } from "@/modules/platform/time";
import { AssistForm } from "../../_assist";
import { CheckGroup, DateField, SelectField, TextField } from "../../_input";
import { SubmitButton } from "../../_submit";
import { requireUser } from "../../_lib/session";
import { Badge, Card, ErrorBox, fmtTime, Notice, PageTitle } from "../../_ui";
import { addShopDayAction, removeShopDayAction, saveCalendarRulesAction, saveHolidayKeyAction, syncHolidaysAction } from "./actions";

const md = (iso: string) => `${Number(iso.slice(5, 7))}/${Number(iso.slice(8))}(${WEEKDAYS[new Date(`${iso}T00:00:00Z`).getUTCDay()]})`;

export default async function CalendarSettingsPage({ searchParams }: { searchParams: Promise<{ error?: string; notice?: string }> }) {
  const { error, notice } = await searchParams;
  const user = await requireUser();
  const owner = can(user, "settings.edit");
  const db = await getDb();
  const today = seoulDate();
  const [cal, meta, days, sync, hol] = await Promise.all([loadShopCalendar(db), calendarMeta(db), listShopDays(db, addDays(today, -30)), holidaySyncStatus(db), holidayTodo(db, today)]);
  // 법정 공휴일(받은 해는 특일 정보, 못 받은 해는 앱 예비 목록) + 직접 넣은 공휴일
  const pub = holidayList(cal, today, `${Number(today.slice(0, 4)) + 2}-12-31`);
  const holidays = [
    ...pub.map((h) => ({ d: h.date, name: h.name, src: h.src === "official" ? ("api" as const) : ("base" as const) })),
    ...days.filter((x) => x.kind === "holiday" && x.date >= today && !pub.some((h) => h.date === x.date)).map((x) => ({ d: x.date, name: x.name, src: "hand" as const })),
  ].sort((a, b) => a.d.localeCompare(b.d));
  const next = [1, 3].map((n) => ({ n, date: addBusinessDays(today, n, cal) }));
  return (
    <>
      <PageTitle help="settings.calendar" sub="회신 기한·보증 판정 같은 '영업일' 기한과 입고 예약 달력이 이 설정을 따릅니다.">
        영업일·휴무일
      </PageTitle>
      <div className="mb-4 space-y-2">
        <ErrorBox message={error} />
        {notice && <Notice>{notice}</Notice>}
        <p className="text-sm">
          지금: <b>{cal.workdays.map((d) => WEEKDAYS[d]).join("·")}</b> 영업, 공휴일 {cal.excludeHolidays ? <Badge tone="accent">쉼(영업일에서 뺌)</Badge> : <Badge>영업(영업일로 셈)</Badge>}
          <span className="ml-2 text-[var(--muted)]">
            오늘 기준 영업일 1일 뒤 {md(next[0].date)}, 3일 뒤 {md(next[1].date)}
          </span>
          {meta.updatedAt && <span className="ml-2 text-xs text-[var(--muted)]">마지막 저장 {fmtTime(meta.updatedAt)}</span>}
        </p>
        {hol && (
          <p className="rounded-md border border-[var(--warn)] bg-[var(--warn-soft)] px-3 py-2 text-sm">
            {hol.next}년 공휴일이 아직 없습니다. 오른쪽 &lsquo;공휴일 자동 갱신&rsquo;에서 가져오거나, 아래 &lsquo;날 넣기&rsquo;에서 &lsquo;공휴일 추가&rsquo;로 넣어 주세요.
          </p>
        )}
      </div>
      <div className="grid gap-4 xl:grid-cols-3 xl:items-start">
        <div className="space-y-4 xl:col-span-2">
          <Card title="영업 규칙" help={{ kind: "panel", id: "calendar.rules" }}>
            {owner ? (
              <AssistForm id="calendar-rules" action={saveCalendarRulesAction} className="space-y-4">
                <CheckGroup help="cal.workdays" name="workdays" options={WEEKDAYS.map((w, i) => ({ value: String(i), label: w }))} defaultChecked={cal.workdays.map(String)} />
                <SelectField
                  help="cal.excludeHolidays"
                  name="excludeHolidays"
                  defaultValue={cal.excludeHolidays ? "yes" : "no"}
                  options={[
                    { value: "yes", label: "공휴일에 쉼 — 영업일에서 뺌" },
                    { value: "no", label: "공휴일에도 영업 — 영업일로 셈" },
                  ]}
                />
                <SubmitButton>저장</SubmitButton>
              </AssistForm>
            ) : (
              <p className="text-sm text-[var(--muted)]">바꾸기는 대표만 할 수 있습니다.</p>
            )}
          </Card>
          <Card title="가게 휴무·특별 영업일" help={{ kind: "panel", id: "calendar.days" }}>
            <div className="space-y-4">
              {owner && (
                <AssistForm id="calendar-day" action={addShopDayAction} className="grid gap-3 md:grid-cols-[12rem_16rem_1fr_auto] md:items-end">
                  <DateField help="cal.day.date" name="date" required min={today} quick={["today", "tomorrow", "week"]} />
                  <SelectField
                    help="cal.day.kind"
                    name="kind"
                    defaultValue="closed"
                    options={(Object.keys(DAY_KIND_LABEL) as DayKind[]).map((k) => ({ value: k, label: DAY_KIND_LABEL[k] }))}
                  />
                  <TextField help="cal.day.name" name="name" suggestions={["여름 휴가", "설 연휴 연장", "추석 연휴 연장", "임시공휴일", "설비 점검", "토요일 특근"].map((value) => ({ value }))} />
                  <SubmitButton variant="secondary">넣기</SubmitButton>
                </AssistForm>
              )}
              {days.length === 0 ? (
                <p className="text-sm text-[var(--muted)]">넣은 날이 없습니다.</p>
              ) : (
                <ul className="divide-y divide-[var(--line)] text-sm">
                  {days.map((d) => (
                    <li key={d.date} className="flex flex-wrap items-center justify-between gap-2 py-2">
                      <span>
                        <b className={d.date < today ? "text-[var(--muted)]" : ""}>{d.date}</b> {md(d.date).slice(-3)} <Badge tone={d.kind === "open" ? "ok" : d.kind === "closed" ? "warn" : "accent"}>{DAY_KIND_LABEL[d.kind as DayKind].split("(")[0]}</Badge> {d.name}
                      </span>
                      {owner && (
                        <form action={removeShopDayAction}>
                          <input type="hidden" name="date" value={d.date} />
                          <SubmitButton variant="secondary">지우기</SubmitButton>
                        </form>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Card>
        </div>
        <div className="space-y-4">
        <Card title="공휴일 자동 갱신" help={{ kind: "panel", id: "calendar.sync" }}>
          <div className="space-y-3 text-sm">
            <p>
              매달 1일(9월부터 내년 공휴일이 없으면 매일) 공공데이터포털 &lsquo;특일 정보&rsquo;에서 올해·내년 공휴일을 가져와, 빠진 날(임시공휴일·선거일 포함)을 &lsquo;공휴일 추가&rsquo;로 넣습니다. 직접 넣은 날은 바꾸지 않습니다.
            </p>
            <p>
              인증키 {sync.hasKey ? <Badge tone="ok">저장됨</Badge> : <Badge tone="warn">없음</Badge>}
              {sync.lastAt && (
                <span className="ml-2 text-xs text-[var(--muted)]">
                  마지막 {fmtTime(sync.lastAt)} · {sync.lastMessage}
                </span>
              )}
            </p>
            {owner && (
              <>
                <AssistForm id="holiday-key" action={saveHolidayKeyAction} className="space-y-2">
                  <TextField help="cal.apiKey" name="apiKey" type="password" autoComplete="off" required={!sync.hasKey} />
                  <div className="flex flex-wrap gap-2">
                    <SubmitButton name="intent" value="save">{sync.hasKey ? "인증키 바꾸기" : "인증키 저장"}</SubmitButton>
                    {sync.hasKey && (
                      <SubmitButton name="intent" value="clear" variant="secondary" noValidate>
                        인증키 지우기
                      </SubmitButton>
                    )}
                  </div>
                </AssistForm>
                {sync.hasKey && (
                  <form action={syncHolidaysAction}>
                    <SubmitButton variant="secondary">지금 가져오기</SubmitButton>
                  </form>
                )}
                <p className="text-xs text-[var(--muted)]">
                  인증키 받는 곳:{" "}
                  <a href={HOLIDAY_API_GUIDE} target="_blank" rel="noreferrer" className="text-[var(--accent)] underline">
                    공공데이터포털 &lsquo;한국천문연구원 특일 정보&rsquo;
                  </a>{" "}
                  → 로그인 → 활용신청(자동 승인) → 마이페이지의 일반 인증키(Decoding)를 복사해 넣습니다.
                </p>
              </>
            )}
          </div>
        </Card>
        <Card title="다가오는 공휴일" help={{ kind: "panel", id: "calendar.holidays" }}>
          <ul className="text-sm">
            {holidays.map(({ d, name, src }) => {
              const off = closedReason(cal, d);
              return (
                <li key={d} className="flex justify-between gap-2 py-1">
                  <span>
                    {d.slice(0, 4)}. {md(d)} {name} {src === "api" && <Badge tone="ok">특일 정보</Badge>}
                    {src === "base" && <Badge tone="warn">예비 목록</Badge>}
                    {src === "hand" && <Badge>직접 넣음</Badge>}
                  </span>
                  <span className="shrink-0 text-xs">{off ? "쉼" : <span className="text-[var(--ok)]">영업</span>}</span>
                </li>
              );
            })}
          </ul>
          <p className="mt-2 text-xs text-[var(--muted)]">특일 정보: 공공데이터포털에서 받은 그 해 공휴일(정답). 예비 목록: 그 해 자료를 아직 못 받아 앱에 들어 있는 목록(~{HOLIDAY_DATA_LAST_YEAR}년)을 임시로 씀.</p>
        </Card>
        </div>
      </div>
    </>
  );
}
