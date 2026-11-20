"use client";
// 테크베이용 TV 현황판 화면(대표 요청 2026-11-20). 전체 현황판(tv-screen)과 같은 틀·화면 보호를 쓰고,
// 오른쪽 입고·출고 예정 칸 없이 차 목록을 화면 너비 전체로 쓴다. 색은 상태가 아니라 공정 단계별(TB_STAGES).
// 위쪽 요약은 '오늘 입고 → 각 공정 → 출고 대기 → 오늘 출고' 순서.
import Link from "next/link";
import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import type { TvCar, TvData } from "@/modules/dashboard/tv";
import { TB_STAGE_KEYS, TB_STAGES, TV_LATE_COLOR, TV_STATES } from "@/modules/dashboard/tv-rules";
import type { PageHelpKey } from "@/modules/help/pages";
import { HelpButton } from "../../_help-drawer";
import { CSS, plateText, seoulNow, toggleFs } from "../tv-screen";

const REFRESH_MS = 30_000;
const PAGE_MS = 10_000;

const inDay = (iso: string) => {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric" }).formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  return `${p.month}/${p.day}`;
};

/** 공정 막대: 칸마다 그 공정 단계 색. 끝난 칸은 진하게, 지금 칸은 흰 테두리, 남은 칸은 흐리게 */
function StageSegs({ c }: { c: TvCar }) {
  if (!c.total) return <span className="tv-segs empty" aria-hidden />;
  return (
    <span className="tv-segs tb" aria-label={`공정 ${c.done}/${c.total} 끝`}>
      {c.stages.map((st, i) => (
        <i key={i} className={i < c.done ? "d" : i === c.current ? "n" : "f"} style={{ ["--c" as string]: TB_STAGES[st].color }} />
      ))}
    </span>
  );
}

