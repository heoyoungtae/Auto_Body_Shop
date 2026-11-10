import Link from "next/link";
import { getDb } from "@/db/runtime";
import { can } from "@/modules/auth/permissions";
import { SG_STATUS, SG_TONE, type SgStatus } from "@/modules/equipment/rules";
import { listSuggestions, suggestionStats, type SuggestionFilter } from "@/modules/equipment/suggestion";
import { seoulDate } from "@/modules/platform/time";
import { requireUser } from "../_lib/session";
import { Badge, buttonClass, Card, Empty, fmtTime, Notice, PageTitle } from "../_ui";

const TABS: [SuggestionFilter, string][] = [
  ["open", "검토 중·보류"],
  ["adopted", "채택(실행 전)"],
  ["closed", "끝난 것"],
  ["mine", "내 제안"],
  ["all", "전체"],
];

/** 개선 제안(STD-08 8.12): 목록과 올해 제안·채택 실적 */
export default async function SuggestionsPage({ searchParams }: { searchParams: Promise<{ f?: string; notice?: string }> }) {
  const q = await searchParams;
  const user = await requireUser();
  const db = await getDb();
  const decide = can(user, "suggest.decide");
  const f = (TABS.find(([k]) => k === q.f)?.[0] ?? (decide ? "open" : "mine")) as SuggestionFilter;
  const today = seoulDate();
  const year = Number(today.slice(0, 4));
  const [rows, stats] = await Promise.all([listSuggestions(db, user, f), suggestionStats(db, year)]);
  return (
    <>
      <PageTitle
        help="suggestions"
        sub="현장에서 보이는 문제와 개선안을 누구나 올립니다. 공장장이 14일 안에 채택·보류·불채택과 이유를 회신하고, 채택안은 실행해 효과를 확인합니다."
        actions={
          <Link href="/suggestions/new" className={buttonClass()}>
            제안하기
          </Link>
        }
      >
        개선 제안
      </PageTitle>
      {q.notice && <Notice>{q.notice}</Notice>}
      <div className="grid gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <Card title="제안 목록(F-08-06)" help={{ kind: "panel", id: "sg.list" }}>
            <div className="mb-3 flex flex-wrap gap-1.5 text-sm">
              {TABS.map(([k, label]) => (
                <Link key={k} href={`/suggestions?f=${k}`} className={`rounded-full border px-3 py-1 ${f === k ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]" : "border-[var(--line)]"}`}>
                  {label}
                </Link>
              ))}
            </div>
            {rows.length ? (
              <ul className="divide-y divide-[var(--line)] text-sm">
                {rows.map(({ s, proposer }) => (
                  <li key={s.id} className="flex flex-wrap items-center gap-2 py-2">
                    <Link href={`/suggestions/${s.id}`} className="font-medium text-[var(--accent)]">
                      {s.title}
                    </Link>
                    <Badge tone={SG_TONE[s.status as SgStatus]}>{SG_STATUS[s.status as SgStatus]}</Badge>
                    {s.status === "submitted" && s.replyDue < today && <Badge tone="danger">회신 늦음</Badge>}
                    <span className="ml-auto text-xs text-[var(--muted)]">
                      {s.docNo} · {proposer} · {fmtTime(s.createdAt)}
                      {s.area ? ` · ${s.area}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty action={<Link href="/suggestions/new" className="text-[var(--accent)]">제안하기</Link>}>해당하는 제안이 없습니다.</Empty>
            )}
          </Card>
        </div>
        <Card title={`${year}년 제안 실적`} help={{ kind: "panel", id: "sg.stats" }}>
          {stats.length ? (
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-[var(--muted)]">
                <tr>
                  <th className="py-1">이름</th>
                  <th className="text-right">제안</th>
                  <th className="text-right">채택</th>
                  <th className="text-right">실행 끝</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--line)]">
                {stats.map((x) => (
                  <tr key={x.id} className={x.id === user.id ? "font-semibold" : ""}>
                    <td className="py-1.5">{x.name}</td>
                    <td className="text-right">{x.total}</td>
                    <td className="text-right">{x.adopted}</td>
                    <td className="text-right">{x.done}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-sm text-[var(--muted)]">올해 제안이 아직 없습니다.</p>
          )}
          <p className="mt-2 text-xs text-[var(--muted)]">12월 인사평가(F-11-06)에 제안 건수와 채택 실적을 반영합니다.</p>
        </Card>
      </div>
    </>
  );
}
