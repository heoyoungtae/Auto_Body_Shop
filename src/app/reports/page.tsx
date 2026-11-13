// 통계·보고서 센터: 분류별 탭(사용자 결정 2026-11-13 "분류별 탭으로 분리"). 볼 수 있는 분류만 탭으로 나오고,
// 탭 안에는 그 분류 보고서와 이번 달 대표 숫자 미리보기, 아직 만들지 않은 보고서는 흐리게 단계와 함께. 마지막 탭은 대장·전표 현황(목록 화면) 목차.
import Link from "next/link";
import { cookies } from "next/headers";
import { getDb } from "@/db/runtime";
import { canAnyReport, FAMILIES, type FamilyId } from "@/modules/report/catalog";
import { periodOf } from "@/modules/report/period";
import { runPeek } from "@/modules/report/run";
import { delta, fmtMetric } from "@/modules/report/service";
import { seoulDate } from "@/modules/platform/time";
import { requireUser } from "../_lib/session";
import { Badge, Card, PageTitle } from "../_ui";
import { RememberTab } from "./_remember-tab";
import { familyReports, FamilyTabs, isTab, LAST_TAB_COOKIE, listGroups, type TabId, visibleTabs } from "./_tabs";

const FAMILY_HELP = {
  mgmt: "rep.fam.mgmt",
  acct: "rep.fam.acct",
  quality: "rep.fam.quality",
  stock: "rep.fam.stock",
  people: "rep.fam.people",
} as const;

const toneCls = { ok: "text-[var(--ok)]", danger: "text-[var(--danger)]", neutral: "text-[var(--muted)]" } as const;

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const user = await requireUser();
  if (!canAnyReport(user))
    return (
      <>
        <PageTitle help="reports">통계·보고서</PageTitle>
        <p className="text-sm text-[var(--muted)]">볼 수 있는 보고서가 없습니다. 보고서는 권한표의 보고서 보기 권한(경영·회계·품질·재고·인력·안전)에 따라 보입니다.</p>
      </>
    );
  const tabs = visibleTabs(user);
  const asked = (await searchParams).tab;
  const last = (await cookies()).get(LAST_TAB_COOKIE)?.value;
  const tab: TabId = isTab(asked) && tabs.includes(asked) ? asked : isTab(last) && tabs.includes(last) ? last : tabs[0];
  return (
    <>
      <PageTitle help="reports" sub="위 탭에서 분류를 고르고 보고서를 엽니다. 보고서 안에서 기간(일·주·월·분기·반기·연·직접 지정)을 바꾸고 앞 기간이나 작년 같은 기간과 비교합니다. 숫자는 모두 앞선 전표에서 계산하며 따로 입력하는 값은 없습니다.">
        통계·보고서
      </PageTitle>
      <FamilyTabs tabs={tabs} current={tab} />
      <RememberTab tab={tab} />
      {tab === "lists" ? <ListsTab user={user} /> : <FamilyTab user={user} f={tab} />}
    </>
  );
}

async function FamilyTab({ user, f }: { user: { id: string; roles: import("@/modules/auth/roles").Role[] }; f: FamilyId }) {
  const list = familyReports(user, f);
  const today = seoulDate();
  const month = periodOf("month", today);
  const db = await getDb();
  const peeks = await Promise.all(list.map((r) => (r.phase ? Promise.resolve([]) : runPeek(db, user, r.id, month))));
  return (
    <Card title={FAMILIES[f].label} help={{ kind: "panel", id: FAMILY_HELP[f] }}>
      <p className="mb-3 text-xs text-[var(--muted)]">
        {FAMILIES[f].desc} · 숫자는 이번 달({month.from} ~ {today}) 기준, 화살표는 지난달과 비교
      </p>
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {list.map((r, i) => (
          <li key={r.id} className={`rounded-lg border border-[var(--line)] p-3 ${r.phase ? "opacity-60" : ""}`}>
            <Link href={`/reports/${r.id}`} className="font-semibold text-[var(--accent)] hover:underline">
              {r.no}. {r.title}
            </Link>{" "}
            {r.phase && <Badge tone="neutral">{r.phase} 예정</Badge>}
            <p className="mt-0.5 text-xs text-[var(--muted)]">{r.phase ? r.wait : r.desc}</p>
            {peeks[i].length > 0 && (
              <dl className="mt-2 grid grid-cols-2 gap-2">
                {peeks[i].map((k) => {
                  const d = delta(k);
                  return (
                    <div key={k.key} className="rounded-md bg-[var(--surface-2)] px-2 py-1.5">
                      <dt className="truncate text-[11px] text-[var(--muted)]">{k.label}</dt>
                      <dd className="text-sm font-semibold tabular-nums">{fmtMetric(k.value, k.unit)}</dd>
                      {d && <dd className={`text-[11px] ${toneCls[d.tone]}`}>{d.text}</dd>}
                    </div>
                  );
                })}
              </dl>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}

function ListsTab({ user }: { user: { id: string; roles: import("@/modules/auth/roles").Role[] } }) {
  const lists = listGroups(user);
  return (
    <Card title="대장·전표 현황" help={{ kind: "panel", id: "rep.lists" }}>
      <p className="mb-2 text-xs text-[var(--muted)]">앱에 입력한 대장·전표를 하나씩 봅니다. 목록 화면마다 기간·상태로 거르기는 2단계에서 붙입니다.</p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {lists.map(({ g, items }) => (
          <div key={g.id}>
            <p className="mb-1 text-xs font-semibold">{g.label}</p>
            <ul className="space-y-0.5 text-sm">
              {items.map((i) => (
                <li key={i.href}>
                  <Link href={i.href!} className="text-[var(--accent)] hover:underline">
                    {i.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Card>
  );
}
