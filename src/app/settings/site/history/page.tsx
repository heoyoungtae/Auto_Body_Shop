// 설정 › 홈페이지 › 공개·이력(대표): 공개 전 고침(바뀐 곳·미리 보기·공개하기·버리기)과 지난 판 20개. 지난 판은 '공개 전 고침으로 가져오기' 뒤 공개하면 되돌아간다.
import Link from "next/link";
import { getDb } from "@/db/runtime";
import { appUser } from "@/db/schema";
import { inArray } from "drizzle-orm";
import { draftState, HISTORY_MAX, pagesHistory } from "@/modules/site/pages";
import { pageTextDef } from "@/modules/site/page-text";
import { requireUser } from "../../../_lib/session";
import { SubmitButton } from "../../../_submit";
import { Card, ErrorBox, Notice, PageTitle } from "../../../_ui";
import { SiteSettingsTabs } from "../_tabs";
import { previewOffAction, restoreAction } from "../actions";

/** 바뀐 곳 이름(화면 글 key → '수리 안내 › 고치는 방법' 같은 칸 이름) */
function placeName(k: string) {
  if (k === "home") return "첫 화면 단락 차례·보이기";
  if (k === "nav") return "위 메뉴";
  if (k === "foot") return "바닥글 링크";
  const d = pageTextDef(k);
  const area = k.startsWith("home.")
    ? "첫 화면"
    : k.startsWith("services.")
      ? "수리 안내"
      : k.startsWith("carbook.")
        ? "내 차 수첩 설명서"
        : k.startsWith("insurance.")
          ? "보험 수리 안내"
          : k.startsWith("guide.")
            ? "이용 안내"
            : k.startsWith("about.")
              ? "공업사 소개"
              : k.startsWith("terms.")
                ? "이용약관"
                : "바닥글";
  return `${area} › ${d?.label ?? k}`;
}

function Places({ keys }: { keys: string[] }) {
  const names = [...new Set(keys.map(placeName))];
  return (
    <span className="text-[var(--muted)]">
      {names.slice(0, 6).join(", ")}
      {names.length > 6 && ` 외 ${names.length - 6}곳`}
    </span>
  );
}

export default async function SiteHistoryPage({ searchParams }: { searchParams: Promise<{ error?: string; notice?: string }> }) {
  const { error, notice } = await searchParams;
  await requireUser(["owner"]);
  const db = await getDb();
  const [changed, items] = await Promise.all([draftState(db), pagesHistory(db)]);
  const ids = [...new Set(items.map((x) => x.by))];
  const names = new Map((ids.length ? await db.select({ id: appUser.id, name: appUser.name }).from(appUser).where(inArray(appUser.id, ids)) : []).map((u) => [u.id, u.name]));
  return (
    <>
      <PageTitle help="settings.siteHistory" sub="첫 화면·화면 글·메뉴에서 고친 것은 여기서 공개합니다. 공개할 때마다 그 전 판이 이력에 남아 언제든 되돌릴 수 있습니다.">
        홈페이지 공개·이력
      </PageTitle>
      <SiteSettingsTabs on="/settings/site/history" />
      <div className="mb-4 space-y-2">
        <ErrorBox message={error} />
        {notice && <Notice>{notice}</Notice>}
      </div>
      <div className="grid gap-4 xl:grid-cols-2 xl:items-start">
        <Card title="공개 전 고침" help={{ kind: "panel", id: "site.draft" }}>
          {changed ? (
            <div className="space-y-3 text-sm">
              <p>
                바뀐 곳 {changed.length}개: <Places keys={changed} />
              </p>
              <p className="text-[var(--muted)]">위 줄의 &lsquo;미리 보기&rsquo;를 누르면 이 브라우저에서만 2시간 동안 고친 홈페이지가 보입니다. 확인했으면 &lsquo;공개하기&rsquo;를 누르세요.</p>
            </div>
          ) : (
            <p className="text-sm text-[var(--muted)]">공개 전 고침이 없습니다. 홈페이지는 마지막으로 공개한 그대로입니다.</p>
          )}
          <form action={previewOffAction} className="mt-3">
            <SubmitButton variant="secondary">미리 보기 끄기</SubmitButton>
          </form>
        </Card>
        <Card title={`지난 판(최근 ${HISTORY_MAX}개)`} help={{ kind: "panel", id: "site.history" }}>
          {items.length ? (
            <ol className="divide-y divide-[var(--line)] text-sm">
              {items.map((x) => (
                <li key={x.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
                  <div className="mr-auto min-w-0">
                    <p className="font-medium tabular-nums">
                      {new Date(x.at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", dateStyle: "medium", timeStyle: "short" })} 공개 전 판 · {names.get(x.by) ?? "알 수 없음"}
                    </p>
                    <p className="mt-0.5">
                      그때 바꾼 곳 {x.changed.length}개{x.changed.length > 0 && ": "}
                      <Places keys={x.changed} />
                    </p>
                  </div>
                  <form action={restoreAction}>
                    <input type="hidden" name="id" value={x.id} />
                    <SubmitButton variant="secondary">이 판 가져오기</SubmitButton>
                  </form>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-[var(--muted)]">
              아직 공개한 적이 없습니다. 고친 것을 처음 공개하면 그 전 판(처음 문구)이 여기 남습니다.{" "}
              <Link href="/settings/site/home" className="text-[var(--accent)] underline">
                첫 화면 고치기
              </Link>
            </p>
          )}
        </Card>
      </div>
    </>
  );
}
