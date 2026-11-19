import Link from "next/link";
import { getDb } from "@/db/runtime";
import { tvLinkView } from "@/modules/dashboard/tv";
import { listBranches, listWorkplaces } from "@/modules/platform/branch";
import { TV_LATE_COLOR, TV_STATE_KEYS, TV_STATES } from "@/modules/dashboard/tv-rules";
import { appUrl } from "@/modules/customer/service";
import { requireUser } from "../../_lib/session";
import { SubmitButton } from "../../_submit";
import { buttonClass, Card, ErrorBox, Notice, PageTitle, fmtTime } from "../../_ui";
import { CopyButton } from "../../money/bank/copy-button";
import { tvLinkAction } from "./actions";

/** TV 현황판 연결(대표 결정 2026-11-18): 로그인 없는 읽기 전용 링크와 TV에 띄우는 방법 */
export default async function TvSettingsPage({ searchParams }: { searchParams: Promise<{ error?: string; notice?: string }> }) {
  const { error, notice } = await searchParams;
  const user = await requireUser();
  const db = await getDb();
  const v = await tvLinkView(db, user);
  const url = v.token ? `${appUrl()}/tv?k=${v.token}` : null;
  // 지점·작업장만 보는 TV 링크(같은 열쇠에 b=·w= 를 붙임). 지점은 둘 이상일 때만
  const [branches, wps] = await Promise.all([listBranches(db), listWorkplaces(db, { activeOnly: true })]);
  const scoped = [
    ...(branches.length > 1 ? branches.map((b) => ({ key: `b-${b.id}`, label: `${b.name} 전체`, q: `b=${b.id}` })) : []),
    ...wps.filter((w) => w.bays > 0).map((w) => ({ key: `w-${w.id}`, label: `${w.name}만`, q: `w=${w.id}` })),
  ];
  return (
    <>
      <PageTitle
        help="settings.tv"
        sub="공장 TV에 정비 현황판을 띄우는 링크와 방법입니다. 고객 이름·연락처·금액은 나오지 않습니다."
        actions={
          <Link href="/tv" className={buttonClass("secondary")}>
            현황판 열기
          </Link>
        }
      >
        TV 현황판 연결
      </PageTitle>
      <div className="mb-4 space-y-2">
        <ErrorBox message={error} />
        {notice && <Notice>{notice}</Notice>}
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] xl:items-start">
        <Card title="TV 링크" help={{ kind: "panel", id: "tv.link" }}>
          {v.canEdit ? (
            <div className="space-y-2 text-sm">
              {url ? (
                <>
                  <p className="break-all rounded-md bg-[var(--surface-2)] px-3 py-2 font-mono text-xs">{url}</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <CopyButton text={url} label="링크 복사" />
                    <a href={url} target="_blank" rel="noreferrer" className={buttonClass("secondary")}>
                      새 창으로 열기
                    </a>
                    <form action={tvLinkAction}>
                      <input type="hidden" name="intent" value="issue" />
                      <SubmitButton variant="danger">새로 만들기(예전 링크 막기)</SubmitButton>
                    </form>
                    <form action={tvLinkAction}>
                      <input type="hidden" name="intent" value="revoke" />
                      <SubmitButton variant="secondary">링크 끊기</SubmitButton>
                    </form>
                  </div>
                  <p className="text-xs text-[var(--muted)]">만든 때 {v.at ? fmtTime(v.at) : "-"}. 링크를 아는 사람은 누구나 현황판을 볼 수 있습니다.</p>
                </>
              ) : (
                <form action={tvLinkAction}>
                  <input type="hidden" name="intent" value="issue" />
                  <SubmitButton>TV 링크 만들기</SubmitButton>
                </form>
              )}
            </div>
          ) : (
            <p className="text-sm text-[var(--muted)]">{v.made ? "TV 링크가 만들어져 있습니다." : "아직 TV 링크가 없습니다."} 링크는 대표가 만들고 관리합니다. 직원은 메뉴의 TV 현황판으로 봅니다.</p>
          )}
        </Card>
        {scoped.length > 0 && (
          <Card title="작업장·지점만 보는 링크" help={{ kind: "panel", id: "tv.scoped" }}>
            <p className="mb-2 text-sm text-[var(--muted)]">도장 부스 앞 TV처럼 한 곳의 차만 띄울 때 씁니다. 그 작업장에 아직 안 끝난 공정이 있는 차만 나옵니다.</p>
            <ul className="space-y-2 text-sm">
              {scoped.map((x) => {
                const link = url ? `${url}&${x.q}` : null;
                return (
                  <li key={x.key} className="flex flex-wrap items-center gap-2">
                    <b className="min-w-32">{x.label}</b>
                    <Link href={`/tv?${x.q}`} className="text-[var(--accent)] hover:underline">
                      앱에서 열기
                    </Link>
                    {link && v.canEdit && <CopyButton text={link} label="TV 링크 복사" />}
                  </li>
                );
              })}
            </ul>
            {!url && v.canEdit && <p className="mt-2 text-xs text-[var(--muted)]">TV 링크를 먼저 만들면 여기서 작업장별 TV 링크를 복사할 수 있습니다.</p>}
          </Card>
        )}
        <Card title="TV에 띄우는 방법" help={{ kind: "panel", id: "tv.howto" }}>
          <ol className="list-decimal space-y-1 pl-5 text-sm">
            <li>
              <b>미니 PC에 HDMI로 꽂기(권장)</b>: 사업장 미니 PC 브라우저에서 TV 링크를 열고 ⛶ 전체화면(F 키)을 누릅니다. 브라우저 시작 페이지를 이 링크로 두면 정전 뒤에도 다시 뜹니다.
            </li>
            <li>
              <b>크롬캐스트·구글 TV</b>: PC와 TV를 같은 와이파이에 두고, 크롬에서 TV 링크를 연 뒤 ⋮ → 저장 및 공유 → 전송 → 탭 전송에서 TV를 고릅니다.
            </li>
            <li>TV는 절전·자동 꺼짐을 끄고 입력을 HDMI로 고정합니다. 퇴근 뒤에는 TV 전원을 꺼 두세요(현황판도 1분마다 화면을 조금씩 옮기고 밤 22시~6시에는 어둡게 해서 화면이 타는 것을 막습니다).</li>
          </ol>
          <p className="mt-3 mb-1 text-xs font-semibold text-[var(--muted)]">상태와 색</p>
          <ul className="grid gap-1 text-sm sm:grid-cols-2">
            {TV_STATE_KEYS.map((k) => (
              <li key={k} className="flex items-center gap-2">
                <span aria-hidden className="inline-block h-3 w-5 rounded-sm" style={TV_STATES[k].outline ? { border: `2px dashed ${TV_STATES[k].color}` } : { background: TV_STATES[k].color }} />
                <span>
                  {TV_STATES[k].icon} {TV_STATES[k].label} <span className="text-xs text-[var(--muted)]">· {TV_STATES[k].help}</span>
                </span>
              </li>
            ))}
            <li className="flex items-center gap-2">
              <span aria-hidden className="inline-block h-3 w-5 rounded-sm" style={{ border: `2px solid ${TV_LATE_COLOR}` }} />
              <span>
                ⚠ 지연 <span className="text-xs text-[var(--muted)]">· 출고 약속일이 지나면 어떤 상태든 덧붙음</span>
              </span>
            </li>
          </ul>
        </Card>
      </div>
    </>
  );
}