export function TechbayScreen({ initial, k, signedIn, help }: { initial: TvData; k: string | null; signedIn: boolean; help: PageHelpKey }) {
  const [data, setData] = useState(initial);
  const [err, setErr] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [page, setPage] = useState(0);
  const [per, setPer] = useState(10);
  const [shift, setShift] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/tv?p=techbay${k ? `&k=${encodeURIComponent(k)}` : ""}`, { cache: "no-store" });
      const j = await r.json();
      if (!r.ok || !j.ok) throw new Error(j.message ?? "불러오지 못했습니다");
      setData(j.data);
      setErr(null);
    } catch (e) {
      setErr(`새 값을 받지 못했습니다(${e instanceof Error ? e.message : "연결 끊김"}). 30초 뒤 다시 시도합니다.`);
    }
  }, [k]);

  useEffect(() => {
    const a = setInterval(load, REFRESH_MS);
    const b = setInterval(() => setNow(new Date()), 1000);
    const c = setInterval(() => setShift((s) => (s + 1) % 4), 60_000);
    return () => [a, b, c].forEach(clearInterval);
  }, [load]);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const fit = () => {
      if (window.innerWidth < 900) return setPer(1000);
      const row = window.innerHeight * 0.066;
      setPer(Math.max(3, Math.floor(el.clientHeight / row)));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // 목록: 입고 중 차 + 맨 아래 오늘 출고한 차(흐리게)
  type Row = { kind: "car"; c: TvCar } | { kind: "gone"; g: TvData["gone"][number] };
  const rows: Row[] = [...data.cars.map((c) => ({ kind: "car" as const, c })), ...data.gone.map((g) => ({ kind: "gone" as const, g }))];
  const pages = Math.max(1, Math.ceil(rows.length / per));
  useEffect(() => {
    if (pages < 2) return setPage(0);
    const t = setInterval(() => setPage((p) => (p + 1) % pages), PAGE_MS);
    return () => clearInterval(t);
  }, [pages]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "f" || e.key === "F") toggleFs();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const clock = seoulNow(now);
  const dim = clock.hour >= 22 || clock.hour < 6;
  const pg = page % pages;
  const shown = rows.slice(pg * per, pg * per + per);
  const offsets = [
    [0, 0],
    [3, 2],
    [0, 4],
    [-3, 2],
  ];
  const late = data.cars.filter((c) => c.late > 0).length;

  return (
    <div className={`tv-root${dim ? " dim" : ""}`} style={{ ["--late" as string]: TV_LATE_COLOR }}>
      <style>{CSS + TB_CSS}</style>
      <div className="tv-move" style={{ transform: `translate(${offsets[shift][0]}px, ${offsets[shift][1]}px)` }}>
        <header className="tv-head">
          <div className="tv-shop">{data.shop} · 테크베이 차량 정비 현황</div>
          <div className="tv-date">{clock.date}</div>
          <div className="tv-clock">{clock.time}</div>
          <div className="tv-tools">
            <span className="tv-help">
              <HelpButton topic={{ kind: "page", id: help }} name="TV 현황판(테크베이)" />
            </span>
            <button type="button" onClick={toggleFs} title="전체화면 (F 키)" aria-label="전체화면">
              ⛶
            </button>
            {signedIn && (
              <Link href="/home" title="닫기(앱으로 돌아가기)" aria-label="닫기">
                ✕
              </Link>
            )}
          </div>
        </header>

        <section className="tb-flow" aria-label="오늘 입고에서 오늘 출고까지">
          <FlowTile n={data.flow.inToday} label="오늘 입고" icon="⬇" edge />
          {TB_STAGE_KEYS.map((s) => (
            <Fragment key={s}>
              <span className="tb-arr" aria-hidden>
                ›
              </span>
              <FlowTile n={data.flow.stages[s].n} label={TB_STAGES[s].label} color={TB_STAGES[s].color} sub={s === "ready" || s === "intake" ? undefined : data.flow.stages[s].n ? `작업 ${data.flow.stages[s].doing} · 대기 ${data.flow.stages[s].n - data.flow.stages[s].doing}` : undefined} />
            </Fragment>
          ))}
          <span className="tb-arr" aria-hidden>
            ›
          </span>
          <FlowTile n={data.flow.outToday} label="오늘 출고" icon="✓" edge />
        </section>

        <main className="tb-main">
          <h2>
            🚗 테크베이 입고 차량 <small>{data.cars.length}대 · 출고 약속 빠른 순{late ? ` · ⚠ 지연 ${late}대` : ""}</small>
            {pages > 1 && (
              <span className="tv-pg" aria-label={`${pages}쪽 중 ${pg + 1}쪽`}>
                {Array.from({ length: pages }, (_, i) => (
                  <i key={i} className={i === pg ? "on" : ""} />
                ))}
              </span>
            )}
          </h2>
          <div className="tv-row tb th">
            <span>차량번호</span>
            <span>차종</span>
            <span>주문번호</span>
            <span>공정</span>
            <span>지금 하는 일 · 공정 진행</span>
            <span className="r">입고</span>
            <span className="r">출고 약속</span>
          </div>
          <div className="tv-rows" ref={listRef}>
            {shown.map((r) =>
              r.kind === "car" ? (
                <div key={r.c.id} className={`tv-row tb${r.c.late ? " late" : ""}${r.c.state === "hold" ? " hold" : ""}`} style={{ ["--c" as string]: TB_STAGES[r.c.stage].color }}>
                  <span className="plate">{plateText(r.c.plate)}</span>
                  <span className="model">{r.c.model}</span>
                  <span className="ord">{r.c.orderNo ?? "-"}</span>
                  <span>
                    <b className={`tv-chip${r.c.doing ? "" : " tb-wait"}`} style={{ ["--c" as string]: TB_STAGES[r.c.stage].color, color: r.c.doing ? "#0b0f14" : undefined }}>
                      {TB_STAGES[r.c.stage].label}
                    </b>
                  </span>
                  <span className="proc">
                    <span className="now">
                      <span aria-hidden>{TV_STATES[r.c.state].icon}</span> {TV_STATES[r.c.state].label} · {r.c.sub}
                      {r.c.tags
                        .filter((t) => t !== "테크베이")
                        .map((t) => (
                          <span key={t} className="tag">
                            {t}
                          </span>
                        ))}
                    </span>
                    <StageSegs c={r.c} />
                  </span>
                  <span className="r indate">{inDay(r.c.inAt)}</span>
                  <span className={`due${r.c.late ? " late" : ""}`}>{r.c.late ? `⚠ ${r.c.late}일 지연` : r.c.dueWord}</span>
                </div>
              ) : (
                <div key={`g-${r.g.id}`} className="tv-row tb gone" style={{ ["--c" as string]: TV_STATES.out.color }}>
                  <span className="plate">{plateText(r.g.plate)}</span>
                  <span className="model">{r.g.model}</span>
                  <span className="ord">{r.g.orderNo ?? "-"}</span>
                  <span>
                    <b className="tv-chip" style={{ ["--c" as string]: TV_STATES.out.color, color: TV_STATES.out.fg }}>
                      ✓ 출고함
                    </b>
                  </span>
                  <span className="proc">
                    <span className="now">오늘 {r.g.at} 출고</span>
                  </span>
                  <span />
                  <span className="due">오늘</span>
                </div>
              ),
            )}
            {!rows.length && <div className="tv-empty">입고 중인 테크베이 차가 없습니다.</div>}
          </div>
        </main>

        <footer className="tv-foot">
          {TB_STAGE_KEYS.map((s) => (
            <span key={s} className="lg">
              <i style={{ ["--c" as string]: TB_STAGES[s].color }} />
              {TB_STAGES[s].label}
            </span>
          ))}
          <span className="lg">
            <i className="ol" style={{ ["--c" as string]: "#9AA3AB" }} />
            테두리만 칩 = 그 공정 대기
          </span>
          <span className="lg">
            <i className="lt" />⚠ 지연
          </span>
          {err && <span className="tv-err">{err}</span>}
        </footer>
      </div>
    </div>
  );
}

function FlowTile({ n, label, color, icon, sub, edge }: { n: number; label: string; color?: string; icon?: string; sub?: string; edge?: boolean }) {
  return (
    <div className={`tb-tile${edge ? " edge" : ""}`} style={color ? { ["--c" as string]: color } : undefined}>
      <span className="l">
        {icon && <span aria-hidden>{icon} </span>}
        {label}
      </span>
      <b>{n}</b>
      <small>{sub ?? " "}</small>
    </div>
  );
}

const TB_CSS = `
.tb-flow{display:flex;align-items:stretch;gap:.25em;padding:.7em 1.6em 0}
.tb-arr{align-self:center;color:#4d6382;font-size:1.6em;font-weight:800;flex:none}
.tb-tile{flex:1;min-width:0;background:#142235;border:1px solid #24364f;border-top:.4em solid var(--c,#24364f);border-radius:.5em;padding:.2em .5em .25em;display:flex;flex-direction:column;align-items:center}
.tb-tile.edge{background:#1a2c47;border-color:#3a5578;border-top-color:#cfe0ff}
.tb-tile .l{font-size:.85em;color:#c8d5e6;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%;font-weight:700}
.tb-tile b{font-size:2.1em;line-height:1.1;font-variant-numeric:tabular-nums}
.tb-tile small{font-size:.7em;color:#9fb0c6;white-space:nowrap}
.tb-main{flex:1;min-height:0;display:flex;flex-direction:column;padding:.7em 1.6em .5em}
.tv-row.tb{grid-template-columns:10.5em 8em 8em 9em minmax(0,1fr) 4.5em 7em}
.tv-row.tb .ord{color:#c8d5e6;font-variant-numeric:tabular-nums}
.tv-row.tb .indate{color:#9fb0c6;font-variant-numeric:tabular-nums}
.tv-row.gone{opacity:.55}
.tb-wait{background:none!important;border:3px solid var(--c);color:#eef3fa;padding:0 .5em}
.tv-segs.tb i{background:var(--c)}.tv-segs.tb i.f{opacity:.25}.tv-segs.tb i.n{box-shadow:0 0 0 2px #ffffff}
@media (max-width:900px){.tb-flow{flex-wrap:wrap}.tb-arr{display:none}.tb-tile{flex:1 0 22%}.tb-main{flex:none}.tv-row.tb{grid-template-columns:minmax(0,1fr) auto auto}.tv-row.tb .ord,.tv-row.tb .indate,.tv-row.tb>span:nth-child(5){display:none}}
`;
