import Link from "next/link";
import { getDb } from "@/db/runtime";
import { HOW_LABEL, serverOpsView, SILENT_MIN, STAGES, type Change } from "@/modules/platform/server-ops";
import { requireUser } from "../../_lib/session";
import { NumberField, RadioRow, TextField } from "../../_input";
import { SubmitButton } from "../../_submit";
import { Badge, buttonClass, Card, ErrorBox, Notice, PageTitle, fmtTime } from "../../_ui";
import { blockIpAction, requestUpdateAction, setAutoUpdateAction, setGeoBlockAction, unblockIpAction } from "./actions";
import { RULES, securityView } from "@/modules/platform/security";
import { certDays } from "@/modules/platform/server-ops";
import { UpdateWatch } from "./_watch";
import { Spark, type SparkPoint } from "./_spark";
import { fmtBps, fmtBytes, fmtValue } from "./_fmt";
import type { Sample } from "@/modules/platform/server-ops";
import { errorCountToday } from "@/modules/platform/error-log";

const PLACE: Record<string, string> = { home: "대표 자택", shop: "공업사", cloud: "클라우드" };
const MODE: Record<string, string> = { direct: "국내 직접 접속", tunnel: "클라우드플레어 터널" };

function Changes({ list }: { list: Change[] }) {
  if (!list.length) return <p className="text-xs text-[var(--muted)]">바뀐 내용 기록이 없습니다.</p>;
  return (
    <ul className="list-disc space-y-0.5 pl-5 text-sm">
      {list.map((c, i) => (
        <li key={i}>
          {c.label && <span className="mr-1.5 font-mono text-xs text-[var(--muted)]">{c.label}</span>}
          {c.title}
        </li>
      ))}
    </ul>
  );
}

const hm = (ms: number) => new Date(ms + 9 * 3600_000).toISOString().slice(11, 16);
/** 24시간을 5분 칸 288개로 펼친다(기록 없는 칸은 비움) */
function grid(series: Sample[], now: number, pick: (x: Sample) => number | null): SparkPoint[] {
  const slot = 5 * 60_000;
  const end = Math.floor(now / slot) * slot;
  const by = new Map(series.map((x) => [Date.parse(x.t), x]));
  return Array.from({ length: 288 }, (_, i) => {
    const t = end - (287 - i) * slot;
    const x = by.get(t);
    return { t: new Date(t).toISOString(), label: hm(t), v: x ? pick(x) : null };
  });
}
const pos = (v: number) => (v >= 0 ? v : null);

