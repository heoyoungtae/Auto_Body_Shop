// 설정 › 홈페이지 › 화면 글(대표): 수리 안내(분야마다)·내 차 수첩 설명서(장마다)·보험 수리 안내·이용 안내·정비소 소개·바닥글의 문구와 목록을 고친다(첫 화면은 '첫 화면' 탭).
import Link from "next/link";
import { getDb } from "@/db/runtime";
import { loadPolicy } from "@/modules/platform/policy";
import { loadEditing } from "@/modules/site/pages";
import { groupKeys, TEXT_GROUPS, TOKENS } from "@/modules/site/page-text";
import { siteUrl } from "@/modules/site/service";
import { homepageHosts } from "@/modules/site/rules";
import { requireUser } from "../../../_lib/session";
import { buttonClass, ErrorBox, Notice, PageTitle } from "../../../_ui";
import { SiteSettingsTabs } from "../_tabs";
import { TextItems, TokenList } from "../_text-items";

export default async function SitePagesSettingsPage({ searchParams }: { searchParams: Promise<{ g?: string; error?: string; notice?: string }> }) {
  const { g, error, notice } = await searchParams;
  await requireUser(["owner"]);
  const db = await getDb();
  const [raw, p] = await Promise.all([loadEditing(db), loadPolicy(db)]);
  const group = TEXT_GROUPS.find((x) => x.id === g) ?? TEXT_GROUPS[0];
  const base = homepageHosts().length ? siteUrl() : "/site";
  const back = `/settings/site/pages?g=${group.id}`;
  return (
    <>
      <PageTitle
        help="settings.sitePages"
        sub="홈페이지 화면마다 박혀 있던 문구와 목록을 고칩니다. 비운 칸은 처음 문구로 돌아가고, 숫자 기준은 {도장보증}처럼 적으면 정책값이 들어갑니다."
        actions={
          <Link href={`${base}${group.path === "/" ? "" : group.path}`} target="_blank" className={buttonClass("secondary")}>
            이 화면 열기
          </Link>
        }
      >
        홈페이지 화면 글
      </PageTitle>
      <SiteSettingsTabs on="/settings/site/pages" back={back} />
      <nav aria-label="화면 고르기" className="mb-4 flex flex-wrap gap-1.5">
        {TEXT_GROUPS.map((x) => (
          <Link key={x.id} href={`/settings/site/pages?g=${x.id}`} aria-current={x.id === group.id ? "page" : undefined} className={`rounded-full border px-3 py-1.5 text-sm ${x.id === group.id ? "border-[var(--accent)] bg-[var(--accent-soft)] font-semibold text-[var(--accent)]" : "border-[var(--line)] hover:border-[var(--fg)]"}`}>
            {x.title}
          </Link>
        ))}
      </nav>
      <div className="mb-4 space-y-2">
        <ErrorBox message={error} />
        {notice && <Notice>{notice}</Notice>}
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] xl:items-start">
        <div className="space-y-4">
          {group.parts ? (
            group.parts.map((x) => <TextItems key={x.id} id={x.id} title={x.title} keys={x.keys} raw={raw} back={back} />)
          ) : (
            <TextItems id={group.id} title={group.title} keys={groupKeys(group.id)} raw={raw} back={back} />
          )}
        </div>
        <div className="space-y-4 xl:sticky xl:top-4">
          <TokenList tokens={Object.entries(TOKENS).map(([name, t]) => ({ name, label: t.label, now: t.get(p) }))} />
        </div>
      </div>
    </>
  );
}
