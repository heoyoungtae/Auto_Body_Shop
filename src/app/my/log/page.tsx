// 내 기록(손님이 적는 차계부): 차 고르기, 오늘 주행거리 짐작·연비·1년 비용, 빠른 기록 단추, 소모품 교체 때, 달마다 비용, 기록 목록(복사·지우기).
// 이 화면의 값은 손님 것이다. 공업사는 주행거리만 참고로 본다
import Link from "next/link";
import { getDb } from "@/db/runtime";
import { myLog } from "@/modules/carbook/records";
import { daysLeft, ENTRY_KIND_LABEL } from "@/modules/carbook/rules";
import { seoulDate } from "@/modules/platform/time";
import { Card, Empty, ErrorBox, Notice, PageTitle } from "../../_ui";
import { deleteEntryAction } from "../actions";
import { requireMy } from "../_session";
import { ConsentCard } from "./consent-card";

const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;
const QUICK = [
  { kind: "fuel", sub: null, label: "주유·충전" },
  { kind: "item", sub: "oil", label: "엔진오일" },
  { kind: "item", sub: "tire", label: "타이어" },
  { kind: "item", sub: "wiper", label: "와이퍼" },
  { kind: "item", sub: "battery", label: "배터리" },
  { kind: "wash", sub: null, label: "세차" },
  { kind: "fee", sub: "insurance", label: "보험" },
  { kind: "other", sub: null, label: "기타 비용" },
] as const;

