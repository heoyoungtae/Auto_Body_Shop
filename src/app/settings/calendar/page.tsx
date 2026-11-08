import { getDb } from "@/db/runtime";
import { addBusinessDays, closedReason, DAY_KIND_LABEL, HOLIDAY_DATA_LAST_YEAR, KR_PUBLIC_HOLIDAYS, WEEKDAYS, type DayKind } from "@/modules/platform/business-days";
import { calendarMeta, listShopDays, loadShopCalendar } from "@/modules/platform/calendar";
import { addDays, seoulDate } from "@/modules/platform/time";
import { AssistForm } from "../../_assist";
import { CheckGroup, DateField, SelectField, TextField } from "../../_input";
import { SubmitButton } from "../../_submit";
import { requireUser } from "../../_lib/session";
import { Badge, Card, ErrorBox, fmtTime, Notice, PageTitle } from "../../_ui";
import { addShopDayAction, removeShopDayAction, saveCalendarRulesAction } from "./actions";

const md = (iso: string) => `${Number(iso.slice(5, 7))}/${Number(iso.slice(8))}(${WEEKDAYS[new Date(`${iso}T00:00:00Z`).getUTCDay()]})`;

export default async function CalendarSettingsPage({ searchParams }: { searchParams: Promise<{ error?: string; notice?: string }> }) {
  const { error, notice } = await searchParams;
  const user = await requireUser();
  const owner = user.roles.includes("owner");
  const db = await getDb();
  const [cal, meta, days] = await Promise.all([loadShopCalendar(db), calendarMeta(db), listShopDays(db, addDays(seoulDate(), -30))]);
  const today = seoulDate();
  const year = Number(today.slice(0, 4));
  const holidays = Object.entries(KR_PUBLIC_HOLIDAYS).filter(([d]) => d >= today);
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
        {year >= HOLIDAY_DATA_LAST_YEAR && (
          <p className="rounded-md border border-[var(--warn)] bg-[var(--warn-soft)] px-3 py-2 text-sm">
            앱에 들어 있는 공휴일은 {HOLIDAY_DATA_LAST_YEAR}년까지입니다. 정부가 {HOLIDAY_DATA_LAST_YEAR + 1}년 공휴일을 발표하면 아래 &lsquo;날 넣기&rsquo;에서 &lsquo;공휴일 추가&rsquo;로 넣거나 개발 담당에게 목록 갱신을 요청하세요.
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
        <Card title={`다가오는 법정 공휴일(~${HOLIDAY_DATA_LAST_YEAR}년)`} help={{ kind: "panel", id: "calendar.holidays" }}>
          <ul className="text-sm">
            {holidays.map(([d, name]) => {
              const off = closedReason(cal, d);
              return (
                <li key={d} className={`flex justify-between gap-2 py-1 ${d < today ? "text-[var(--muted)]" : ""}`}>
                  <span>
                    {d.slice(0, 4)}. {md(d)} {name}
                  </span>
                  <span className="shrink-0 text-xs">{off ? "쉼" : <span className="text-[var(--ok)]">영업</span>}</span>
                </li>
              );
            })}
          </ul>
        </Card>
      </div>
    </>
  );
}
