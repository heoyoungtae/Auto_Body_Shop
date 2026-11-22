// 설정 › 홈페이지 › 메뉴·바닥글(대표): 위 메뉴(이름·차례·보이기·NEW 표시)와 바닥글 'INFORMATION' 줄. 개인정보 처리방침은 법으로 늘 보여 고정.
import Link from "next/link";
import { getDb } from "@/db/runtime";
import { sitePages } from "@/modules/site/pages";
import { FOOT_PAGES, NAV_MAX, NAV_PAGES } from "@/modules/site/page-text";
import { siteUrl } from "@/modules/site/service";
import { homepageHosts } from "@/modules/site/rules";
import { requireUser } from "../../../_lib/session";
import { AssistForm } from "../../../_assist";
import { HelpButton } from "../../../_help-drawer";
import { SubmitButton } from "../../../_submit";
import { buttonClass, Card, ErrorBox, Notice, PageTitle } from "../../../_ui";
import { SiteSettingsTabs } from "../_tabs";
import { saveMenuAction } from "../actions";

const box = "h-9 rounded-md border border-[var(--line-strong)] bg-[var(--surface)] px-2";

function LinkRows({ prefix, rows, pages, withNew }: { prefix: "nav" | "foot"; rows: { href: string; label: string; on: boolean; isNew?: boolean }[]; pages: readonly { href: string; name: string }[]; withNew?: boolean }) {
  const name = (href: string) => pages.find((p) => p.href === href)?.name ?? href;
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-[var(--line)] text-left text-[var(--muted)]">
          <th className="w-16 py-1.5 font-medium">
            차례 <HelpButton topic={{ kind: "field", id: "site.section.order" }} name="차례" />
          </th>
          <th className="py-1.5 font-medium">화면</th>
          <th className="py-1.5 font-medium">
            보일 이름 <HelpButton topic={{ kind: "field", id: "site.nav.label" }} name="보일 이름" />
          </th>
          <th className="w-14 py-1.5 text-center font-medium">
            보임 <HelpButton topic={{ kind: "field", id: "site.section.on" }} name="보임" />
          </th>
          {withNew && (
            <th className="w-14 py-1.5 text-center font-medium">
              NEW <HelpButton topic={{ kind: "field", id: "site.nav.new" }} name="NEW 표시" />
            </th>
          )}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={r.href} className="border-b border-[var(--line)] last:border-0">
            <td className="py-1.5">
              <input data-assist="grid" type="number" inputMode="decimal" step="any" min={0} max={99} name={`${prefix}:ord:${r.href}`} defaultValue={i + 1} aria-label={`${name(r.href)} 차례`} className={`${box} w-12 text-center tabular-nums`} />
            </td>
            <td className="py-1.5 text-[var(--muted)]">{name(r.href)}</td>
            <td className="py-1.5 pr-2">
              <input data-assist="grid" name={`${prefix}:label:${r.href}`} defaultValue={r.label} maxLength={20} placeholder={name(r.href)} aria-label={`${name(r.href)} 보일 이름`} className={`${box} w-full`} />
            </td>
            <td className="py-1.5 text-center">
              <input data-assist="group" type="checkbox" name={`${prefix}:on`} value={r.href} defaultChecked={r.on} aria-label={`${name(r.href)} 보임`} className="size-5" />
            </td>
            {withNew && (
              <td className="py-1.5 text-center">
                <input data-assist="group" type="checkbox" name={`${prefix}:new`} value={r.href} defaultChecked={!!r.isNew} aria-label={`${name(r.href)} NEW 표시`} className="size-5" />
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default async function SiteMenuSettingsPage({ searchParams }: { searchParams: Promise<{ error?: string; notice?: string }> }) {
  const { error, notice } = await searchParams;
  await requireUser(["owner"]);
  const v = await sitePages(await getDb(), true);
  const open = homepageHosts().length ? siteUrl() : "/site";
  return (
    <>
      <PageTitle
        help="settings.siteMenu"
        sub="홈페이지 위 메뉴와 맨 아래 바닥글 링크의 이름·차례·보이기를 정합니다."
        actions={
          <Link href={open} target="_blank" className={buttonClass("secondary")}>
            홈페이지 열기
          </Link>
        }
      >
        홈페이지 메뉴·바닥글
      </PageTitle>
      <SiteSettingsTabs on="/settings/site/menu" />
      <div className="mb-4 space-y-2">
        <ErrorBox message={error} />
        {notice && <Notice>{notice}</Notice>}
      </div>
      <AssistForm id="site-menu" action={saveMenuAction} className="grid gap-4 xl:grid-cols-2 xl:items-start">
        <Card title="위 메뉴" help={{ kind: "panel", id: "site.menuNav" }}>
          <p className="mb-2 text-sm text-[var(--muted)]">넓은 화면 한 줄에 {NAV_MAX}개까지 보입니다. 휴대폰에서는 오른쪽 위 메뉴 단추 안에 같은 차례로 보입니다. &lsquo;견적 요청&rsquo; 단추는 늘 있습니다.</p>
          <LinkRows prefix="nav" rows={v.nav} pages={NAV_PAGES} withNew />
        </Card>
        <Card title="바닥글 링크" help={{ kind: "panel", id: "site.menuFoot" }}>
          <p className="mb-2 text-sm text-[var(--muted)]">
            &lsquo;개인정보 처리방침&rsquo;은 법으로 늘 보여야 해서 맨 위에 고정입니다. 바닥글 소개 한 줄은{" "}
            <Link href="/settings/site/pages?g=footer" className="text-[var(--accent)] underline">
              화면 글 › 바닥글
            </Link>
            에서 고칩니다.
          </p>
          <LinkRows prefix="foot" rows={v.foot} pages={FOOT_PAGES} />
        </Card>
        <div className="xl:col-span-2">
          <SubmitButton>저장</SubmitButton>
        </div>
      </AssistForm>
    </>
  );
}
