"use client";
// TV 현황판 화면(대표 결정 2026-11-18). 화면 전체를 덮고, 30초마다 새 값을 받아 온다.
// 입고 중 차량이 한 화면을 넘으면 10초마다 쪽을 넘긴다. 화면 보호: 1분마다 몇 픽셀씩 옮기고, 밤 22시~6시에는 어둡게.
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { TvCar, TvData } from "@/modules/dashboard/tv";
import { TV_LATE_COLOR, TV_STATE_KEYS, TV_STATES, type TvState } from "@/modules/dashboard/tv-rules";
import type { PageHelpKey } from "@/modules/help/pages";
import { HelpButton } from "../_help-drawer";

const REFRESH_MS = 30_000;
const PAGE_MS = 10_000;
const WEEK = ["일", "월", "화", "수", "목", "금", "토"];

function seoulNow(d: Date) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Seoul", year: "numeric", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false, weekday: "short" }).formatToParts(d).map((x) => [x.type, x.value]));
  const wd = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(p.weekday);
  return { date: `${p.year}년 ${p.month}월 ${p.day}일 (${WEEK[wd]})`, time: `${p.hour === "24" ? "00" : p.hour}:${p.minute}`, hour: Number(p.hour) % 24 };
}

/** 차량번호: 한글(용도 글자) 앞뒤를 띄워 숫자와 구분(12가3456 → 12가 3456) */
const plateText = (p: string) => p.replace(/^(\d{2,3})([가-힣])(\d{4})$/, "$1$2 $3");

function Chip({ state, small }: { state: TvState; small?: boolean }) {
  const s = TV_STATES[state];
  return (
    <b className={`tv-chip${s.outline ? " ol" : ""}${state === "hold" ? " hatch" : ""}${small ? " sm" : ""}`} style={{ ["--c" as string]: s.color, color: s.outline ? undefined : s.fg }}>
      {s.icon && <span aria-hidden>{s.icon}</span>}
      {s.label}
    </b>
  );
}

function Segs({ c }: { c: TvCar }) {
  if (!c.total) return <span className="tv-segs empty" aria-hidden />;
  return (
    <span className="tv-segs" aria-label={`공정 ${c.done}/${c.total} 끝`}>
      {Array.from({ length: c.total }, (_, i) => (
        <i key={i} className={i < c.done ? "d" : i === c.current ? "n" : ""} />
      ))}
    </span>
  );
}

