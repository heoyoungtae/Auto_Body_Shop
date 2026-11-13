// 통계·보고서 센터: 분야별 보고서 목록(사용자 결정 2026-11-13 "한 화면에 뭉뚱그리지 말고 보고서별로").
// 내가 볼 수 있는 보고서만 보이고, 아직 만들지 않은 보고서는 흐리게 단계와 함께 보인다. 아래에는 대장·전표 현황(목록 화면) 목차.
import Link from "next/link";
import { MENU } from "@/app/_menu";
import { can } from "@/modules/auth/permissions";
import { canAnyReport, canReport, FAMILIES, type FamilyId, REPORTS } from "@/modules/report/catalog";
import { requireUser } from "../_lib/session";
import { Badge, Card, PageTitle } from "../_ui";

const FAMILY_HELP = {
  mgmt: "rep.fam.mgmt",
  acct: "rep.fam.acct",
  quality: "rep.fam.quality",
  stock: "rep.fam.stock",
  people: "rep.fam.people",
} as const;

export default async function ReportsPage() {
  const user = await requireUser();
  if (!canAnyReport(user))
    return (
      <>
        <PageTitle help="reports">통계·보고서</PageTitle>
        <p className="text-sm text-[var(--muted)]">볼 수 있는 보고서가 없습니다. 보고서는 권한표의 보고서 보기 권한(경영·회계·품질·재고·인력·안전)에 따라 보입니다.</p>
      </>
    );
  const fams = (Object.keys(FAMILIES) as FamilyId[]).map((f) => ({ f, list: REPORTS.filter((r) => r.family === f && canReport(user, r)) })).filter((x) => x.list.length);
  const lists = MENU.filter((g) => g.id !== "settings" && g.id !== "me")
    .map((g) => ({ g, items: g.items.filter((i) => i.href && (!i.roles || i.roles.some((r) => user.roles.includes(r))) && (!i.perm || i.perm.some((k) => can(user, k)))) }))
    .filter((x) => x.items.length);
  return (
    <>
      <PageTitle help="reports" sub="보고서를 골라 기간(일·주·월·분기·반기·연·직접 지정)별로 보고, 앞 기간이나 작년 같은 기간과 비교합니다. 숫자는 모두 앞선 전표에서 계산하며 따로 입력하는 값은 없습니다.">
        통계·보고서
      </PageTitle>
      <div className="grid gap-4 lg:grid-cols-2">
        {fams.map(({ f, list }) => (
          <Card key={f} title={FAMILIES[f].label} help={{ kind: "panel", id: FAMILY_HELP[f] }}>
            <p className="mb-2 text-xs text-[var(--muted)]">{FAMILIES[f].desc}</p>
            <ul className="divide-y divide-[var(--line)]">
              {list.map((r) => (
                <li key={r.id} className={`py-2 ${r.phase ? "opacity-60" : ""}`}>
                  <Link href={`/reports/${r.id}`} className="font-semibold text-[var(--accent)] hover:underline">
                    {r.no}. {r.title}
                  </Link>{" "}
                  {r.phase && <Badge tone="neutral">{r.phase}에 만듦</Badge>}
                  <p className="text-xs text-[var(--muted)]">{r.phase ? r.wait : r.desc}</p>
                </li>
              ))}
            </ul>
          </Card>
        ))}
      </div>
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
    </>
  );
}
