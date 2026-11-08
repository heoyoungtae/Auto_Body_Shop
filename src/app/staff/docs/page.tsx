import Link from "next/link";
import { getDb } from "@/db/runtime";
import { seoulDate } from "@/modules/platform/time";
import { DOC_KINDS, DOC_STATUS, type DocKind } from "@/modules/staff/contract-rules";
import { canWriteDocs, listDocuments } from "@/modules/staff/documents";
import { requireUser } from "../../_lib/session";
import { Badge, Card, Empty, ErrorBox, Notice, PageTitle } from "../../_ui";

/** 근로계약서·서약서 목록: 대표·회계는 모두, 직원은 본인 것. 서명·교부가 남은 것을 위에 */
export default async function StaffDocsPage({ searchParams }: { searchParams: Promise<{ error?: string; notice?: string }> }) {
  const { error, notice } = await searchParams;
  const user = await requireUser();
  const db = await getDb();
  const rows = await listDocuments(db, user);
  const staff = canWriteDocs(user);
  const todo = (r: (typeof rows)[number]) => r.d.status === "draft" || r.d.status === "ready" || (r.d.kind === "contract" && r.d.status === "signed" && !r.d.deliveredAt);
  const sorted = [...rows.filter(todo), ...rows.filter((r) => !todo(r))];
  return (
    <>
      <PageTitle help="staff.docs" sub={staff ? "직원별 근로계약서·정보보호 서약서·퇴직 확인서입니다. 새로 쓰려면 직원 명부에서 그 사람을 누르세요." : "내 근로계약서와 서약서입니다. 서명할 것이 있으면 눌러서 서명하세요."}>
        {staff ? "계약서·서약서" : "내 계약서·서약서"}
      </PageTitle>
      <ErrorBox message={error} />
      {notice && <Notice>{notice}</Notice>}
      <div className="mt-4">
        <Card title="서류 목록" help={{ kind: "panel", id: "sdoc.list" }}>
          {sorted.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-[var(--muted)]">
                  <tr>
                    <th className="py-2 pr-3">번호</th>
                    {staff && <th className="pr-3">직원</th>}
                    <th className="pr-3">서류</th>
                    <th className="pr-3">상태</th>
                    <th className="pr-3">서명</th>
                    <th>교부</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--line)]">
                  {sorted.map(({ d, name }) => (
                    <tr key={d.id}>
                      <td className="py-2 pr-3 whitespace-nowrap">
                        <Link href={`/staff/docs/${d.id}`} className="font-semibold text-[var(--accent)]">
                          {d.docNo}
                        </Link>
                      </td>
                      {staff && <td className="pr-3 whitespace-nowrap">{name}</td>}
                      <td className="pr-3">{DOC_KINDS[d.kind as DocKind]?.label}</td>
                      <td className="pr-3 whitespace-nowrap">
                        <Badge tone={d.status === "signed" ? "ok" : d.status === "cancelled" ? "neutral" : "warn"}>{DOC_STATUS[d.status as keyof typeof DOC_STATUS]}</Badge>
                      </td>
                      <td className="pr-3 whitespace-nowrap">{d.signedAt ? seoulDate(d.signedAt) : "—"}</td>
                      <td className="whitespace-nowrap">{d.kind !== "contract" ? "—" : d.deliveredAt ? seoulDate(d.deliveredAt) : d.status === "signed" ? <Badge tone="warn">교부 필요</Badge> : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty>{staff ? "아직 서류가 없습니다. 직원 명부에서 직원을 눌러 근로계약서를 쓰세요." : "아직 받은 서류가 없습니다."}</Empty>
          )}
        </Card>
      </div>
    </>
  );
}