export function TvScreen({ initial, k, help, signedIn, extra = "" }: { initial: TvData; k: string | null; help: PageHelpKey; signedIn: boolean; /** 지점·작업장만 볼 때 덧붙는 주소 값(b=·w=) */ extra?: string }) {
  const [data, setData] = useState(initial);
  const [err, setErr] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [page, setPage] = useState(0);
  const [per, setPer] = useState(10);
  const [shift, setShift] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const qs = [k ? `k=${encodeURIComponent(k)}` : "", extra].filter(Boolean).join("&");
      const r = await fetch(`/api/tv${qs ? `?${qs}` : ""}`, { cache: "no-store" });
      const j = await r.json();
      if (!r.ok || !j.ok) throw new Error(j.message ?? "불러오지 못했습니다");
      setData(j.data);
      setErr(null);
    } catch (e) {
      setErr(`새 값을 받지 못했습니다(${e instanceof Error ? e.message : "연결 끊김"}). 30초 뒤 다시 시도합니다.`);
    }
  }, [k, extra]);

  useEffect(() => {
    const a = setInterval(load, REFRESH_MS);
    const b = setInterval(() => setNow(new Date()), 1000);
    const c = setInterval(() => setShift((s) => (s + 1) % 4), 60_000);
    return () => [a, b, c].forEach(clearInterval);
  }, [load]);

  // 한 쪽에 들어가는 줄 수: 목록 칸 높이 ÷ 한 줄 높이
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const fit = () => {
      // 휴대폰처럼 좁은 화면은 쪽을 넘기지 않고 아래로 내려 본다
      if (window.innerWidth < 900) return setPer(1000);
      const row = window.innerHeight * 0.066;
      setPer(Math.max(3, Math.floor(el.clientHeight / row)));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const pages = Math.max(1, Math.ceil(data.cars.length / per));
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
  const shown = data.cars.slice((page % pages) * per, (page % pages) * per + per);
  const offsets = [
    [0, 0],
    [3, 2],
    [0, 4],
    [-3, 2],
  ];

  return (
    <div className={`tv-root${dim ? " dim" : ""}`} style={{ ["--late" as string]: TV_LATE_COLOR }}>
      <style>{CSS}</style>
      <div className="tv-move" style={{ transform: `translate(${offsets[shift][0]}px, ${offsets[shift][1]}px)` }}>
        <header className="tv-head">
          <div className="tv-shop">{[data.shop, data.scope, "정비 현황"].filter(Boolean).join(" · ")}</div>
          <div className="tv-date">{clock.date}</div>
          <div className="tv-clock">{clock.time}</div>
          <div className="tv-tools">
            <span className="tv-help">
              <HelpButton topic={{ kind: "page", id: help }} name="TV 현황판" />
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

        <section className="tv-kpi" aria-label="오늘 숫자">
          <Tile n={data.kpi.todayIn} label="오늘 입고 예정" color={TV_STATES.plan.color} />
          <Tile n={data.kpi.inShop} label="입고 중 차량" color={TV_STATES.in.color} />
          <Tile n={data.kpi.work} label="작업 중" color={TV_STATES.work.color} />
          <Tile n={data.kpi.hold} label="부품·외주 대기" color={TV_STATES.hold.color} />
          <Tile n={data.kpi.ready} label="출고 대기" color={TV_STATES.ready.color} />
          <Tile n={data.kpi.late} label="출고 지연" color={TV_LATE_COLOR} warn={data.kpi.late > 0} />
        </section>

        <main className="tv-main">
          <div className="tv-left">
            <h2>
              🚗 입고 중 차량 정비 현황 <small>{data.cars.length}대 · 출고 약속 빠른 순</small>
              {pages > 1 && (
                <span className="tv-pg" aria-label={`${pages}쪽 중 ${(page % pages) + 1}쪽`}>
                  {Array.from({ length: pages }, (_, i) => (
                    <i key={i} className={i === page % pages ? "on" : ""} />
                  ))}
                </span>
              )}
            </h2>
            <div className="tv-row th">
              <span>차량번호</span>
              <span>차종</span>
              <span>상태</span>
              <span>지금 공정 · 공정 진행</span>
              <span className="r">출고 약속</span>
            </div>
            <div className="tv-rows" ref={listRef}>
              {shown.map((c) => (
                <div key={c.id} className={`tv-row${c.late ? " late" : ""}${c.state === "hold" ? " hold" : ""}`} style={{ ["--c" as string]: TV_STATES[c.state].color }}>
                  <span className="plate">{plateText(c.plate)}</span>
                  <span className="model">
                    {c.model}
                    {c.tags.map((t) => (
                      <span key={t} className="tag">
                        {t}
                      </span>
                    ))}
                  </span>
                  <span>
                    <Chip state={c.state} />
                  </span>
                  <span className="proc">
                    <span className="now">{c.sub}</span>
                    <Segs c={c} />
                  </span>
                  <span className={`due${c.late ? " late" : ""}`}>{c.late ? `⚠ ${c.late}일 지연` : c.dueWord}</span>
                </div>
              ))}
              {!data.cars.length && <div className="tv-empty">입고 중인 차가 없습니다.</div>}
            </div>
          </div>

          <div className="tv-side">
            <div className="tv-box">
              <h2>
                📥 입고 예정 <small>오늘 · 내일 · 모레</small>
              </h2>
              {data.incoming.map((i) => (
                <div key={i.key} className="tv-li">
                  <span className="d">{i.when}</span>
                  <span className="p">
                    {plateText(i.plate)}
                    <small>{[i.model, ...i.tags].filter(Boolean).join(" · ")}</small>
                  </span>
                  <b className="tv-chip ol sm" style={{ ["--c" as string]: TV_STATES.plan.color }}>
                    {i.kind}
                  </b>
                </div>
              ))}
              {!data.incoming.length && <div className="tv-empty">입고 예정이 없습니다.</div>}
            </div>
            <div className="tv-box">
              <h2>
                📤 출고 예정 <small>지연 · 오늘 · 내일 · 모레</small>
              </h2>
              {data.outgoing.map((o) => (
                <div key={o.key} className={`tv-li${o.state === "out" ? " gone" : ""}`}>
                  <span className={`d${o.late ? " late" : ""}`}>{o.late ? `⚠ ${o.when}` : o.when}</span>
                  <span className="p">
                    {plateText(o.plate)}
                    <small>{o.model}</small>
                  </span>
                  <Chip state={o.state} small />
                </div>
              ))}
              {!data.outgoing.length && <div className="tv-empty">출고 예정이 없습니다.</div>}
            </div>
          </div>
        </main>

        <footer className="tv-foot">
          {TV_STATE_KEYS.map((s) => (
            <span key={s} className="lg">
              <i className={`${TV_STATES[s].outline ? "ol" : ""}${s === "hold" ? " hatch" : ""}`} style={{ ["--c" as string]: TV_STATES[s].color }} />
              {TV_STATES[s].icon} {TV_STATES[s].label}
            </span>
          ))}
          <span className="lg">
            <i className="lt" />⚠ 지연(덧표시)
          </span>
          {err && <span className="tv-err">{err}</span>}
        </footer>
      </div>
    </div>
  );
}