/** 설정 › 서버(대표 요청 2026-11-19): 서버 정보와 '지금 새 버전 올리기'. 서버가 멀리(대표 자택) 있어도 앱에서 한다 */
export default async function ServerSettingsPage({ searchParams }: { searchParams: Promise<{ error?: string; notice?: string }> }) {
  const { error, notice } = await searchParams;
  const user = await requireUser();
  const owner = user.roles.includes("owner");
  const db = await getDb();
  const v = await serverOpsView(db);
  const errToday = owner ? await errorCountToday(db) : 0;
  const sec = await securityView(db);
  const cd = certDays(v.status);
  const st = v.status;
  const tr = v.traffic;
  const now = Date.now();
  const direct = st?.mode === "direct";
  const charts: { title: string; kind: "ms" | "count" | "bytes" | "pct"; pick: (x: Sample) => number | null }[] = [
    ...(direct
      ? [
          { title: "화면 열기 시간(느린 쪽)", kind: "ms" as const, pick: (x: Sample) => pos(x.p95) },
          { title: "접속 요청 수(5분)", kind: "count" as const, pick: (x: Sample) => pos(x.reqs) },
        ]
      : [{ title: "앱 응답 시간", kind: "ms" as const, pick: (x: Sample) => pos(x.app) }]),
    { title: "보낸 데이터(5분)", kind: "bytes", pick: (x) => pos(x.tx) },
    { title: "받은 데이터(5분)", kind: "bytes", pick: (x) => pos(x.rx) },
    { title: "CPU 사용률(가장 높을 때)", kind: "pct", pick: (x) => pos(x.cpu) },
    { title: "메모리 사용률", kind: "pct", pick: (x) => pos(x.mem) },
  ];
  // 표로 보기: 1시간 단위
  const hours = Array.from({ length: 24 }, (_, i) => {
    const end = Math.floor(now / 3600_000) * 3600_000 - (23 - i) * 3600_000;
    const xs = v.series.filter((x) => Date.parse(x.t) >= end && Date.parse(x.t) < end + 3600_000);
    const sum = (k: "reqs" | "errors" | "rx" | "tx") => (xs.some((x) => x[k] >= 0) ? xs.reduce((a, x) => a + Math.max(0, x[k]), 0) : -1);
    const mx = (k: "p95" | "app" | "cpu") => xs.reduce((a, x) => Math.max(a, x[k]), -1);
    return { at: hm(end), reqs: sum("reqs"), errors: sum("errors"), rx: sum("rx"), tx: sum("tx"), p95: mx("p95"), app: mx("app"), cpu: mx("cpu"), any: xs.length > 0 };
  }).filter((h) => h.any);
  const rows: [string, string][] = st
    ? [
        ["위치", `${PLACE[st.place] ?? (st.place || "-")} · ${st.host || "-"}`],
        ["접속 방식", MODE[st.mode] ?? (st.mode || "-")],
        ["앱 버전", st.versionLabel ? `${st.versionLabel} (${st.version})` : st.version || "-"],
        ["가동 시간", `${st.uptime || "-"}${st.bootAt ? ` (켠 때 ${st.bootAt.slice(0, 16)})` : ""}`],
        ["CPU", [st.cpuPct >= 0 ? `${st.cpuPct}% 사용` : "", st.cpuTemp >= 0 ? `온도 ${st.cpuTemp}℃` : ""].filter(Boolean).join(" · ") || "-"],
        ["SSD 건강", st.ssdOk === false ? "자체 진단 실패(교체 준비)" : [st.ssdLife >= 0 ? `수명 ${st.ssdLife}% 남음` : "", st.ssdTemp >= 0 ? `온도 ${st.ssdTemp}℃` : ""].filter(Boolean).join(" · ") || "-"],
        ["다시 켜기", st.rebootNeeded ? "필요(보안 업데이트, 새벽 4시에 저절로)" : "필요 없음"],
        ["디스크(SSD)", st.disk || "-"],
        ["백업 디스크", st.backupDisk || "연결 안 됨"],
        ["메모리", st.memory || "-"],
        [
          "응답 속도",
          [st.appMs >= 0 ? `앱 ${fmtValue("ms", st.appMs)}` : "", st.p95Ms >= 0 ? `실제 접속(최근 1분) 평균 ${fmtValue("ms", st.avgMs)} · 느린 쪽 ${fmtValue("ms", st.p95Ms)}` : ""].filter(Boolean).join(" · ") || "-",
        ],
        [
          "접속량",
          st.reqs >= 0
            ? `최근 1분 ${st.reqs.toLocaleString("ko-KR")}건${st.errors > 0 ? `(서버 오류 ${st.errors}건)` : ""}${tr.todayReqs >= 0 ? ` · 오늘 ${tr.todayReqs.toLocaleString("ko-KR")}건${tr.todayErrors > 0 ? `(오류 ${tr.todayErrors}건)` : ""}` : ""}`
            : direct
              ? "새 버전이 올라가면 셉니다"
              : "국내 직접 접속일 때만 셉니다",
        ],
        [
          "데이터 양",
          tr.txBps >= 0 || tr.todayTx >= 0
            ? `지금 보내기 ${fmtBps(tr.txBps)} · 받기 ${fmtBps(tr.rxBps)}${tr.todayTx >= 0 ? ` · 오늘 보낸 ${fmtBytes(tr.todayTx)} · 받은 ${fmtBytes(tr.todayRx)}` : ""}`
            : "-",
        ],
        ["UPS", st.ups || "연결 안 됨"],
        ["내부 주소", st.lanIp || "-"],
        ["인터넷 주소", st.publicIp || "-"],
        [
          "도메인",
          st.mode !== "direct"
            ? "클라우드플레어 터널로 들어옵니다(주소·인증서는 클라우드플레어가 관리)"
            : [
                st.siteHost || "-",
                st.dnsIp ? (st.dnsIp === st.publicIp ? `→ ${st.dnsIp}(맞음)` : `→ ${st.dnsIp}(서버 주소 ${st.publicIp || "?"}와 다름)`) : "",
                cd != null ? `인증서 ${cd < 0 ? "만료됨" : `${cd}일 남음`}(${st.certUntil.slice(0, 10)}까지, 30일 남으면 저절로 갱신)` : "",
              ]
                .filter(Boolean)
                .join(" · "),
        ],
        ["주소 자동 고치기", v.ddns.length ? `${v.ddns[0].at} ${v.ddns[0].kind === "changed" ? "주소 바뀜·고침" : "실패"}: ${v.ddns[0].message}` : st.mode === "direct" ? "바뀐 적 없음(5분마다 확인)" : "-"],
        ["프로그램", st.services || "-"],
      ]
    : [];
  return (
    <>
      <PageTitle
        help="settings.server"
        sub="서버(미니 PC)의 상태를 보고, 새 버전을 기다리지 않고 바로 올립니다. 서버가 멀리 있어도 여기서 합니다."
        actions={
          owner ? (
            <div className="flex flex-wrap gap-2">
              <Link href="/settings/server/errors" className={buttonClass("secondary")}>
                오류 기록{errToday > 0 ? ` (오늘 ${errToday.toLocaleString("ko-KR")})` : ""}
              </Link>
              <Link href="/settings/domain" className={buttonClass("secondary")}>
                도메인
              </Link>
              <Link href="/help/server-guide" className={buttonClass("secondary")}>
                서버 설명서
              </Link>
            </div>
          ) : undefined
        }
      >
        서버
      </PageTitle>
      <div className="mb-4 space-y-2">
        <ErrorBox message={error} />
        {notice && <Notice>{notice}</Notice>}
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] xl:items-start">
        <Card title="새 버전" help={{ kind: "panel", id: "server.update" }}>
          <div className="space-y-3 text-sm">
            {st ? (
              <p>
                지금 <b className="font-mono">{st.versionLabel || st.version || "-"}</b>
                {st.versionLabel && <span className="ml-1 font-mono text-xs text-[var(--muted)]">{st.version}</span>}
                {st.behind > 0 ? (
                  <>
                    {" "}
                    · <Badge tone="accent">새 버전 있음: 변경 {st.pending?.length || st.behind}개</Badge> <span className="font-mono text-xs text-[var(--muted)]">{st.latestLabel || st.latest}</span>
                  </>
                ) : st.latest ? (
                  <>
                    {" "}
                    · <Badge tone="ok">최신</Badge>
                  </>
                ) : null}
              </p>
            ) : null}
            {st && st.behind > 0 && st.pending?.length > 0 && (
              <details className="rounded-md border border-[var(--line)] px-3 py-2">
                <summary className="cursor-pointer">올라갈 변경 {st.pending.length}개 보기</summary>
                <div className="mt-2">
                  <Changes list={st.pending} />
                </div>
              </details>
            )}
            <p className="text-[var(--muted)]">
              {v.auto.on ? `새 버전은 매일 ${v.auto.time}에 저절로 올라갑니다.` : "자동 올리기가 꺼져 있어 새 버전은 저절로 올라가지 않습니다."} 지금 바로 올리려면 아래 단추를 누르세요.
            </p>
            {(v.pending || v.running) && (
              <div className="space-y-2 rounded-md bg-[var(--surface-2)] px-3 py-2">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span>
                    {v.pending ? (
                      <>
                        요청함: <b>서버가 받아 가기를 기다리는 중(보통 5초 안)</b>
                      </>
                    ) : (
                      <>
                        올리는 중: <b>{v.progress?.label ?? STAGES[0]}</b>
                      </>
                    )}
                  </span>
                  <span className="text-xs text-[var(--muted)]">
                    {v.progress?.pct ?? 0}% · {v.pending ? `요청 ${fmtTime(v.request?.at)}` : `시작 ${fmtTime(v.request?.taken)}`}
                    {v.progress && v.progress.sinceMin > 0 ? ` · ${v.progress.sinceMin}분 지남` : ""}
                  </span>
                </div>
                <div
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={v.progress?.pct ?? 0}
                  aria-label="새 버전 올리기 진행"
                  className="h-3 overflow-hidden rounded-full bg-[var(--line)]"
                >
                  <div className="h-full rounded-full bg-[var(--accent)] transition-[width] duration-1000" style={{ width: `${Math.max(2, v.progress?.pct ?? 0)}%` }} />
                </div>
                <ol className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
                  {STAGES.map((label, i) => {
                    const at = v.pending ? -1 : (v.progress?.stage ?? 0);
                    return (
                      <li key={label} className={i < at ? "text-[var(--ok)]" : i === at ? "font-semibold" : "text-[var(--muted)]"}>
                        {i < at ? "✓" : i === at ? "●" : "○"} {label}
                      </li>
                    );
                  })}
                </ol>
                <p className="text-xs text-[var(--muted)]">보통 5~10분 걸립니다. &lsquo;바꿔 끼우기&rsquo; 동안 몇 초 앱이 끊기는데, 화면은 그대로 두시면 이어서 보여 줍니다.</p>
              </div>
            )}
            <UpdateWatch active={v.pending || v.running} resultAt={v.result?.at ?? null} ok={!!v.result?.ok} message={v.result?.message ?? ""} />
            {v.result && (
              <p>
                마지막 요청 결과 {fmtTime(v.result.at)}: {v.result.ok ? <Badge tone="ok">성공</Badge> : <Badge tone="danger">실패</Badge>} {v.result.message}
              </p>
            )}
            {st?.lastUpdate && <p className="text-xs text-[var(--muted)]">업데이트 기록 마지막 줄: {st.lastUpdate}</p>}
            {owner ? (
              <form action={requestUpdateAction}>
                <SubmitButton disabled={v.pending || v.running || v.silent || v.upToDate}>지금 새 버전 올리기</SubmitButton>
              </form>
            ) : (
              <p className="text-xs text-[var(--muted)]">새 버전 올리기는 대표가 합니다.</p>
            )}
            {owner && v.upToDate && !v.silent && !v.running && <p className="text-xs text-[var(--muted)]">이미 최신 버전이라 올릴 것이 없습니다. 새 버전이 생기면 단추가 켜지고 대표에게 알림이 갑니다.</p>}
            {owner && v.silent && <p className="text-xs text-[var(--danger)]">서버 소식이 끊겨 지금은 누를 수 없습니다(아래 &lsquo;서버 정보&rsquo; 참고).</p>}
            {owner && (
              <details className="border-t border-[var(--line)] pt-3">
                <summary className="cursor-pointer">
                  <span className="font-medium">자동 올리기</span>{" "}
                  <span className="text-[var(--muted)]">{v.auto.on ? `켜짐 · 매일 ${v.auto.time}` : "꺼짐"} · 바꾸려면 누르세요</span>
                </summary>
                <form action={setAutoUpdateAction} className="mt-2 space-y-2">
                  <RadioRow help="server.autoOn" name="on" required defaultValue={v.auto.on ? "on" : "off"} options={[{ value: "on", label: "켜기", tone: "ok" }, { value: "off", label: "끄기" }]} />
                  <TextField help="server.autoTime" name="time" type="time" required defaultValue={v.auto.time} />
                  <SubmitButton>저장</SubmitButton>
                </form>
              </details>
            )}
          </div>
        </Card>
        <Card title="서버 정보" help={{ kind: "panel", id: "server.info" }}>
          <div
            className={`mb-3 rounded-md border px-3 py-2 text-sm ${v.health.level === "ok" ? "border-[var(--ok)] bg-[var(--ok-soft)]" : v.health.level === "warn" ? "border-[var(--warn)] bg-[var(--warn-soft)]" : "border-[var(--danger)] bg-[var(--danger-soft)]"}`}
          >
            <span className="font-semibold">{v.health.level === "ok" ? "● 정상" : v.health.level === "warn" ? "▲ 주의" : "■ 위험"}</span>
            {v.health.reasons.length > 0 ? <span className="ml-2">{v.health.reasons.join(" · ")}</span> : <span className="ml-2 text-[var(--muted)]">온도·SSD·공간·프로그램 모두 괜찮습니다</span>}
          </div>
          {v.silent && (
            <p className="mb-3 rounded-md border border-[var(--warn)] bg-[var(--warn-soft)] px-3 py-2 text-sm">
              {v.silentMin == null
                ? "서버가 아직 상태를 알려 오지 않았습니다. 미니 PC에서 설명서의 '원격 관리 켜기' 명령을 한 번 실행하세요."
                : `서버 소식이 ${v.silentMin}분째 없습니다(${SILENT_MIN}분 넘으면 표시). 미니 PC 전원·자택 인터넷을 확인하세요. 앱이 열린다면 상태 알림만 멈춘 것입니다.`}
            </p>
          )}
          {st ? (
            <>
              <dl className="grid grid-cols-[7rem_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm">
                {rows.map(([k, val]) => (
                  <div key={k} className="contents">
                    <dt className="text-[var(--muted)]">{k}</dt>
                    <dd className="break-words">{val}</dd>
                  </div>
                ))}
                <dt className="text-[var(--muted)]">마지막 백업</dt>
                <dd className="break-words">{st.lastBackup || "-"}</dd>
              </dl>
              <p className="mt-2 text-xs text-[var(--muted)]">서버가 알려 온 때 {fmtTime(st.at)} · 이 화면은 1분마다 저절로 새로 받습니다.</p>
            </>
          ) : null}
        </Card>
      </div>
      {owner && (
        <div className="mt-4" id="security">
          <Card title="보안(공격 막기)" help={{ kind: "panel", id: "server.security" }}>
            <div className="space-y-3 text-sm">
              <p>
                지금 막고 있는 주소 <b>{sec.blocks.length}</b>개 · 오늘 새로 막음 <b>{sec.todayBlocks}</b>번 · 외국 접속 막기{" "}
                {sec.geoOn ? <Badge tone="ok">켜짐</Badge> : <Badge>꺼짐</Badge>}
              </p>
              <p className="text-xs text-[var(--muted)]">
                자동으로 막는 기준: 한 주소에서 {RULES.loginWindowMin}분 안에 로그인 실패 {RULES.loginFails}번(1시간), 1분에 요청 {RULES.floodPerMin}번(1시간), 1분에 취약점 찾기 {RULES.scanPerMin}번(하루). 막으면 대표에게 알림이 갑니다. 공유기 안 주소와 서버 자신의 주소는 막지 않습니다.
              </p>
              {sec.blocks.length > 0 && (
                <ul className="divide-y divide-[var(--line)] rounded-md border border-[var(--line)]">
                  {sec.blocks.map((b) => (
                    <li key={b.ip} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                      <span>
                        <b className="font-mono">{b.ip}</b> <span className="text-[var(--muted)]">{b.reason} · {fmtTime(b.until)}까지</span>
                      </span>
                      <form action={unblockIpAction}>
                        <input type="hidden" name="ip" value={b.ip} />
                        <SubmitButton variant="secondary">풀기</SubmitButton>
                      </form>
                    </li>
                  ))}
                </ul>
              )}
              <details className="border-t border-[var(--line)] pt-3">
                <summary className="cursor-pointer">
                  <span className="font-medium">외국 접속 막기</span> <span className="text-[var(--muted)]">{sec.geoOn ? "켜짐" : "꺼짐"} · 바꾸려면 누르세요</span>
                </summary>
                <form action={setGeoBlockAction} className="mt-2 space-y-2">
                  <RadioRow help="server.geoBlock" name="geo" required defaultValue={sec.geoOn ? "on" : "off"} options={[{ value: "on", label: "켜기(국내만)", tone: "ok" }, { value: "off", label: "끄기" }]} />
                  <p className="text-xs text-[var(--muted)]">
                    {sec.kr ? `국내 주소 목록 ${sec.kr.n.toLocaleString("ko-KR")}묶음 · ${fmtTime(sec.kr.at)} 받음(한 주마다 새로 받음)` : "국내 주소 목록을 아직 받지 못했습니다. 서버가 받아 오면 켤 수 있습니다."}
                  </p>
                  <SubmitButton>저장</SubmitButton>
                </form>
              </details>
              <details className="border-t border-[var(--line)] pt-3">
                <summary className="cursor-pointer">
                  <span className="font-medium">주소 직접 막기</span> <span className="text-[var(--muted)]">오류 기록·접속에서 수상한 주소를 막습니다</span>
                </summary>
                <form action={blockIpAction} className="mt-2 space-y-2">
                  <TextField help="server.blockIp" name="ip" required />
                  <NumberField help="server.blockHours" name="hours" required defaultValue={24} unit="시간" min={1} max={8760} />
                  <SubmitButton>막기</SubmitButton>
                </form>
              </details>
              {sec.log.length > 0 && (
                <details className="border-t border-[var(--line)] pt-3">
                  <summary className="cursor-pointer">최근 차단 기록 {sec.log.length}건</summary>
                  <ul className="mt-2 space-y-1 text-xs">
                    {sec.log.slice(0, 30).map((b, i) => (
                      <li key={`${b.ip}-${b.at}-${i}`}>
                        <span className="text-[var(--muted)]">{fmtTime(b.at)}</span> <span className="font-mono">{b.ip}</span> {b.reason}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
              {v.ddns.length > 0 && (
                <details className="border-t border-[var(--line)] pt-3">
                  <summary className="cursor-pointer">앱 주소 자동 고치기 기록 {v.ddns.length}건</summary>
                  <ul className="mt-2 space-y-1 text-xs">
                    {v.ddns.map((e, i) => (
                      <li key={`${e.at}-${i}`}>
                        <span className="text-[var(--muted)]">{e.at}</span> {e.kind === "changed" ? <Badge tone="accent">바뀜</Badge> : <Badge tone="danger">실패</Badge>} {e.message}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          </Card>
        </div>
      )}
      <div className="mt-4">
        <Card title="24시간 흐름" help={{ kind: "panel", id: "server.trend" }}>
          {v.series.length ? (
            <>
              <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2 xl:grid-cols-3">
                {charts.map((c) => (
                  <Spark key={c.title} title={c.title} kind={c.kind} points={grid(v.series, now, c.pick)} />
                ))}
              </div>
              <p className="mt-3 text-xs text-[var(--muted)]">5분마다 한 점입니다. 그래프에 마우스나 손가락을 대면 그때 값이 나옵니다. 선이 끊긴 곳은 서버 소식이 없던 때입니다.</p>
              {hours.length > 0 && (
                <details className="mt-3 text-sm">
                  <summary className="cursor-pointer">표로 보기(1시간 단위)</summary>
                  <div className="mt-2 overflow-x-auto">
                    <table className="w-full text-right text-xs tabular-nums">
                      <thead className="text-[var(--muted)]">
                        <tr>
                          <th className="py-1 text-left font-normal">시각</th>
                          {direct && <th className="font-normal">요청</th>}
                          {direct && <th className="font-normal">오류</th>}
                          <th className="font-normal">{direct ? "느린 쪽" : "앱 응답"}</th>
                          <th className="font-normal">보낸</th>
                          <th className="font-normal">받은</th>
                          <th className="font-normal">CPU</th>
                        </tr>
                      </thead>
                      <tbody>
                        {hours.map((h) => (
                          <tr key={h.at} className="border-t border-[var(--line)]">
                            <td className="py-1 text-left">{h.at}</td>
                            {direct && <td>{h.reqs >= 0 ? h.reqs.toLocaleString("ko-KR") : "-"}</td>}
                            {direct && <td>{h.errors >= 0 ? h.errors : "-"}</td>}
                            <td>{(direct ? h.p95 : h.app) >= 0 ? fmtValue("ms", direct ? h.p95 : h.app) : "-"}</td>
                            <td>{h.tx >= 0 ? fmtBytes(h.tx) : "-"}</td>
                            <td>{h.rx >= 0 ? fmtBytes(h.rx) : "-"}</td>
                            <td>{h.cpu >= 0 ? `${h.cpu}%` : "-"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              )}
            </>
          ) : (
            <p className="text-sm text-[var(--muted)]">아직 모인 기록이 없습니다. 서버가 1분마다 알려 오는 값을 5분 칸으로 모아 24시간까지 보여 줍니다.</p>
          )}
        </Card>
      </div>
      <div className="mt-4">
        <Card title="업데이트 이력" help={{ kind: "panel", id: "server.history" }}>
          {v.history.length ? (
            <ul className="divide-y divide-[var(--line)]">
              {v.history.map((e, i) => (
                <li key={`${e.at}-${i}`} className="py-2">
                  <details>
                    <summary className="flex cursor-pointer flex-wrap items-center gap-2 text-sm">
                      <span className="font-mono text-xs text-[var(--muted)]">{e.at}</span>
                      {e.ok ? <Badge tone="ok">올림</Badge> : <Badge tone="danger">실패</Badge>}
                      <span className="text-xs text-[var(--muted)]">{HOW_LABEL[e.how] ?? e.how}</span>
                      {e.ok ? (
                        <span>
                          <span className="font-mono text-xs">
                            {e.fromLabel || e.from || "?"} → {e.toLabel || e.to}
                          </span>
                          {e.changes.length > 0 && <span className="ml-2 text-xs">변경 {e.changes.length}개</span>}
                        </span>
                      ) : (
                        <span className="text-xs">{e.message}</span>
                      )}
                    </summary>
                    <div className="mt-2 pl-1">{e.ok ? <Changes list={e.changes} /> : <p className="text-xs text-[var(--muted)]">이전 버전이 그대로 돌고 있습니다. 계속 실패하면 Claude에게 이 화면을 보여 주세요.</p>}</div>
                  </details>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-[var(--muted)]">아직 이력이 없습니다. 서버가 다음 상태 알림 때 그동안의 업데이트 기록을 보내 줍니다.</p>
          )}
        </Card>
      </div>
    </>
  );
}
