// 목록 공통 조회줄(보고서 센터 2단계): 기간(전체·오늘·이번 주·이번 달·지난 달·올해·직접 지정)·기준 날짜·찾기, 건수·합계, 엑셀·인쇄, 쪽 넘김.
// 목록 화면은 상태 탭 아래에 <ListBar r={…} /> 를, 목록 끝에 <ListPager r={…} /> 를 둔다. 계산은 src/modules/listq/core.ts.
import Link from "next/link";
import type { ListResult, Preset } from "@/modules/listq/core";
import { PRESETS } from "@/modules/listq/core";
import { DateField, SelectField } from "./_input";
import { Button, buttonClass, Card } from "./_ui";
import { PrintButton } from "./reports/print-button";

const fmt = (v: number, unit?: string) => `${(unit === "원" || unit === "건" || unit === "개" || unit === "명" ? Math.round(v) : Math.round(v * 10) / 10).toLocaleString("ko-KR")}${unit ?? ""}`;

/** 숨은 칸으로 지금 조건을 넘김(바꿀 칸은 빼고) */
function Hidden({ qs, omit }: { qs: string; omit: string[] }) {
  const p = new URLSearchParams(qs.replace(/^\?/, ""));
  return (
    <>
      {[...p.entries()]
        .filter(([k]) => !omit.includes(k))
        .map(([k, v]) => (
          <input key={k} type="hidden" name={k} value={v} />
        ))}
    </>
  );
}

export function ListBar<R>({ r, unitLabel = "건" }: { r: ListResult<R>; unitLabel?: string }) {
  const { def, lq } = r;
  const base = def.href.split("?")[0];
  const dt = def.dates.find((d) => d.key === lq.dateKey);
  const csv = `/lists/${def.key}/csv${r.qs()}`;
  const filtered = lq.from || lq.to || lq.s;
  return (
    <Card title="조회" help={{ kind: "panel", id: "list.bar" }}>
      <div className="no-print flex flex-wrap items-center gap-1">
        {(Object.keys(PRESETS) as Preset[])
          .filter((k) => k !== "custom" && (def.dates.length > 0 || k === "all"))
          .map((k) => (
            <Link key={k} href={`${base}${r.qs({ p: k === (def.preset ?? "all") ? null : k, from: null, to: null })}`} className={buttonClass(k === lq.preset ? "primary" : "secondary")} aria-current={k === lq.preset ? "true" : undefined}>
              {PRESETS[k]}
            </Link>
          ))}
        {lq.preset === "custom" && <span className={buttonClass("primary")}>직접 지정</span>}
        <form method="get" action={base} className="ml-auto flex items-center gap-1" role="search">
          <Hidden qs={r.qs()} omit={["s"]} />
          <input type="search" name="s" defaultValue={lq.s} placeholder="찾기(번호·이름·차량·업체 등)" aria-label={`${def.title} 찾기`} className="h-11 w-56 max-w-full rounded-md border border-[var(--line-strong)] bg-[var(--surface)] px-3 text-sm" />
          <Button type="submit" variant="secondary">
            찾기
          </Button>
        </form>
      </div>
      {def.dates.length > 0 && (
        <details className="no-print mt-2" open={lq.preset === "custom"}>
          <summary className="cursor-pointer text-sm text-[var(--accent)]">기간 직접 지정{def.dates.length > 1 ? " · 기준 날짜 바꾸기" : ""}</summary>
          <div className="mt-2 flex flex-wrap items-end gap-4">
            {def.dates.length > 1 && (
              <form method="get" action={base} className="flex flex-wrap items-end gap-2">
                <Hidden qs={r.qs()} omit={["d"]} />
                <SelectField help="list.date" name="d" defaultValue={lq.dateKey} options={def.dates.map((d) => ({ value: d.key, label: d.label }))} />
                <Button type="submit" variant="secondary">
                  이 날짜로 거르기
                </Button>
              </form>
            )}
            <form method="get" action={base} className="flex flex-wrap items-end gap-2">
              <Hidden qs={r.qs()} omit={["p", "from", "to"]} />
              <input type="hidden" name="p" value="custom" />
              <DateField help="list.from" name="from" defaultValue={lq.from ?? undefined} quick={["today"]} />
              <DateField help="list.to" name="to" defaultValue={lq.to ?? undefined} quick={["today"]} />
              <Button type="submit" variant="secondary">
                이 기간 보기
              </Button>
            </form>
          </div>
        </details>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <span>
          <b>{r.count.toLocaleString("ko-KR")}</b>
          {unitLabel}
          {filtered && r.count !== r.loaded ? <span className="text-xs text-[var(--muted)]"> (거르기 전 {r.loaded.toLocaleString("ko-KR")}{unitLabel})</span> : null}
        </span>
        {r.totals.map((t) => (
          <span key={t.label}>
            {t.label} 합계 <b className="tabular-nums">{fmt(t.value, t.unit)}</b>
          </span>
        ))}
        <span className="text-xs text-[var(--muted)]">{lq.from || lq.to ? `${dt?.label ?? "날짜"} ${lq.from ?? "처음"} ~ ${lq.to ?? "끝"}` : "기간 전체"}</span>
        <span className="no-print ml-auto flex gap-2">
          <PrintButton />
          <a href={csv} className={buttonClass("secondary")} title="지금 조건에 맞는 모든 줄(쪽 나눔 없이)을 엑셀에서 열리는 파일(CSV)로">
            엑셀
          </a>
        </span>
      </div>
    </Card>
  );
}

/** 쪽 넘김(50줄씩) */
export function ListPager<R>({ r }: { r: ListResult<R> }) {
  if (r.pages <= 1) return null;
  const base = r.def.href.split("?")[0];
  const p = r.lq.page;
  const href = (n: number) => `${base}${r.qs({ pg: n === 1 ? null : n })}`;
  return (
    <nav aria-label="쪽 넘김" className="no-print mt-3 flex flex-wrap items-center justify-center gap-2 text-sm">
      {p > 1 && (
        <Link href={href(p - 1)} className={buttonClass("secondary")}>
          ◀ 앞 쪽
        </Link>
      )}
      <span>
        {p} / {r.pages}쪽 ({(p - 1) * 50 + 1}~{Math.min(p * 50, r.count)}번째)
      </span>
      {p < r.pages && (
        <Link href={href(p + 1)} className={buttonClass("secondary")}>
          다음 쪽 ▶
        </Link>
      )}
    </nav>
  );
}

/** 상태 탭 단추(기간·찾기 조건은 그대로, 쪽은 처음으로) */
export function ListTabs<R>({ r }: { r: ListResult<R> }) {
  const t = r.def.tabs;
  if (!t) return null;
  const base = r.def.href.split("?")[0];
  const cur = r.qs().includes(`${t.param}=`) ? new URLSearchParams(r.qs().slice(1)).get(t.param) : t.options[0]?.v;
  return (
    <div className="no-print flex flex-wrap gap-2">
      {t.options.map((o, i) => (
        <Link key={o.v} href={`${base}${r.qs({ [t.param]: i === 0 ? null : o.v })}`} className={buttonClass(o.v === cur ? "primary" : "secondary")} aria-current={o.v === cur ? "true" : undefined}>
          {o.label}
        </Link>
      ))}
    </div>
  );
}