export default async function MyLogPage({ searchParams }: { searchParams: Promise<{ car?: string; error?: string; saved?: string; deleted?: string }> }) {
  const q = await searchParams;
  const s = await requireMy(true);
  const d = await myLog(await getDb(), s, q.car ?? null);
  const today = seoulDate();
  const carQ = d.car ? `&car=${d.car.id}` : "";
  return (
    <div className="space-y-4 pt-2">
      <PageTitle help="my.log" sub={d.car ? `${d.car.plateNo} ${d.car.name}` : undefined}>
        내 기록
      </PageTitle>
      <ErrorBox message={q.error} />
      {q.saved && <Notice>적었습니다.</Notice>}
      {q.deleted && <Notice>지웠습니다.</Notice>}

      {d.cars.length > 1 && (
        <nav aria-label="차 고르기" className="flex flex-wrap gap-1.5">
          {d.cars.map((c) => (
            <Link key={c.id} href={`/my/log?car=${c.id}`} aria-current={c.id === d.car?.id ? "page" : undefined} className={`rounded-full border px-3 py-1.5 text-sm ${c.id === d.car?.id ? "border-[var(--accent)] bg-[var(--accent-soft)] font-semibold" : "border-[var(--line)]"}`}>
              {c.plateNo}
            </Link>
          ))}
        </nav>
      )}

      {!d.car ? (
        <Empty>내 차가 없습니다. 공업사에 등록된 차가 있어야 기록할 수 있습니다.</Empty>
      ) : !d.consent.agreed ? (
        <ConsentCard back={`/my/log?car=${d.car.id}`} />
      ) : (
        <>
          <Card title="한눈에" help={{ kind: "panel", id: "my.logSummary" }}>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-xs text-[var(--muted)]">오늘 주행거리(짐작)</dt>
                <dd className="text-lg font-semibold tabular-nums">{d.guess ? `${d.guess.km.toLocaleString("ko-KR")}km` : "—"}</dd>
                {d.guess && <dd className="text-xs text-[var(--muted)]">하루 {d.guess.perDay}km{d.guess.measured ? "" : "(기본값)"}</dd>}
              </div>
              <div>
                <dt className="text-xs text-[var(--muted)]">연비(1년)</dt>
                <dd className="text-lg font-semibold tabular-nums">{d.economy ? `${d.economy.value} ${d.economy.unit}` : "—"}</dd>
                {!d.economy && <dd className="text-xs text-[var(--muted)]">주행거리를 적은 주유 두 번이면 나옵니다</dd>}
              </div>
              <div>
                <dt className="text-xs text-[var(--muted)]">이번 달 비용</dt>
                <dd className="text-lg font-semibold tabular-nums">{won(d.months[0]?.total ?? 0)}</dd>
              </div>
              <div>
                <dt className="text-xs text-[var(--muted)]">최근 1년 비용</dt>
                <dd className="text-lg font-semibold tabular-nums">{won(d.yearCost ?? 0)}</dd>
              </div>
            </dl>
            {d.insuranceUntil && <p className="mt-2 text-xs text-[var(--muted)]">보험 만기 {d.insuranceUntil}(남은 {daysLeft(d.insuranceUntil, today)}일)</p>}
          </Card>

          <Card title="적기" help={{ kind: "panel", id: "my.logQuick" }}>
            <ul className="grid grid-cols-4 gap-1.5">
              {QUICK.map((k) => (
                <li key={k.label}>
                  <Link href={`/my/log/new?kind=${k.kind}${k.sub ? `&sub=${k.sub}` : ""}${carQ}`} className="flex min-h-12 items-center justify-center rounded-md border border-[var(--line)] px-1 text-center text-sm hover:bg-[var(--surface-2)]">
                    {k.label}
                  </Link>
                </li>
              ))}
            </ul>
          </Card>

          <Card title="소모품 교체 때" help={{ kind: "panel", id: "my.logItems" }}>
            <ul className="divide-y divide-[var(--line)] text-sm">
              {d.items.map((it) => {
                const left = it.due ? daysLeft(it.due.date, today) : null;
                return (
                  <li key={it.key} className="flex items-center justify-between gap-2 py-2">
                    <span>
                      <span className="font-medium">{it.label}</span>
                      <span className="block text-xs text-[var(--muted)]">{it.last ? `마지막 ${it.last.on}${it.last.mileage != null ? ` · ${it.last.mileage.toLocaleString("ko-KR")}km` : ""}` : "기록 없음"}</span>
                    </span>
                    {it.due ? (
                      <span className={`text-right text-xs ${left! <= 14 ? "font-semibold text-[var(--warn)]" : "text-[var(--muted)]"}`}>
                        {left! < 0 ? `${-left!}일 지남` : `${it.due.date}쯤`}
                        {it.due.km && <span className="block">약 {it.due.km.toLocaleString("ko-KR")}km</span>}
                      </span>
                    ) : (
                      <Link href={`/my/log/new?kind=item&sub=${it.key}${carQ}`} className="text-xs text-[var(--accent)] underline">
                        적기
                      </Link>
                    )}
                  </li>
                );
              })}
            </ul>
          </Card>

          {d.months.some((m) => m.total > 0) && (
            <Card title="달마다 비용" help={{ kind: "panel", id: "my.logMonths" }}>
              <MonthBars months={d.months} />
            </Card>
          )}

          <Card title={`기록 ${d.total ?? 0}`} help={{ kind: "panel", id: "my.logList" }}>
            {d.entries.length === 0 ? (
              <p className="text-sm text-[var(--muted)]">아직 적은 기록이 없습니다. 위 단추로 첫 기록을 적어 보세요.</p>
            ) : (
              <ul className="divide-y divide-[var(--line)]">
                {d.entries.map((e) => (
                  <li key={e.id} className="py-2 text-sm">
                    <div className="flex items-baseline justify-between gap-2">
                      <span>
                        <span className="text-xs text-[var(--muted)]">{e.on}</span> <span className="font-medium">{e.label}</span>
                        {e.kind === "wash" || e.kind === "other" ? null : <span className="text-xs text-[var(--muted)]"> · {ENTRY_KIND_LABEL[e.kind]}</span>}
                      </span>
                      <span className="tabular-nums">{e.amountWon != null ? won(e.amountWon) : ""}</span>
                    </div>
                    <p className="text-xs text-[var(--muted)]">
                      {[e.mileage != null && `${e.mileage.toLocaleString("ko-KR")}km`, e.qty != null && `${e.qty}${e.qtyUnit ?? ""}`, e.unitPrice != null && `${e.unitPrice.toLocaleString("ko-KR")}원/${e.qtyUnit ?? ""}`, e.place, e.memo].filter(Boolean).join(" · ")}
                    </p>
                    <div className="mt-1 flex gap-3 text-xs">
                      <Link href={`/my/log/new?copy=${e.id}`} className="text-[var(--accent)] underline">
                        같은 내용으로 새로 적기
                      </Link>
                      <form action={deleteEntryAction}>
                        <input type="hidden" name="id" value={e.id} />
                        <input type="hidden" name="car" value={d.car!.id} />
                        <button type="submit" className="text-[var(--danger)] underline">
                          지우기
                        </button>
                      </form>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

/** 달마다 비용 막대(최근 6달, 오래된 달이 왼쪽). 숫자는 막대 위에 */
function MonthBars({ months }: { months: { month: string; total: number }[] }) {
  const list = [...months].reverse();
  const max = Math.max(1, ...list.map((m) => m.total));
  return (
    <figure>
      <ul className="flex h-36 items-end gap-2" aria-label="최근 6달 비용">
        {list.map((m) => (
          <li key={m.month} className="flex flex-1 flex-col items-center justify-end gap-1">
            <span className="text-[10px] tabular-nums text-[var(--muted)]">{m.total ? `${Math.round(m.total / 1000).toLocaleString("ko-KR")}천` : ""}</span>
            <span className="w-full max-w-10 rounded-t-sm bg-[var(--accent)]" style={{ height: `${Math.max(m.total ? 4 : 0, (m.total / max) * 96)}px` }} />
            <span className="text-xs text-[var(--muted)]">{Number(m.month.slice(5))}월</span>
          </li>
        ))}
      </ul>
      <figcaption className="sr-only">{list.map((m) => `${m.month} ${m.total.toLocaleString("ko-KR")}원`).join(", ")}</figcaption>
    </figure>
  );
}
