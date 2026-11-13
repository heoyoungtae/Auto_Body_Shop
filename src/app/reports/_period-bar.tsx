// 보고서 기간 고르기: 일·주·월·분기·반기·연, ◀ 앞 / 뒤 ▶, 날짜로 옮기기, 시작~끝 직접 지정, 비교 기준(앞 기간·작년 같은 기간)
import Link from "next/link";
import { COMPARE, type CompareKind, PERIOD_KINDS, type Period, type PeriodKind } from "@/modules/report/period";
import { DateField } from "../_input";
import { Badge, Button, buttonClass, Card } from "../_ui";

export function periodHref(base: string, p: { kind: string; from: string; to: string }, cmp: CompareKind, at?: string) {
  const c = cmp === "prev" ? "" : `&c=${cmp}`;
  return p.kind === "custom" ? `${base}?k=custom&from=${p.from}&to=${p.to}${c}` : `${base}?k=${p.kind}&at=${at ?? p.from}${c}`;
}

export function PeriodBar({ base, p, q, cmp, today }: { base: string; p: Period; q: Period; cmp: CompareKind; today: string }) {
  const running = p.to >= today && p.from <= today;
  const kindHref = (k: PeriodKind) => periodHref(base, { kind: k, from: p.kind === "custom" ? p.to : p.from, to: p.to }, cmp, p.kind === "custom" ? p.to : running ? today : p.from);
  const move = (d: string) => (p.kind === "custom" ? null : periodHref(base, { kind: p.kind, from: d, to: d }, cmp, d));
  return (
    <Card title="기간" help={{ kind: "panel", id: "rep.period" }}>
      <div className="no-print mb-3 flex flex-wrap gap-1">
        {(Object.keys(PERIOD_KINDS) as PeriodKind[]).map((k) => (
          <Link key={k} href={kindHref(k)} className={buttonClass(k === p.kind ? "primary" : "secondary")} aria-current={k === p.kind ? "page" : undefined}>
            {PERIOD_KINDS[k]}
          </Link>
        ))}
        {p.kind === "custom" && <span className={buttonClass("primary")}>직접 지정</span>}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {move(p.prev) && (
          <Link href={move(p.prev)!} className={`no-print ${buttonClass("secondary")}`}>
            ◀ 앞
          </Link>
        )}
        <b className="text-lg">{p.label}</b>
        {move(p.next) && p.next <= today && (
          <Link href={move(p.next)!} className={`no-print ${buttonClass("secondary")}`}>
            뒤 ▶
          </Link>
        )}
        {!running && p.kind !== "custom" && (
          <Link href={periodHref(base, { kind: p.kind, from: today, to: today }, cmp, today)} className={`no-print ${buttonClass("secondary")}`}>
            이번 {PERIOD_KINDS[p.kind]}
          </Link>
        )}
        {running && <Badge tone="warn">진행 중 · 오늘까지 집계</Badge>}
      </div>
      <p className="mt-1 text-xs text-[var(--muted)]">
        {p.from} ~ {p.to} ({p.days}일) · 비교: {COMPARE[cmp]} {q.label}
      </p>
      <div className="no-print mt-2 flex flex-wrap items-center gap-1 text-sm">
        <span className="text-xs text-[var(--muted)]">비교 기준</span>
        {(Object.keys(COMPARE) as CompareKind[]).map((c) => (
          <Link key={c} href={periodHref(base, p, c, p.from)} className={buttonClass(c === cmp ? "primary" : "secondary")} aria-current={c === cmp ? "true" : undefined}>
            {COMPARE[c]}
          </Link>
        ))}
      </div>
      <div className="no-print mt-3 flex flex-wrap items-end gap-4">
        {p.kind !== "custom" && (
          <form method="get" action={base} className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="k" value={p.kind} />
            {cmp !== "prev" && <input type="hidden" name="c" value={cmp} />}
            <DateField help="rep.at" name="at" defaultValue={p.from} quick={["today"]} />
            <Button type="submit" variant="secondary">
              이 날이 든 {PERIOD_KINDS[p.kind]} 보기
            </Button>
          </form>
        )}
        <form method="get" action={base} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="k" value="custom" />
          {cmp !== "prev" && <input type="hidden" name="c" value={cmp} />}
          <DateField help="rep.from" name="from" defaultValue={p.from} quick={["today"]} />
          <DateField help="rep.to" name="to" defaultValue={p.to} quick={["today"]} />
          <Button type="submit" variant="secondary">
            시작~끝 직접 지정
          </Button>
        </form>
      </div>
    </Card>
  );
}
