import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/db/runtime";
import { ROLE_LABEL } from "@/modules/auth/roles";
import { loadShopInfo } from "@/modules/platform/shop";
import { canWriteDocs } from "@/modules/staff/documents";
import { isJobKey, JD_VERSION, JOBS, jobPosting, permsByArea, skillNames } from "@/modules/staff/job-rules";
import { LEVELS } from "@/modules/staff/rules";
import { requireUser } from "../../_lib/session";
import { Badge, Card, PageTitle } from "../../_ui";
import { CopyButton } from "../../money/bank/copy-button";

const List = ({ items }: { items: string[] }) => (items.length ? <ul className="list-disc space-y-0.5 pl-5">{items.map((x) => <li key={x}>{x}</li>)}</ul> : <span className="text-[var(--muted)]">없음</span>);

/** 직무기술서 한 장(F-11-08). '앱에서 하는 일'은 권한표에서 자동으로 만든다 */
export default async function JobPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  if (!isJobKey(key)) notFound();
  const user = await requireUser();
  const j = JOBS[key];
  const staff = canWriteDocs(user);
  const shop = staff && !j.notHired ? await loadShopInfo(await getDb()) : null;
  const rows: [string, React.ReactNode][] = [
    ["직무 목적", j.purpose],
    ["주요 업무", <List key="d" items={j.duties} />],
    ["자격조건(필수)", <List key="r" items={j.required} />],
    ["역량", <List key="c" items={j.competencies} />],
    ["우대조건", <List key="p" items={j.preferred} />],
    ["견제 장치", <List key="k" items={j.checks} />],
    ["보고 대상 · 대행자", `${j.reportsTo} · ${j.deputy}`],
    ["앱 역할", `${ROLE_LABEL[j.role]}${j.concurrent ? " (다른 직무와 겸직)" : ""}`],
  ];
  if (j.skills?.length) rows.push(["역량표 직무", `주로: ${skillNames(j.skills)}${j.sideSkills?.length ? ` / 함께 익힐 것: ${skillNames(j.sideSkills)}` : ""}`]);
  if (j.entryLevel) rows.push(["입사 때 기대 단계", `경력 ${j.entryLevel.career}단계(${LEVELS[j.entryLevel.career as 1].label}) · 신입 ${j.entryLevel.newbie}단계(${LEVELS[j.entryLevel.newbie as 1].label})`]);
  return (
    <>
      <PageTitle help="jobs.detail" std="F-11-08" sub={`${JD_VERSION} · 내용을 바꾸려면 문서 개정 요청서(F-Q-05)로 올립니다.`} actions={<Link href="/jobs" className="text-sm text-[var(--accent)]">← 직무기술서</Link>}>
        {j.title} 직무기술서
      </PageTitle>
      <div className="mt-4 grid gap-4 xl:grid-cols-[3fr_2fr]">
        <Card title="직무기술서" help={{ kind: "panel", id: "jobs.body" }}>
          <table className="w-full border-collapse text-sm">
            <tbody>
              {rows.map(([k, v]) => (
                <tr key={k}>
                  <th className="w-36 border border-[var(--line)] bg-[var(--surface-2)] px-2 py-1.5 text-left align-top">{k}</th>
                  <td className="border border-[var(--line)] px-2 py-1.5">{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <div className="space-y-4">
          <Card title="앱에서 하는 일" help={{ kind: "panel", id: "jobs.perms" }}>
            <p className="mb-2 text-xs text-[var(--muted)]">권한표(설정 › 권한표)에서 자동으로 만든 목록입니다. <Badge tone="accent">주 담당</Badge>은 이 직무와 대표만 하는 일입니다.</p>
            {permsByArea(j.role).map(({ area, items }) => (
              <div key={area} className="mb-2">
                <h3 className="text-sm font-semibold">{area}</h3>
                <ul className="mt-0.5 space-y-0.5 text-sm">
                  {items.map((p) => (
                    <li key={p.key}>
                      {p.label} {p.alone && j.role !== "owner" && <Badge tone="accent">주 담당</Badge>}
                      {p.note && <span className="block text-xs text-[var(--muted)]">{p.note}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </Card>
          <Card title="신입 교육 자료" help={{ kind: "panel", id: "jobs.manuals" }}>
            <p className="text-sm">사내 교재(만들어 둘 목차)</p>
            <List items={j.manuals} />
            {j.links.length > 0 && (
              <>
                <p className="mt-2 text-sm">외부 링크 자료</p>
                <List items={j.links} />
              </>
            )}
            <Link href="/training/manuals" className="mt-2 inline-block text-sm font-semibold text-[var(--accent)]">
              사내 교재 만들기 →
            </Link>
          </Card>
          {shop && (
            <Card title="채용 공고 문구" help={{ kind: "panel", id: "jobs.posting" }}>
              <pre className="whitespace-pre-wrap rounded border border-[var(--line)] bg-[var(--surface-2)] p-2 text-xs">{jobPosting(key, shop.name)}</pre>
              <div className="mt-2">
                <CopyButton text={jobPosting(key, shop.name)} label="문구 복사" />
              </div>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
