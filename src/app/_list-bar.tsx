// 목록 공통 조회줄(보고서 센터 2단계): 기간(전체·오늘·이번 주·이번 달·지난 달·올해·직접 지정)·기준 날짜·찾기, 건수·합계, 엑셀·인쇄, 쪽 넘김.
// 목록 화면은 표 위에 <ListBar r={…} /> 를(상태 탭도 그 안에 그린다), 목록 끝에 <ListPager r={…} /> 를 둔다. 계산은 src/modules/listq/core.ts.
import Link from "next/link";
import type { ListResult, Preset } from "@/modules/listq/core";
import { PRESETS } from "@/modules/listq/core";
import { DateField, SelectField } from "./_input";
import { HelpButton } from "./_help-drawer";
import { Button, buttonClass } from "./_ui";
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

/**
 * 조회줄 한 줄(대표 결정 2026-11-23 PC 화면 개선): 상태 탭 · 기간 단추 · 기간 지정 · 찾기 · 건수·합계 · 인쇄·엑셀을 한 줄에 둔다.
 * 자리가 모자라면 다음 줄로 흐른다. 상태 탭(def.tabs)도 여기서 그리므로 화면에서 ListTabs 를 따로 두지 않는다.
 */
export function ListBar<R>({ r, unitLabel = "건", bare = false }: { r: ListResult<R>; unitLabel?: string; /** 이미 있는 패널 안에 넣을 때(테두리 없이) */ bare?: boolean }) {
  const { def, lq } = r;
  const base = def.href.split("?")[0];
  const dt = def.dates.find((d) => d.key === lq.dateKey);
  const csv = `/lists/${def.key}/csv${r.qs()}`;
  const filtered = lq.from || lq.to || lq.s;
  const sep = <span aria-hidden className="mx-0.5 hidden h-6 w-px bg-[var(--line)] sm:inline-block" />;
  return (
    <div className={bare ? "mb-3 border-b border-[var(--line)] pb-3" : "mb-3 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-2 shadow-[var(--shadow)]"} data-list-bar>
      <div className="no-print flex flex-wrap items-center gap-x-1.5 gap-y-2">
        <HelpButton topic={{ kind: "panel", id: "list.bar" }} name="조회" />
        {def.tabs && (
          <>
            <ListTabs r={r} inline />
            {sep}
          </>
        )}
        {(Object.keys(PRESETS) as Preset[])
          .filter((k) => k !== "custom" && (def.dates.length > 0 || k === "all"))
          .map((k) => (
            <Link key={k} href={`${base}${r.qs({ p: k === (def.preset ?? "all") ? null : k, from: null, to: null })}`} className={buttonClass(k === lq.preset ? "primary" : "secondary")} aria-current={k === lq.preset ? "true" : undefined}>
              {PRESETS[k]}
            </Link>
          ))}
        {lq.preset === "custom" && <span className={buttonClass("primary")}>직접 지정</span>}
        {def.dates.length > 0 && (
          <details className="group/period open:basis-full" open={lq.preset === "custom"}>
            <summary className="inline-flex min-h-9 cursor-pointer items-center px-1 text-sm text-[var(--accent)]">기간 지정{def.dates.length > 1 ? "·기준 날짜" : ""}</summary>
            <div className="mt-2 flex flex-wrap items-end gap-4">
              {def.dates.length > 1 && (
                <form method="get" action={base} className="flex flex-wrap items-end gap-2">
                  <Hidden qs={r.qs()} omit={["dk"]} />
                  <SelectField help="list.date" name="dk" defaultValue={lq.dateKey} options={def.dates.map((d) => ({ value: d.key, label: d.label }))} />
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
        <form method="get" action={base} className="flex w-full items-center gap-1 sm:ml-auto sm:w-auto" role="search">
          <Hidden qs={r.qs()} omit={["s"]} />
          <input type="search" name="s" defaultValue={lq.s} placeholder={def.searchHint ?? "번호·이름·차량번호·업체 일부"} aria-label={`${def.title} 찾기`} className="h-11 min-w-0 flex-1 rounded-md border border-[var(--line-strong)] bg-[var(--surface)] px-3 text-sm sm:w-56 sm:flex-none" />
          <Button type="submit" variant="secondary">
            찾기
          </Button>
        </form>
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1 px-1 text-sm">
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
        </span>
        <span className="flex gap-1.5">
          <PrintButton variant="secondary" />
          <a href={csv} className={buttonClass("secondary")} title="지금 조건에 맞는 모든 줄(쪽 나눔 없이)을 엑셀에서 열리는 파일(CSV)로">
            엑셀
          </a>
        </span>
      </div>
      {/* 인쇄할 때는 조건만 한 줄로 */}
      <p className="hidden text-sm print:block">
        {r.count.toLocaleString("ko-KR")}
        {unitLabel} · {lq.from || lq.to ? `${dt?.label ?? "날짜"} ${lq.from ?? "처음"} ~ ${lq.to ?? "끝"}` : "기간 전체"}
        {lq.s ? ` · 찾기 '${lq.s}'` : ""}
      </p>
    </div>
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
export function ListTabs<R>({ r, inline = false }: { r: ListResult<R>; /** 조회줄 안에서 그릴 때(ListBar 가 부름). 밖에서 부르면 아무것도 그리지 않는다(조회줄이 그림) */ inline?: boolean }) {
  if (!inline) return null;
  const t = r.def.tabs;
  if (!t) return null;
  const base = r.def.href.split("?")[0];
  const cur = r.qs().includes(`${t.param}=`) ? new URLSearchParams(r.qs().slice(1)).get(t.param) : t.options[0]?.v;
  return (
    <div className="no-print flex flex-wrap gap-1.5">
      {t.options.map((o, i) => (
        <Link key={o.v} href={`${base}${r.qs({ [t.param]: i === 0 ? null : o.v })}`} className={buttonClass(o.v === cur ? "primary" : "secondary")} aria-current={o.v === cur ? "true" : undefined}>
          {o.label}
        </Link>
      ))}
    </div>
  );
}
