// 설정 › 홈페이지 › 첫 화면(대표): 단락 차례·보이기, 배경 어둡기·숫자 칸, 단락마다 머리말·제목·설명·목록 고치기.
// 처음 문구는 modules/site/page-text.ts, 고친 것만 app_config 'site_pages'에 남는다. 배경 사진 고르기는 홈페이지 글 › 후기·사진·인증.
import Link from "next/link";
import { getDb } from "@/db/runtime";
import { loadPolicy } from "@/modules/platform/policy";
import { loadEditing, pagesView } from "@/modules/site/pages";
import { groupKeys, HOME_SECTIONS, TOKENS } from "@/modules/site/page-text";
import { siteUrl } from "@/modules/site/service";
import { homepageHosts } from "@/modules/site/rules";
import { requireUser } from "../../../_lib/session";
import { AssistForm } from "../../../_assist";
import { HelpButton } from "../../../_help-drawer";
import { CheckGroup, NumberField } from "../../../_input";
import { SubmitButton } from "../../../_submit";
import { buttonClass, Card, ErrorBox, Notice, PageTitle } from "../../../_ui";
import { SiteSettingsTabs } from "../_tabs";
import { TextItems, TokenList } from "../_text-items";
import { saveHomeLayoutAction } from "../actions";

export default async function SiteHomeSettingsPage({ searchParams }: { searchParams: Promise<{ error?: string; notice?: string }> }) {
  const { error, notice } = await searchParams;
  await requireUser(["owner"]);
  const db = await getDb();
  const [raw, p] = await Promise.all([loadEditing(db), loadPolicy(db)]);
  const v = pagesView(raw, p);
  const info = Object.fromEntries(HOME_SECTIONS.map((s) => [s.key, s]));
  const open = homepageHosts().length ? siteUrl() : "/site";
  return (
    <>
      <PageTitle
        help="settings.siteHome"
        sub="홈페이지 첫 화면의 단락 차례와 보이기, 단락마다 제목·설명·목록을 고칩니다. 비운 칸은 처음 문구로 돌아갑니다."
        actions={
          <Link href={open} target="_blank" className={buttonClass("secondary")}>
            홈페이지 열기
          </Link>
        }
      >
        홈페이지 첫 화면
      </PageTitle>
      <SiteSettingsTabs on="/settings/site/home" />
      <div className="mb-4 space-y-2">
        <ErrorBox message={error} />
        {notice && <Notice>{notice}</Notice>}
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] xl:items-start">
        <div className="space-y-4">
          <Card title="단락 차례·보이기" help={{ kind: "panel", id: "site.homeLayout" }}>
            <AssistForm id="site-home-layout" action={saveHomeLayoutAction} className="space-y-4">
              <p className="text-sm text-[var(--muted)]">맨 위 배경 단락(큰 글·단추)은 늘 첫째입니다. 그 아래 단락의 차례 숫자를 바꾸고, 숨길 단락은 &lsquo;보임&rsquo;을 끕니다.</p>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--line)] text-left text-[var(--muted)]">
                    <th className="w-20 py-1.5 font-medium">
                      차례 <HelpButton topic={{ kind: "field", id: "site.section.order" }} name="차례" />
                    </th>
                    <th className="py-1.5 font-medium">단락</th>
                    <th className="w-16 py-1.5 text-center font-medium">
                      보임 <HelpButton topic={{ kind: "field", id: "site.section.on" }} name="보임" />
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {v.home.order.map((k, i) => (
                    <tr key={k} className="border-b border-[var(--line)] last:border-0">
                      <td className="py-1.5">
                        <input data-assist="grid" type="number" inputMode="decimal" step="any" min={0} max={99} name={`ord:${k}`} defaultValue={i + 1} aria-label={`${info[k].label} 차례`} className="h-9 w-14 rounded-md border border-[var(--line-strong)] bg-[var(--surface)] px-2 text-center tabular-nums" />
                      </td>
                      <td className="py-1.5">
                        <span className="font-medium">{info[k].label}</span>
                        {"note" in info[k] && <span className="ml-2 text-xs text-[var(--muted)]">{info[k].note}</span>}
                      </td>
                      <td className="py-1.5 text-center">
                        <input data-assist="group" type="checkbox" name="on" value={k} defaultChecked={v.shows(k)} aria-label={`${info[k].label} 보임`} className="size-5" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <NumberField help="site.home.shade" name="shade" defaultValue={v.home.shade} min={40} max={100} unit="%" />
              <CheckGroup help="site.home.stats" name="stats" options={[{ value: "on", label: "배경 아래 숫자 네 칸 보이기" }]} defaultChecked={v.home.stats ? ["on"] : []} />
              <p className="text-xs text-[var(--muted)]">
                배경 사진은{" "}
                <Link href="/homepage/trust" className="text-[var(--accent)] underline">
                  홈페이지 글 › 후기·사진·인증
                </Link>
                에서 고르고, 큰 글·설명은{" "}
                <Link href="/settings/site" className="text-[var(--accent)] underline">
                  기본 정보
                </Link>
                에서 고칩니다.
              </p>
              <SubmitButton>저장</SubmitButton>
            </AssistForm>
          </Card>
          <TextItems id="hero" title="맨 위 배경 단락" keys={groupKeys("home.hero")} raw={raw} back="/settings/site/home" />
          {v.home.order.map((k) => (
            <TextItems key={k} id={k} title={`${info[k].label}${v.shows(k) ? "" : " (숨김)"}`} keys={groupKeys(`home.${k}`)} raw={raw} back="/settings/site/home" />
          ))}
        </div>
        <div className="space-y-4 xl:sticky xl:top-4">
          <TokenList tokens={Object.entries(TOKENS).map(([name, t]) => ({ name, label: t.label, now: t.get(p) }))} />
        </div>
      </div>
    </>
  );
}
