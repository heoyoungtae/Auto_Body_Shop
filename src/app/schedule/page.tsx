import Link from "next/link";
import { getDb } from "@/db/runtime";
import { addDays, seoulDate } from "@/modules/platform/time";
import { AUTO_KINDS, LAYERS, monthGrid, shiftMonth, timeLabel, weekOf, WEEKDAY, type Layer } from "@/modules/schedule/rules";
import { canPostShop, itemsOn, listRange, type CalItem } from "@/modules/schedule/service";
import { requireUser } from "../_lib/session";
import { CellItems, FillHeight } from "./fill";
import { Badge, buttonClass, Card, Empty, Notice, PageTitle } from "../_ui";

type View = "month" | "week" | "list";
const ALL: Layer[] = ["shop", "mine", "auto"];
const chip: Record<string, string> = {
  accent: "border-l-[var(--accent)] bg-[var(--accent-soft)]",
  ok: "border-l-[var(--ok)] bg-[var(--ok-soft)]",
  warn: "border-l-[var(--warn)] bg-[var(--warn-soft)]",
  danger: "border-l-[var(--danger)] bg-[var(--danger-soft)]",
  neutral: "border-l-[var(--line-strong)] bg-[var(--surface-2)]",
};

/** 일정표: 사내 공용·내 일정·자동 일정을 한 달력에(월·주·목록) */
export default async function SchedulePage({ searchParams }: { searchParams: Promise<{ m?: string; d?: string; v?: string; l?: string; notice?: string }> }) {
  const q = await searchParams;
  const user = await requireUser();
  const db = await getDb();
  const today = seoulDate();
  const day = /^\d{4}-\d{2}-\d{2}$/.test(q.d ?? "") ? q.d! : today;
  const ym = /^\d{4}-\d{2}$/.test(q.m ?? "") ? q.m! : day.slice(0, 7);
  const view: View = q.v === "week" || q.v === "list" ? q.v : "month";
  const layers = q.l ? (q.l.split(",").filter((x) => x in LAYERS) as Layer[]) : ALL;

  const grid = monthGrid(ym);
  const week = weekOf(day);
  const from = view === "week" ? week[0] : grid[0][0];
  const to = view === "week" ? week[6] : grid[grid.length - 1][6];
  const items = layers.length ? await listRange(db, user, from, to, layers) : [];
  const dayItems = itemsOn(items, day);
  const shop = canPostShop(user);

  const url = (p: { m?: string; d?: string; v?: View; l?: Layer[] }) => {
    const s = new URLSearchParams();
    const l = p.l ?? layers;
    s.set("m", p.m ?? ym);
    s.set("d", p.d ?? day);
    s.set("v", p.v ?? view);
    if (l.length !== ALL.length) s.set("l", l.join(","));
    return `/schedule?${s.toString()}`;
  };
  const toggle = (k: Layer) => (layers.includes(k) ? layers.filter((x) => x !== k) : [...layers, k]);
  const prev = view === "week" ? { d: addDays(day, -7), m: addDays(day, -7).slice(0, 7) } : { m: shiftMonth(ym, -1), d: `${shiftMonth(ym, -1)}-01` };
  const next = view === "week" ? { d: addDays(day, 7), m: addDays(day, 7).slice(0, 7) } : { m: shiftMonth(ym, 1), d: `${shiftMonth(ym, 1)}-01` };
  const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8))}`;
  const holiday = (d: string) => items.some((i) => i.kind === "holiday" && i.date === d && i.tone === "danger");
  const dayColor = (d: string, i: number) => (i === 0 || holiday(d) ? "text-[var(--danger)]" : i === 6 ? "text-[var(--accent)]" : "");

  const Chip = ({ it }: { it: CalItem }) => {
    const body = (
      <span className={`block truncate rounded-sm border-l-4 px-1 py-0.5 text-xs ${chip[it.tone]} ${it.layer === "shop" && !it.forMe ? "opacity-60" : ""}`} title={`${it.kindLabel} · ${timeLabel(it.startTime, it.endTime)} · ${it.title}`}>
        {it.startTime && <span className="mr-0.5 tabular-nums">{it.startTime}</span>}
        {it.title}
      </span>
    );
    return it.href ? (
      <Link href={it.href} className="block min-w-0">
        {body}
      </Link>
    ) : (
      body
    );
  };

  return (
    <>
      <PageTitle
        help="schedule"
        sub="사내 공용 일정은 모든 직원이, 개인 일정은 본인만 봅니다. 입고 예약·출고 약속·휴가·점검 기한 같은 자동 일정은 각 화면 기록에서 저절로 올라옵니다."
        actions={
          <div className="flex flex-wrap gap-1.5">
            {shop && (
              <Link href={`/schedule/new?scope=shop&date=${day}`} className={buttonClass()}>
                공용 일정 올리기
              </Link>
            )}
            <Link href={`/schedule/new?scope=personal&date=${day}`} className={buttonClass(shop ? "secondary" : "primary")}>
              개인 일정 올리기
            </Link>
          </div>
        }
      >
        일정표
      </PageTitle>
      {q.notice && <Notice>{q.notice}</Notice>}

      <div className="grid gap-4 xl:grid-cols-[1fr_22rem]">
        <Card title={view === "week" ? `${md(week[0])} ~ ${md(week[6])} 주간` : `${ym.slice(0, 4)}년 ${Number(ym.slice(5))}월`} help={{ kind: "panel", id: "schedule.calendar" }}>
          <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
            <div className="flex gap-1">
              <Link href={url(prev)} className={buttonClass("secondary")} aria-label="이전">
                ◀
              </Link>
              <Link href={url({ m: today.slice(0, 7), d: today })} className={buttonClass("secondary")}>
                오늘
              </Link>
              <Link href={url(next)} className={buttonClass("secondary")} aria-label="다음">
                ▶
              </Link>
            </div>
            <div className="flex gap-1">
              {(
                [
                  ["month", "월"],
                  ["week", "주"],
                  ["list", "목록"],
                ] as [View, string][]
              ).map(([k, label]) => (
                <Link key={k} href={url({ v: k })} className={`rounded-full border px-3 py-1 ${view === k ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]" : "border-[var(--line)]"}`}>
                  {label}
                </Link>
              ))}
            </div>
            <div className="flex flex-wrap gap-1" role="group" aria-label="보일 일정">
              {ALL.map((k) => (
                <Link key={k} href={url({ l: toggle(k) })} aria-pressed={layers.includes(k)} className={`rounded-full border px-3 py-1 ${layers.includes(k) ? "border-[var(--accent)] font-semibold" : "border-[var(--line)] text-[var(--muted)] line-through"}`}>
                  {LAYERS[k]}
                </Link>
              ))}
            </div>
          </div>

          {!layers.length ? (
            <Empty>보일 일정을 하나 이상 켜 주세요(사내 공용·내 일정·자동 일정).</Empty>
          ) : view === "list" ? (
            (() => {
              const days = [...new Set(items.flatMap((i) => (i.date.slice(0, 7) === ym || i.endDate.slice(0, 7) === ym ? [i.date < `${ym}-01` ? `${ym}-01` : i.date] : [])))].sort();
              return days.length ? (
                <ul className="divide-y divide-[var(--line)] text-sm">
                  {days.map((d) => (
                    <li key={d} className="flex gap-3 py-2">
                      <Link href={url({ d, v: "month" })} className={`w-16 shrink-0 font-semibold ${dayColor(d, new Date(`${d}T00:00:00Z`).getUTCDay())} ${d === today ? "underline" : ""}`}>
                        {md(d)}({WEEKDAY[new Date(`${d}T00:00:00Z`).getUTCDay()]})
                      </Link>
                      <ul className="grid flex-1 gap-1">
                        {itemsOn(items, d).map((it) => (
                          <ItemRow key={it.key} it={it} />
                        ))}
                      </ul>
                    </li>
                  ))}
                </ul>
              ) : (
                <Empty>이달에는 일정이 없습니다.</Empty>
              );
            })()
          ) : (
            <div className="overflow-x-auto">
              <FillHeight className="flex min-w-[42rem] flex-col text-sm">
                <div className="grid grid-cols-7">
                  {WEEKDAY.map((w, i) => (
                    <div key={w} className={`py-1 text-center text-xs font-medium ${i === 0 ? "text-[var(--danger)]" : i === 6 ? "text-[var(--accent)]" : "text-[var(--muted)]"}`}>
                      {w}
                    </div>
                  ))}
                </div>
                <div className="grid min-h-0 flex-1 grid-cols-7 border-t border-l border-[var(--line)]" style={{ gridTemplateRows: `repeat(${view === "week" ? 1 : grid.length}, minmax(5.5rem, 1fr))` }}>
                  {(view === "week" ? [week] : grid).flat().map((d) => {
                    const i = new Date(`${d}T00:00:00Z`).getUTCDay();
                    const list = itemsOn(items, d);
                    return (
                      <div key={d} className={`flex min-h-0 min-w-0 flex-col border-r border-b border-[var(--line)] p-1 ${d === day ? "ring-2 ring-[var(--accent)] ring-inset" : ""} ${view === "month" && d.slice(0, 7) !== ym ? "bg-[var(--surface-2)] opacity-60" : ""}`}>
                        <Link href={url({ d, m: d.slice(0, 7) })} className={`mb-0.5 flex items-center justify-between text-xs ${dayColor(d, i)}`}>
                          <span className={d === today ? "rounded-full bg-[var(--accent)] px-1.5 font-bold text-white" : "font-semibold"}>{view === "week" ? md(d) : Number(d.slice(8))}</span>
                          {list.length > 0 && <span className="text-[var(--muted)]">{list.length}건</span>}
                        </Link>
                        <CellItems more={url({ d, m: d.slice(0, 7) })}>
                          {list.map((it) => (
                            <Chip key={it.key} it={it} />
                          ))}
                        </CellItems>
                      </div>
                    );
                  })}
                </div>
              </FillHeight>
            </div>
          )}
          <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-[var(--muted)]">
            <span>
              <i className="mr-1 inline-block size-2.5 rounded-sm bg-[var(--accent)]" />
              사내 공용
            </span>
            <span>
              <i className="mr-1 inline-block size-2.5 rounded-sm bg-[var(--ok)]" />내 일정
            </span>
            <span>
              <i className="mr-1 inline-block size-2.5 rounded-sm bg-[var(--line-strong)]" />
              자동 일정
            </span>
            <span>
              <i className="mr-1 inline-block size-2.5 rounded-sm bg-[var(--danger)]" />
              휴무·공휴일
            </span>
            <span>흐린 공용 일정은 내가 참석자가 아닌 것</span>
          </p>
        </Card>

        <Card
          title={`${md(day)}(${WEEKDAY[new Date(`${day}T00:00:00Z`).getUTCDay()]})${day === today ? " 오늘" : ""}`}
          help={{ kind: "panel", id: "schedule.day" }}
          actions={
            <div className="flex gap-1 text-xs">
              {shop && (
                <Link href={`/schedule/new?scope=shop&date=${day}`} className="text-[var(--accent)]">
                  + 공용
                </Link>
              )}
              <Link href={`/schedule/new?scope=personal&date=${day}`} className="text-[var(--accent)]">
                + 개인
              </Link>
            </div>
          }
        >
          {dayItems.length ? (
            <ul className="grid gap-1.5 text-sm">
              {dayItems.map((it) => (
                <ItemRow key={it.key} it={it} />
              ))}
            </ul>
          ) : (
            <Empty>이날은 일정이 없습니다. 위 '+ 개인'으로 내 일정을 올릴 수 있습니다.</Empty>
          )}
          <p className="mt-3 text-xs text-[var(--muted)]">자동 일정: {Object.values(AUTO_KINDS).join(" · ")}. 내 역할로 볼 수 있는 것만 나옵니다.</p>
        </Card>
      </div>
    </>
  );
}

function ItemRow({ it }: { it: CalItem }) {
  const inner = (
    <span className="flex flex-wrap items-center gap-1.5">
      <Badge tone={it.tone}>{it.layer === "auto" ? it.kindLabel : `${LAYERS[it.layer]} · ${it.kindLabel}`}</Badge>
      <span className="text-xs tabular-nums text-[var(--muted)]">{timeLabel(it.startTime, it.endTime)}</span>
      <span className={it.layer === "shop" && !it.forMe ? "text-[var(--muted)]" : "font-medium"}>{it.title}</span>
      {it.endDate !== it.date && <span className="text-xs text-[var(--muted)]">~{Number(it.endDate.slice(5, 7))}/{Number(it.endDate.slice(8))}</span>}
      {it.place && <span className="text-xs text-[var(--muted)]">· {it.place}</span>}
    </span>
  );
  return <li>{it.href ? <Link href={it.href} className="block rounded px-1 py-0.5 hover:bg-[var(--surface-2)]">{inner}</Link> : <div className="px-1 py-0.5">{inner}</div>}</li>;
}
