// 홈페이지 › 공지사항 관리: 게시 기간(끝나면 저절로 내려감), 맨 위 고정, 첫 화면 띠, 내 차 수첩 알림, 광고 표시.
import Link from "next/link";
import { getDb } from "@/db/runtime";
import { rolesFor } from "@/modules/auth/permissions";
import { listNotices, noticeTitle } from "@/modules/site/content";
import { siteUrl } from "@/modules/site/service";
import { homepageHosts } from "@/modules/site/rules";
import { seoulDate } from "@/modules/platform/time";
import { requireUser } from "../../_lib/session";
import { AssistForm } from "../../_assist";
import { CheckGroup, DateField, TextAreaField, TextField } from "../../_input";
import { SubmitButton } from "../../_submit";
import { Badge, buttonClass, Card, Empty, ErrorBox, Notice, PageTitle, fmtTime } from "../../_ui";
import { HomepageTabs } from "../_tabs";
import { deleteNoticeAction, saveNoticeAction } from "../actions";

type Row = Awaited<ReturnType<typeof listNotices>>[number];
function stateOf(n: Row, today: string): { label: string; tone: "ok" | "warn" | "neutral" } {
  if (!n.published) return { label: "공개 안 함", tone: "warn" };
  if (n.startsOn > today) return { label: `${n.startsOn.slice(5).replace("-", "/")}부터`, tone: "neutral" };
  if (n.endsOn && n.endsOn < today) return { label: "기간 끝남", tone: "neutral" };
  return { label: "게시 중", tone: "ok" };
}

export default async function NoticeAdminPage({ searchParams }: { searchParams: Promise<{ edit?: string; error?: string; notice?: string }> }) {
  const { edit, error, notice } = await searchParams;
  await requireUser([...rolesFor("consult.write")]);
  const rows = await listNotices(await getDb());
  const today = seoulDate();
  const cur = edit ? rows.find((r) => r.id === edit) : undefined;
  const site = homepageHosts().length ? siteUrl() : "/site";
  const opts = cur ? [cur.pinned && "pinned", cur.banner && "banner", cur.notifyCarbook && "notify", cur.ad && "ad"].filter((x): x is string => !!x) : [];
  return (
    <>
      <PageTitle
        help="homepage.notice"
        sub="휴무·영업시간 변경·이벤트 같은 소식을 홈페이지에 올립니다. 게시 기간이 끝나면 저절로 내려갑니다."
        actions={
          <Link href={`${site}/notice`} target="_blank" className={buttonClass("secondary")}>
            홈페이지에서 보기
          </Link>
        }
      >
        공지사항
      </PageTitle>
      <HomepageTabs on="/homepage/notice" />
      <div className="mb-4 space-y-2">
        <ErrorBox message={error} />
        {notice && <Notice>{notice}</Notice>}
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] xl:items-start">
        <Card title={`공지 ${rows.length}건`} help={{ kind: "panel", id: "homepage.noticeList" }}>
          {!rows.length ? (
            <Empty>아직 공지가 없습니다. 오른쪽에서 첫 공지를 쓰세요(예: 개업 안내, 설 연휴 휴무).</Empty>
          ) : (
            <ul className="divide-y divide-[var(--line)] rounded-md border border-[var(--line)]">
              {rows.map((n) => {
                const st = stateOf(n, today);
                return (
                  <li key={n.id} className={`px-3 py-2 text-sm ${n.id === edit ? "bg-[var(--accent-soft)]" : ""}`}>
                    <div className="flex flex-wrap items-center gap-2">
                      <Link href={`/homepage/notice?edit=${n.id}`} className="min-w-0 flex-1 font-medium hover:underline">
                        {n.pinned && <span className="mr-1 text-[var(--accent)]">[고정]</span>}
                        {noticeTitle(n)}
                      </Link>
                      {n.banner && <Badge tone="accent">첫 화면 띠</Badge>}
                      <Badge tone={st.tone}>{st.label}</Badge>
                    </div>
                    <p className="mt-0.5 text-xs text-[var(--muted)]">
                      {n.startsOn} ~ {n.endsOn ?? "계속"} · 읽음 {n.views}
                      {n.notifyCarbook && (n.notifiedAt ? ` · 수첩 알림 ${n.notifiedCount ?? 0}명(${fmtTime(n.notifiedAt)})` : " · 수첩 알림 보낼 예정")}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
        <Card title={cur ? "공지 고치기" : "새 공지 쓰기"} help={{ kind: "panel", id: "homepage.noticeForm" }}>
          <AssistForm id={`notice-${cur?.id ?? "new"}`} action={saveNoticeAction} className="space-y-4">
            {cur && <input type="hidden" name="id" value={cur.id} />}
            <TextField help="homepage.noticeTitle" name="title" required defaultValue={cur?.title ?? ""} />
            <TextAreaField help="homepage.noticeBody" name="body" required rows={8} defaultValue={cur?.body ?? ""} />
            <DateField help="homepage.noticeStarts" name="startsOn" required defaultValue={cur?.startsOn ?? today} quick={["today", "tomorrow"]} />
            <DateField help="homepage.noticeEnds" name="endsOn" defaultValue={cur?.endsOn ?? ""} min={today} quick={["week", "nextMonth"]} />
            <CheckGroup
              help="homepage.noticeOpts"
              name="opts"
              options={[
                { value: "pinned", label: "목록 맨 위에 고정" },
                { value: "banner", label: "첫 화면 위 띠에 한 줄로" },
                { value: "notify", label: cur?.notifiedAt ? "내 차 수첩 알림(이미 보냄)" : "내 차 수첩 알림 보내기(한 번)" },
                { value: "ad", label: "광고(할인·이벤트)" },
              ]}
              defaultChecked={opts}
            />
            <CheckGroup help="homepage.publish" name="published" options={[{ value: "on", label: "홈페이지에 공개" }]} defaultChecked={!cur || cur.published ? ["on"] : []} />
            <div className="flex flex-wrap items-center gap-2">
              <SubmitButton>저장</SubmitButton>
              {cur && (
                <Link href="/homepage/notice" className={buttonClass("secondary")}>
                  새 공지 쓰기
                </Link>
              )}
            </div>
          </AssistForm>
          {cur && (
            <form action={deleteNoticeAction} className="mt-3 border-t border-[var(--line)] pt-3">
              <input type="hidden" name="id" value={cur.id} />
              <button className="text-sm text-[var(--danger)] underline">이 공지 지우기</button>
            </form>
          )}
        </Card>
      </div>
    </>
  );
}
