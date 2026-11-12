import Link from "next/link";
import { getDb } from "@/db/runtime";
import { claimTodos, listClaims } from "@/modules/repair/claims";
import { CLAIM_STATUS_LABEL, COVERAGE_LABEL } from "@/modules/repair/claim-rules";
import { RO_STATUS_LABEL } from "@/modules/repair/rules";
import { requireUser } from "../_lib/session";
import { Badge, Card, Empty, PageTitle } from "../_ui";

const NEXT: Record<string, string> = { info: "접수 정보 확인", request: "손해사정 요청", scope: "보험사 회신(승인 범위) 기다림", claim: "청구", dun: "입금 독촉" };
const won = (n: number | null | undefined) => (n == null ? "—" : `${n.toLocaleString("ko-KR")}원`);

/** 보험 청구 목록(STD-03 6절): 보험 수리 건의 청구 단계·다음 할 일·기한 */
export default async function ClaimsPage({ searchParams }: { searchParams: Promise<{ f?: string }> }) {
  const q = await searchParams;
  await requireUser();
  const db = await getDb();
  const f = q.f === "all" ? "all" : "open";
  const [rows, todos] = await Promise.all([listClaims(db, f), claimTodos(db)]);
  return (
    <>
      <PageTitle help="claims" std="STD-03 6절" sub="보험 수리 건의 접수 확인 → 손해사정 요청 → 승인 범위 → 청구 → 입금 확인.">
        보험 청구
      </PageTitle>
      <div className="mt-4">
        <Card
          title="보험 수리 건"
          help={{ kind: "panel", id: "claims.list" }}
          actions={
            <span className="flex gap-3 text-sm">
              {f === "open" ? <b>진행 중</b> : <Link href="/claims" className="text-[var(--accent)]">진행 중</Link>}
              {f === "all" ? <b>전체</b> : <Link href="/claims?f=all" className="text-[var(--accent)]">전체</Link>}
            </span>
          }
        >
          {rows.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-[var(--muted)]">
                  <tr>
                    <th className="py-1.5 pr-2">수리 건</th>
                    <th className="py-1.5 pr-2">고객·차량</th>
                    <th className="py-1.5 pr-2">보험사·접수번호</th>
                    <th className="py-1.5 pr-2">청구 단계</th>
                    <th className="py-1.5 pr-2">다음 할 일</th>
                    <th className="py-1.5 pr-2 text-right">청구·입금</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--line)]">
                  {rows.map((r) => {
                    const t = todos.find((x) => x.id === r.ro.id);
                    const c = r.claim;
                    return (
                      <tr key={r.ro.id}>
                        <td className="py-1.5 pr-2">
                          <Link href={`/repairs/${r.ro.id}/claim`} className="font-medium text-[var(--accent)]">
                            {r.ro.docNo}
                          </Link>
                          <span className="block text-xs text-[var(--muted)]">{RO_STATUS_LABEL[r.ro.status]}</span>
                        </td>
                        <td className="py-1.5 pr-2">
                          {r.customerName} · {r.plateNo}
                        </td>
                        <td className="py-1.5 pr-2">
                          {c?.insurer ?? r.ro.insurer ?? "—"} {c?.claimNo ?? r.ro.claimNo ?? ""}
                          <span className="block text-xs text-[var(--muted)]">{COVERAGE_LABEL[(c?.coverage ?? r.ro.insurance) as keyof typeof COVERAGE_LABEL] ?? ""}</span>
                        </td>
                        <td className="py-1.5 pr-2">
                          <Badge tone={c?.status === "paid" ? "ok" : c ? "accent" : "warn"}>{CLAIM_STATUS_LABEL[c?.status ?? "none"]}</Badge>
                        </td>
                        <td className="py-1.5 pr-2">
                          {t ? (
                            <>
                              {NEXT[t.kind]}
                              {t.due && <span className={`block text-xs ${t.late ? "font-medium text-[var(--danger)]" : "text-[var(--muted)]"}`}>{t.late ? `기한 지남(${t.due})` : `기한 ${t.due}`}</span>}
                            </>
                          ) : (
                            <span className="text-[var(--muted)]">{c?.status === "scoped" ? "작업·출고 뒤 청구" : c?.status === "claimed" ? "입금 대기" : "—"}</span>
                          )}
                        </td>
                        <td className="py-1.5 pr-2 text-right tabular-nums">
                          {won(c?.claimedWon)}
                          {c?.paidWon != null && <span className="block text-xs text-[var(--muted)]">입금 {won(c.paidWon)}{c.cutWon ? ` · 감액 ${won(c.cutWon)}` : ""}</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty>{f === "open" ? "진행 중인 보험 수리 건이 없습니다." : "보험 수리 건이 없습니다."}</Empty>
          )}
        </Card>
      </div>
    </>
  );
}
