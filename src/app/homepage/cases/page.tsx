// 홈페이지 › 작업 사례 관리: 만든 사례 목록, 사례로 쓸 수 있는 출고 건(사진 홍보 사용에 동의한 손님만)에서 새로 만들기.
import Link from "next/link";
import { getDb } from "@/db/runtime";
import { rolesFor } from "@/modules/auth/permissions";
import { caseCandidates, listCases } from "@/modules/site/content";
import { siteUrl } from "@/modules/site/service";
import { homepageHosts } from "@/modules/site/rules";
import { seoulDate } from "@/modules/platform/time";
import { requireUser } from "../../_lib/session";
import { Badge, buttonClass, Card, Empty, ErrorBox, Notice, PageTitle } from "../../_ui";
import { HomepageTabs } from "../_tabs";
import { createCaseAction } from "../actions";

export default async function CasesAdminPage({ searchParams }: { searchParams: Promise<{ error?: string; notice?: string }> }) {
  const { error, notice } = await searchParams;
  await requireUser([...rolesFor("consult.write")]);
  const db = await getDb();
  const [cases, cands] = await Promise.all([listCases(db), caseCandidates(db)]);
  const site = homepageHosts().length ? siteUrl() : "/site";
  return (
    <>
      <PageTitle
        help="homepage.cases"
        sub="출고한 차의 수리 전후 사진을 홈페이지에 올립니다. 손님이 '사진 홍보 사용'에 동의한 건만, 번호판을 가린 사진만 씁니다."
        std="STD-13"
        actions={
          <Link href={`${site}/cases`} target="_blank" className={buttonClass("secondary")}>
            홈페이지에서 보기
          </Link>
        }
      >
        작업 사례
      </PageTitle>
      <HomepageTabs on="/homepage/cases" />
      <div className="mb-4 space-y-2">
        <ErrorBox message={error} />
        {notice && <Notice>{notice}</Notice>}
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] xl:items-start">
        <Card title={`만든 사례 ${cases.length}건`} help={{ kind: "panel", id: "homepage.caseList" }}>
          {!cases.length ? (
            <Empty>아직 사례가 없습니다. 오른쪽 출고 건에서 &lsquo;사례 만들기&rsquo;를 누르세요.</Empty>
          ) : (
            <ul className="divide-y divide-[var(--line)] rounded-md border border-[var(--line)]">
              {cases.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
                  <Link href={`/homepage/cases/${c.id}`} className="min-w-0 flex-1 font-medium hover:underline">
                    {c.title}
                  </Link>
                  <span className="text-xs text-[var(--muted)]">
                    {c.docNo ?? ""} · 전 {c.photos.filter((p) => p.side === "before").length} · 후 {c.photos.filter((p) => p.side === "after").length} · 읽음 {c.views}
                  </span>
                  {!c.consent ? <Badge tone="danger">동의 없음·안 보임</Badge> : <Badge tone={c.published ? "ok" : "warn"}>{c.published ? "공개" : "초안"}</Badge>}
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="사례로 쓸 수 있는 출고 건" help={{ kind: "panel", id: "homepage.caseCandidates" }}>
          {!cands.length ? (
            <Empty>지금은 없습니다. 출고한 차 가운데 손님이 &lsquo;수리 전후 사진 홍보 사용&rsquo;에 동의한 건만 여기에 나옵니다(고객 화면 › 동의에서 받음).</Empty>
          ) : (
            <ul className="divide-y divide-[var(--line)] text-sm">
              {cands.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-2 py-2">
                  <span className="min-w-0 flex-1">
                    <span className="font-medium">{[r.maker, r.model].filter(Boolean).join(" ") || "차종 없음"}</span>
                    <span className="ml-2 text-xs text-[var(--muted)]">
                      {r.docNo} · 출고 {r.deliveredAt ? seoulDate(new Date(r.deliveredAt)) : ""}
                    </span>
                  </span>
                  <form action={createCaseAction}>
                    <input type="hidden" name="ro" value={r.id} />
                    <button className={buttonClass("secondary")}>사례 만들기</button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
