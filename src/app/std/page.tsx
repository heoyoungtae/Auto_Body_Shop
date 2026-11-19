import Link from "next/link";
import { getDb } from "@/db/runtime";
import { recentRevisions, searchStd, sectionLabel, stdToc } from "@/modules/quality/std";
import { stdKeyHref } from "@/modules/quality/std-ref";
import { requireUser } from "../_lib/session";
import { Badge, buttonClass, Card, Empty, ErrorBox, Notice, PageTitle } from "../_ui";

/** 사내 표준서 차례·찾기. 앱이 원본이다(2026-11-19) */
export default async function StdIndex({ searchParams }: { searchParams: Promise<{ q?: string; error?: string; notice?: string }> }) {
  const q = await searchParams;
  const user = await requireUser();
  const db = await getDb();
  const [toc, recent, hits] = await Promise.all([stdToc(db), recentRevisions(db), q.q ? searchStd(db, user, q.q) : Promise.resolve(null)]);
  return (
    <>
      <PageTitle help="std" sub="총람(요약)·상세 절차서·표준 양식집을 장 순서로 봅니다. 고칠 때는 절마다 '개정 요청'을 누르면 지금 본문이 개정 요청서에 그대로 들어갑니다." std="STD-00 · 총람 Q.5">
        사내 표준서
      </PageTitle>
      <ErrorBox message={q.error} />
      {q.notice && <Notice>{q.notice}</Notice>}
      <form action="/std" className="mb-4 flex flex-wrap gap-2" role="search">
        <label htmlFor="std-q" className="sr-only">
          표준서에서 찾기
        </label>
        <input
          id="std-q"
          name="q"
          type="search"
          defaultValue={q.q ?? ""}
          placeholder="찾을 말 (예: 보증 기간, 마스킹, ㅂㅈ, F-05-01)"
          className="min-h-11 min-w-0 flex-1 rounded-md border border-[var(--line-strong)] bg-[var(--surface)] px-3"
        />
        <button className={buttonClass()}>찾기</button>
        {q.q && (
          <Link href="/std" className={buttonClass("secondary")}>
            지우기
          </Link>
        )}
      </form>
      {hits && (
        <Card title={`'${q.q}' 찾은 결과 ${hits.length}곳`} help={{ kind: "panel", id: "std.search" }}>
          {hits.length ? (
            <ul className="divide-y divide-[var(--line)] text-sm">
              {hits.map((h) => (
                <li key={h.key} className="py-2">
                  <Link href={h.href} className="font-medium text-[var(--accent)]">
                    {h.label}
                  </Link>
                  {h.hidden && <Badge tone="warn">열람 제한</Badge>}
                  {h.snippet && <p className="mt-0.5 text-xs text-[var(--muted)]">{h.snippet}</p>}
                </li>
              ))}
            </ul>
          ) : (
            <Empty>찾은 곳이 없습니다. 낱말을 줄이거나 초성(예: ㅂㅈㄱㄱ)으로 찾아 보세요.</Empty>
          )}
        </Card>
      )}
      {recent.length > 0 && (
        <Card title="최근 개정" help={{ kind: "panel", id: "std.recent" }}>
          <ul className="space-y-1 text-sm">
            {recent.slice(0, 8).map((r) => (
              <li key={r.key} className="flex flex-wrap items-center gap-2">
                <Badge tone="accent">{r.revisedOn}</Badge>
                <Link href={stdKeyHref(r.key)} className="text-[var(--accent)]">
                  {sectionLabel(r)}
                </Link>
                <span className="text-xs text-[var(--muted)]">
                  {r.rev} · {r.revisedRef}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <Card title="차례" help={{ kind: "panel", id: "std.toc" }}>
        <ol className="grid gap-x-6 gap-y-3 text-sm md:grid-cols-2">
          {toc.chapters.map((c) => (
            <li key={c.ch}>
              <Link href={`/std/${c.ch}`} className="font-semibold text-[var(--accent)]">
                {c.no} {c.title}
              </Link>
              {c.revised > 0 && (
                <span className="ml-1.5">
                  <Badge tone="accent">고침 {c.revised}</Badge>
                </span>
              )}
              <p className="text-xs text-[var(--muted)]">
                {c.docNo} {c.procTitle ?? ""}
                {c.overview.length ? ` · 요약 ${c.overview.length}절` : ""}
                {c.procedure.length ? ` · 절차 ${c.procedure.length}절` : ""}
                {c.forms.length ? ` · 양식 ${c.forms.length}종` : ""}
              </p>
            </li>
          ))}
        </ol>
        <div className="mt-4 flex flex-wrap gap-2 border-t border-[var(--line)] pt-3">
          {toc.appendices.map((a) => (
            <Link key={a.key} href={`/std/${a.ch}`} className={buttonClass("secondary")}>
              {a.no} {a.title}
            </Link>
          ))}
          <Link href="/std/forms" className={buttonClass("secondary")}>
            표준 양식집 {toc.forms.length}종
          </Link>
        </div>
      </Card>
    </>
  );
}
