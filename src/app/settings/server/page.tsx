import Link from "next/link";
import { getDb } from "@/db/runtime";
import { HOW_LABEL, serverOpsView, SILENT_MIN, type Change } from "@/modules/platform/server-ops";
import { requireUser } from "../../_lib/session";
import { RadioRow, TextField } from "../../_input";
import { SubmitButton } from "../../_submit";
import { Badge, buttonClass, Card, ErrorBox, Notice, PageTitle, fmtTime } from "../../_ui";
import { requestUpdateAction, setAutoUpdateAction } from "./actions";
import { UpdateWatch } from "./_watch";

const PLACE: Record<string, string> = { home: "대표 자택", shop: "정비소", cloud: "클라우드" };
const MODE: Record<string, string> = { direct: "국내 직접 접속", tunnel: "클라우드플레어 터널" };
const REPO = "https://github.com/heoyoungtae/Auto_Body_Shop/pull/";

function Changes({ list }: { list: Change[] }) {
  if (!list.length) return <p className="text-xs text-[var(--muted)]">바뀐 내용 기록이 없습니다.</p>;
  return (
    <ul className="list-disc space-y-0.5 pl-5 text-sm">
      {list.map((c, i) => (
        <li key={i}>
          {c.title}
          {c.pr && (
            <a href={`${REPO}${c.pr}`} target="_blank" rel="noreferrer" className="ml-1 text-xs text-[var(--muted)] hover:underline">
              #{c.pr}
            </a>
          )}
        </li>
      ))}
    </ul>
  );
}

/** 설정 › 서버(대표 요청 2026-11-19): 서버 정보와 '지금 새 버전 올리기'. 서버가 멀리(대표 자택) 있어도 앱에서 한다 */
export default async function ServerSettingsPage({ searchParams }: { searchParams: Promise<{ error?: string; notice?: string }> }) {
  const { error, notice } = await searchParams;
  const user = await requireUser();
  const owner = user.roles.includes("owner");
  const v = await serverOpsView(await getDb());
  const st = v.status;
  const rows: [string, string][] = st
    ? [
        ["위치", `${PLACE[st.place] ?? (st.place || "-")} · ${st.host || "-"}`],
        ["접속 방식", MODE[st.mode] ?? (st.mode || "-")],
        ["앱 버전", st.version || "-"],
        ["가동 시간", `${st.uptime || "-"}${st.bootAt ? ` (켠 때 ${st.bootAt.slice(0, 16)})` : ""}`],
        ["CPU", [st.cpuPct >= 0 ? `${st.cpuPct}% 사용` : "", st.cpuTemp >= 0 ? `온도 ${st.cpuTemp}℃` : ""].filter(Boolean).join(" · ") || "-"],
        ["SSD 건강", st.ssdOk === false ? "자체 진단 실패(교체 준비)" : [st.ssdLife >= 0 ? `수명 ${st.ssdLife}% 남음` : "", st.ssdTemp >= 0 ? `온도 ${st.ssdTemp}℃` : ""].filter(Boolean).join(" · ") || "-"],
        ["다시 켜기", st.rebootNeeded ? "필요(보안 업데이트, 새벽 4시에 저절로)" : "필요 없음"],
        ["디스크(SSD)", st.disk || "-"],
        ["백업 디스크", st.backupDisk || "연결 안 됨"],
        ["메모리", st.memory || "-"],
        ["UPS", st.ups || "연결 안 됨"],
        ["내부 주소", st.lanIp || "-"],
        ["인터넷 주소", st.publicIp || "-"],
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
            <Link href="/help/server-guide" className={buttonClass("secondary")}>
              서버 설명서
            </Link>
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
                지금 <b className="font-mono">{st.version || "-"}</b>
                {st.behind > 0 ? (
                  <>
                    {" "}
                    · <Badge tone="accent">새 버전 {st.behind}개 있음</Badge> <span className="font-mono text-xs text-[var(--muted)]">{st.latest}</span>
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
            {v.pending && <p className="rounded-md bg-[var(--surface-2)] px-3 py-2">요청함 {fmtTime(v.request?.at)}. 서버가 1분 안에 받아 새 버전을 만들기 시작합니다(5~10분). 바꿔 끼우는 몇 초 동안 앱이 끊깁니다.</p>}
            {v.running && <p className="rounded-md bg-[var(--surface-2)] px-3 py-2">올리는 중(시작 {fmtTime(v.request?.taken)}). 보통 5~10분 걸리고, 바꿔 끼우는 몇 초 동안 앱이 끊깁니다.</p>}
            <UpdateWatch active={v.pending || v.running} resultAt={v.result?.at ?? null} ok={!!v.result?.ok} message={v.result?.message ?? ""} />
            {v.result && (
              <p>
                마지막 요청 결과 {fmtTime(v.result.at)}: {v.result.ok ? <Badge tone="ok">성공</Badge> : <Badge tone="danger">실패</Badge>} {v.result.message}
              </p>
            )}
            {st?.lastUpdate && <p className="text-xs text-[var(--muted)]">업데이트 기록 마지막 줄: {st.lastUpdate}</p>}
            {owner ? (
              <form action={requestUpdateAction}>
                <SubmitButton disabled={v.pending || v.running || v.silent}>지금 새 버전 올리기</SubmitButton>
              </form>
            ) : (
              <p className="text-xs text-[var(--muted)]">새 버전 올리기는 대표가 합니다.</p>
            )}
            {owner && v.silent && <p className="text-xs text-[var(--danger)]">서버 소식이 끊겨 지금은 누를 수 없습니다(아래 &lsquo;서버 정보&rsquo; 참고).</p>}
            {owner && (
              <form action={setAutoUpdateAction} className="space-y-2 border-t border-[var(--line)] pt-3">
                <p className="font-medium">자동 올리기</p>
                <RadioRow help="server.autoOn" name="on" required defaultValue={v.auto.on ? "on" : "off"} options={[{ value: "on", label: "켜기", tone: "ok" }, { value: "off", label: "끄기" }]} />
                <TextField help="server.autoTime" name="time" type="time" required defaultValue={v.auto.time} />
                <SubmitButton>저장</SubmitButton>
              </form>
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
              <p className="mt-2 text-xs text-[var(--muted)]">서버가 알려 온 때 {fmtTime(st.at)} · 1분마다 새로 받습니다.</p>
            </>
          ) : null}
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
                            {e.from || "?"} → {e.to}
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
