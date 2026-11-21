// 홈페이지 › 기술자료 관리: 분야별 목록(공개·초안·본 횟수), 고치기·새로 쓰기, 처음 초안 17편 불러오기.
// 손님은 홈페이지 '기술자료'에서 읽기만 한다. 공개 글 앞 세 편은 홈 첫 화면에도 보인다.
import Link from "next/link";
import { getDb } from "@/db/runtime";
import { rolesFor } from "@/modules/auth/permissions";
import { ARTICLE_CATEGORIES, ARTICLE_STARTERS } from "@/modules/site/article-starters";
import { listArticles } from "@/modules/site/articles";
import { siteUrl } from "@/modules/site/service";
import { homepageHosts } from "@/modules/site/rules";
import { requireUser } from "../../_lib/session";
import { AssistForm } from "../../_assist";
import { CheckGroup, NumberField, SelectField, TextAreaField, TextField } from "../../_input";
import { SubmitButton } from "../../_submit";
import { Badge, buttonClass, Card, Empty, ErrorBox, Notice, PageTitle } from "../../_ui";
import { HomepageTabs } from "../_tabs";
import { articleStartersAction, deleteArticleAction, saveArticleAction } from "../actions";

export default async function ArticlesAdminPage({ searchParams }: { searchParams: Promise<{ edit?: string; error?: string; notice?: string }> }) {
  const { edit, error, notice } = await searchParams;
  await requireUser([...rolesFor("consult.write")]);
  const rows = await listArticles(await getDb());
  const cur = edit ? rows.find((r) => r.id === edit) : undefined;
  const have = new Set(rows.map((r) => r.starterKey).filter(Boolean));
  const slugs = new Set(rows.map((r) => r.slug));
  const starterLeft = ARTICLE_STARTERS.filter((s) => !have.has(s.key) && !slugs.has(s.slug)).length;
  const cats = [...ARTICLE_CATEGORIES, ...new Set(rows.map((r) => r.category).filter((c) => !(ARTICLE_CATEGORIES as readonly string[]).includes(c)))];
  const pub = rows.filter((r) => r.published).length;
  const site = homepageHosts().length ? siteUrl() : "/site";
  return (
    <>
      <PageTitle
        help="homepage.articles"
        sub="손님이 읽는 차량 관리·부식 예방·수리 상식 글입니다. 손님은 홈페이지에서 읽기만 합니다."
        std="STD-02"
        actions={
          <Link href={`${site}/tech${cur?.published ? `/${cur.slug}` : ""}`} target="_blank" className={buttonClass("secondary")}>
            홈페이지에서 보기
          </Link>
        }
      >
        기술자료
      </PageTitle>
      <HomepageTabs on="/homepage/articles" />
      <div className="mb-4 space-y-2">
        <ErrorBox message={error} />
        {notice && <Notice>{notice}</Notice>}
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] xl:items-start">
        <Card
          title={`글 ${rows.length}편 · 공개 ${pub}편`}
          help={{ kind: "panel", id: "homepage.articleList" }}
          actions={
            starterLeft > 0 ? (
              <form action={articleStartersAction}>
                <button className={buttonClass("secondary")}>처음 초안 {starterLeft}편 불러오기</button>
              </form>
            ) : undefined
          }
        >
          {!rows.length ? (
            <Empty>아직 글이 없습니다. 위의 &lsquo;처음 초안 불러오기&rsquo;로 표준서 기반 초안 {ARTICLE_STARTERS.length}편을 넣고 고쳐 공개하세요.</Empty>
          ) : (
            <div className="space-y-4">
              {cats.map((c) => {
                const list = rows.filter((r) => r.category === c);
                if (!list.length) return null;
                return (
                  <section key={c}>
                    <h3 className="mb-1 text-sm font-semibold text-[var(--muted)]">{c}</h3>
                    <ul className="divide-y divide-[var(--line)] rounded-md border border-[var(--line)]">
                      {list.map((r) => (
                        <li key={r.id} className={`flex flex-wrap items-center gap-2 px-3 py-2 text-sm ${r.id === edit ? "bg-[var(--accent-soft)]" : ""}`}>
                          <Link href={`/homepage/articles?edit=${r.id}`} className="min-w-0 flex-1 font-medium hover:underline">
                            {r.title}
                          </Link>
                          <span className="text-xs tabular-nums text-[var(--muted)]">본 {r.views}</span>
                          <Badge tone={r.published ? "ok" : "warn"}>{r.published ? "공개" : "초안"}</Badge>
                        </li>
                      ))}
                    </ul>
                  </section>
                );
              })}
            </div>
          )}
        </Card>
        <Card title={cur ? "글 고치기" : "새 글 쓰기"} help={{ kind: "panel", id: "homepage.articleForm" }}>
          <AssistForm id={`article-${cur?.id ?? "new"}`} action={saveArticleAction} className="space-y-4">
            {cur && <input type="hidden" name="id" value={cur.id} />}
            <SelectField help="homepage.articleCategory" name="category" required defaultValue={cur?.category ?? ARTICLE_CATEGORIES[0]} options={cats.map((c) => ({ value: c, label: c }))} />
            <TextField help="homepage.articleTitle" name="title" required defaultValue={cur?.title ?? ""} />
            <TextField help="homepage.articleSlug" name="slug" required defaultValue={cur?.slug ?? ""} />
            <TextAreaField help="homepage.articleSummary" name="summary" required rows={3} defaultValue={cur?.summary ?? ""} />
            <TextAreaField help="homepage.articleBody" name="body" required rows={18} defaultValue={cur?.body ?? ""} />
            <NumberField help="homepage.articleSort" name="sort" defaultValue={cur?.sort ?? 100} min={0} max={999} />
            <CheckGroup help="homepage.publish" name="published" options={[{ value: "on", label: "홈페이지에 공개" }]} defaultChecked={cur?.published ? ["on"] : []} />
            <div className="flex flex-wrap items-center gap-2">
              <SubmitButton>저장</SubmitButton>
              {cur && (
                <Link href="/homepage/articles" className={buttonClass("secondary")}>
                  새 글 쓰기
                </Link>
              )}
              {cur && <span className="text-xs text-[var(--muted)]">읽는 시간 약 {cur.minutes}분</span>}
            </div>
          </AssistForm>
          {cur && (
            <form action={deleteArticleAction} className="mt-3 border-t border-[var(--line)] pt-3">
              <input type="hidden" name="id" value={cur.id} />
              <button className="text-sm text-[var(--danger)] underline">이 글 지우기</button>
            </form>
          )}
        </Card>
      </div>
    </>
  );
}
