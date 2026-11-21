// 홈페이지 › 자주 묻는 질문 관리: 분야별 목록(공개·초안), 고치기·새로 쓰기, 처음 초안 20개 불러오기.
// 손님은 홈페이지 '자주 묻는 질문'에서 읽기만 한다(묻고 답하기 없음). 상담 답변에서 '초안으로 만들기'를 누르면 여기로 온다.
import Link from "next/link";
import { getDb } from "@/db/runtime";
import { rolesFor } from "@/modules/auth/permissions";
import { FAQ_CATEGORIES, FAQ_STARTERS } from "@/modules/site/faq-starters";
import { listFaqs } from "@/modules/site/content";
import { siteUrl } from "@/modules/site/service";
import { homepageHosts } from "@/modules/site/rules";
import { requireUser } from "../../_lib/session";
import { AssistForm } from "../../_assist";
import { CheckGroup, NumberField, SelectField, TextAreaField, TextField } from "../../_input";
import { SubmitButton } from "../../_submit";
import { Badge, buttonClass, Card, Empty, ErrorBox, Notice, PageTitle } from "../../_ui";
import { HomepageTabs } from "../_tabs";
import { deleteFaqAction, faqStartersAction, saveFaqAction } from "../actions";

const ORIGIN = { starter: "처음 초안", consult: "상담 답변에서" } as const;

export default async function FaqAdminPage({ searchParams }: { searchParams: Promise<{ edit?: string; error?: string; notice?: string }> }) {
  const { edit, error, notice } = await searchParams;
  await requireUser([...rolesFor("consult.write")]);
  const rows = await listFaqs(await getDb());
  const cur = edit ? rows.find((r) => r.id === edit) : undefined;
  const starterLeft = FAQ_STARTERS.length - new Set(rows.map((r) => r.starterKey).filter(Boolean)).size;
  const cats = [...FAQ_CATEGORIES, ...new Set(rows.map((r) => r.category).filter((c) => !(FAQ_CATEGORIES as readonly string[]).includes(c)))];
  const pub = rows.filter((r) => r.published).length;
  const site = homepageHosts().length ? siteUrl() : "/site";
  return (
    <>
      <PageTitle
        help="homepage.faq"
        sub="손님이 자주 묻는 것을 미리 답해 두는 곳입니다. 손님은 홈페이지에서 읽기만 합니다."
        std="STD-01"
        actions={
          <Link href={`${site}/faq`} target="_blank" className={buttonClass("secondary")}>
            홈페이지에서 보기
          </Link>
        }
      >
        자주 묻는 질문
      </PageTitle>
      <HomepageTabs on="/homepage/faq" />
      <div className="mb-4 space-y-2">
        <ErrorBox message={error} />
        {notice && <Notice>{notice}</Notice>}
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] xl:items-start">
        <Card
          title={`질문 ${rows.length}개 · 공개 ${pub}개`}
          help={{ kind: "panel", id: "homepage.faqList" }}
          actions={
            starterLeft > 0 ? (
              <form action={faqStartersAction}>
                <button className={buttonClass("secondary")}>빠진 처음 글 {starterLeft}개 다시 넣기</button>
              </form>
            ) : undefined
          }
        >
          {!rows.length ? (
            <Empty>아직 질문이 없습니다. 홈페이지를 처음 열면 표준서 기반 질문 20개가 저절로 공개로 들어갑니다. 지금 넣으려면 위 단추를 누르세요.</Empty>
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
                          <Link href={`/homepage/faq?edit=${r.id}`} className="min-w-0 flex-1 font-medium hover:underline">
                            {r.question}
                          </Link>
                          {r.origin && <span className="text-xs text-[var(--muted)]">{ORIGIN[r.origin as keyof typeof ORIGIN] ?? ""}</span>}
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
        <Card title={cur ? "질문 고치기" : "새 질문 쓰기"} help={{ kind: "panel", id: "homepage.faqForm" }}>
          <AssistForm id={`faq-${cur?.id ?? "new"}`} action={saveFaqAction} className="space-y-4">
            {cur && <input type="hidden" name="id" value={cur.id} />}
            <SelectField help="homepage.faqCategory" name="category" required defaultValue={cur?.category ?? FAQ_CATEGORIES[0]} options={cats.map((c) => ({ value: c, label: c }))} />
            <TextField help="homepage.faqQuestion" name="question" required defaultValue={cur?.question ?? ""} />
            <TextAreaField help="homepage.faqAnswer" name="answer" required rows={8} defaultValue={cur?.answer ?? ""} />
            <NumberField help="homepage.faqSort" name="sort" defaultValue={cur?.sort ?? 100} min={0} max={999} />
            <CheckGroup help="homepage.publish" name="published" options={[{ value: "on", label: "홈페이지에 공개" }]} defaultChecked={cur?.published ? ["on"] : []} />
            <div className="flex flex-wrap items-center gap-2">
              <SubmitButton>저장</SubmitButton>
              {cur && (
                <Link href="/homepage/faq" className={buttonClass("secondary")}>
                  새 질문 쓰기
                </Link>
              )}
            </div>
          </AssistForm>
          {cur && (
            <form action={deleteFaqAction} className="mt-3 border-t border-[var(--line)] pt-3">
              <input type="hidden" name="id" value={cur.id} />
              <button className="text-sm text-[var(--danger)] underline">이 질문 지우기</button>
            </form>
          )}
        </Card>
      </div>
    </>
  );
}