function Tile({ n, label, color, warn }: { n: number; label: string; color: string; warn?: boolean }) {
  return (
    <div className="tv-tile">
      <i style={{ background: color }} />
      <b style={warn ? { color: "#ff9a5c" } : undefined}>{n}</b>
      <span>{label}</span>
    </div>
  );
}

function toggleFs() {
  if (document.fullscreenElement) void document.exitFullscreen();
  else void document.documentElement.requestFullscreen?.().catch(() => {});
}

const CSS = `
/* 도움말 창은 TV 화면(z 80)보다 위에 연다 */
#help-drawer{z-index:90}
.tv-root{position:fixed;inset:0;z-index:80;background:#0c1524;color:#eef3fa;overflow:hidden;font-size:clamp(12px,1.95vh,24px);font-family:inherit}
.tv-root.dim .tv-move{filter:brightness(.55)}
.tv-move{height:100%;display:flex;flex-direction:column;transition:filter 2s,transform 1s}
.tv-head{display:flex;align-items:center;gap:1.4em;padding:.6em 1.6em;background:#0f1d31;border-bottom:2px solid #24364f}
.tv-shop{font-size:1.6em;font-weight:800;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tv-date{font-size:1.05em;color:#9fb0c6;white-space:nowrap}
.tv-clock{font-size:2em;font-weight:800;font-variant-numeric:tabular-nums}
.tv-tools{display:flex;gap:.5em;align-items:center;font-size:.75em}
.tv-tools button,.tv-tools a{background:#173b86;color:#eef3fa;border:1px solid #3a63b8;border-radius:.5em;width:2.2em;height:2.2em;display:inline-flex;align-items:center;justify-content:center;font-size:1em;cursor:pointer;white-space:nowrap}
.tv-help button{border-radius:.5em}
.tv-kpi{display:grid;grid-template-columns:repeat(6,1fr);gap:.7em;padding:.7em 1.6em 0}
.tv-tile{background:#142235;border:1px solid #24364f;border-radius:.6em;padding:.3em .7em;display:flex;align-items:center;gap:.6em;min-width:0}
.tv-tile i{width:.6em;align-self:stretch;border-radius:.25em;flex:none}
.tv-tile b{font-size:2.3em;line-height:1.1;font-variant-numeric:tabular-nums}
.tv-tile span{color:#9fb0c6;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tv-main{flex:1;min-height:0;display:grid;grid-template-columns:1.75fr 1fr;gap:.9em;padding:.7em 1.6em .5em}
.tv-left{min-height:0;display:flex;flex-direction:column}
.tv-root h2{margin:0 0 .4em;font-size:1.2em;display:flex;align-items:center;gap:.5em;white-space:nowrap}
.tv-root h2 small{font-size:.75em;color:#9fb0c6;font-weight:400}
.tv-pg{margin-left:auto;display:flex;gap:.35em}.tv-pg i{width:.55em;height:.55em;border-radius:50%;background:#2a3e5c}.tv-pg i.on{background:#cfe0ff}
.tv-rows{flex:1;min-height:0;display:flex;flex-direction:column;gap:.3em;overflow:hidden}
.tv-row{display:grid;grid-template-columns:10.5em 7.5em 9.5em minmax(0,1fr) 6.5em;align-items:center;gap:.6em;background:#142235;border:1px solid #24364f;border-left:.5em solid var(--c);border-radius:.45em;padding:0 .7em;height:5.6vh;min-height:2.6em;flex:none}
.tv-row.th{background:none;border-color:transparent;height:auto;min-height:0;color:#9fb0c6;font-size:.8em;padding-bottom:.2em}
.tv-row.late{box-shadow:inset 0 0 0 3px var(--late)}
.tv-row.hold{border-left-style:dashed}
.tv-row>span{min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tv-row .r{text-align:right}
.tv-row .plate{font-size:1.35em;font-weight:800;letter-spacing:.02em}
.tv-row .model{color:#c8d5e6}
.tag{display:inline-block;font-size:.7em;font-weight:700;border:2px solid #7f93ad;color:#cfdbea;border-radius:.3em;padding:0 .3em;margin-left:.35em;vertical-align:.15em}
.tv-chip{display:inline-flex;align-items:center;gap:.3em;padding:.1em .6em;border-radius:2em;font-weight:800;background:var(--c);white-space:nowrap}
.tv-chip.ol{background:none;border:3px dashed var(--c);color:#eef3fa}
.tv-chip.sm{font-size:.85em;padding:.05em .5em}
.hatch{background:repeating-linear-gradient(135deg,#F0E442 0 .4em,#c9bd1c .4em .65em)!important}
.proc{display:flex;flex-direction:column;gap:.25em}
.proc .now{font-size:.92em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tv-segs{display:flex;gap:.18em;height:.45em}.tv-segs i{flex:1;border-radius:.12em;background:#34465f}.tv-segs i.d{background:${TV_STATES.ready.color}}.tv-segs i.n{background:${TV_STATES.work.color}}
.tv-segs.empty{background:#1d2c42;border-radius:.12em}
.due{text-align:right;font-weight:700;font-variant-numeric:tabular-nums}
.due.late,.tv-li .d.late{color:#ff9a5c}
.tv-side{min-height:0;display:grid;grid-template-rows:1fr 1fr;gap:.7em}
.tv-box{background:#142235;border:1px solid #24364f;border-radius:.6em;padding:.6em .8em;overflow:hidden;min-height:0}
.tv-li{display:grid;grid-template-columns:5.6em minmax(0,1fr) auto;align-items:center;gap:.5em;padding:.3em 0;border-bottom:1px dashed #2c4060}
.tv-li:last-child{border:0}
.tv-li .d{font-weight:800;color:#cfe0ff;font-size:.9em}
.tv-li .p{font-weight:800;font-size:1.1em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tv-li .p small{font-weight:400;color:#c8d5e6;font-size:.78em;margin-left:.4em}
.tv-li.gone .p{opacity:.55}
.tv-empty{color:#7186a3;padding:1.5em 0;text-align:center}
.tv-foot{display:flex;gap:1em;align-items:center;padding:.3em 1.6em .6em;font-size:.8em;color:#9fb0c6;flex-wrap:wrap}
.tv-foot .lg{display:inline-flex;align-items:center;gap:.3em;white-space:nowrap}
.tv-foot .lg i{width:1em;height:.75em;border-radius:.2em;background:var(--c)}
.tv-foot .lg i.ol{background:none;border:2px dashed var(--c)}
.tv-foot .lg i.lt{background:none;border:2px solid var(--late)}
.tv-err{color:#ff9a5c;margin-left:auto}
@media (max-width:900px){.tv-root{overflow:auto;font-size:14px}.tv-kpi{grid-template-columns:repeat(3,1fr)}.tv-main{grid-template-columns:1fr}.tv-row{grid-template-columns:minmax(0,1fr) auto auto;height:auto;min-height:2.4em;padding:.3em .5em;font-size:.85em}.tv-rows{flex:none;overflow:visible}.tv-move{height:auto;min-height:100%}.tv-main{flex:none}.tv-left{min-height:auto}.tv-side{grid-template-rows:auto auto}.tv-box{overflow:visible}.tv-li{grid-template-columns:5em minmax(0,1fr) auto;font-size:.9em}.tv-li .p small{display:none}.tv-tile b{font-size:1.6em}.tv-shop{font-size:1.2em}.tv-row .model,.tv-row .proc,.tv-row.th{display:none}.tv-head{flex-wrap:wrap}}
`;
