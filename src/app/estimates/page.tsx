import Link from "next/link";
import { getDb } from "@/db/runtime";
import { listAllEstimates, type EstimateFilter } from "@/modules/repair/estimate-approval";
import { ESTIMATE_KIND, ESTIMATE_STATUS_LABEL } from "@/modules/repair/estimate-rules";
import { seoulDate } from "@/modules/platform/time";
import { requireUser } from "../_lib/session";
import { Badge, Card, Empty, PageTitle, fmtTime } from "../_ui";

const FILTERS: Record<EstimateFilter, string> = { open: "진행 중(작성~승인 대기)", answered: "고객 답 받음", all: "전체" };
const TONE: Record<string, "neutral" | "ok" | "warn" | "danger" | "accent"> = { draft: "warn", review: "accent", approved: "accent", sent: "neutral", accepted: "ok", partial: "warn", declined: "danger" };

/** 견적·고객 승인(STD-03): 모든 수리 건의 견적을 한곳에서 챙긴다 */
export default async function EstimatesPage({ searchParams }: { searchParams: Promise<{ f?: string }> }) {
  const q = await searchParams;
  await requireUser();
  const f: EstimateFilter = q.f === "answered" || q.f === "all" ? q.f : "open";
  const rows = await listAllEstimates(await getDb(), f);
  const today = seoulDate();
  return (
    <>
      <PageTitle help="estimates" std="F-03-02 · STD-03" sub="견적서(법정 서식)를 쓰고, 검토·발급해 고객 승인을 받습니다.">
        견적·고객 승인
      </PageTitle>
      <div className="mt-4">
        <Card
          title="견적"
          help={{ kind: "panel", id: "estimates.list" }}
          actions={
            <span className="flex flex-wrap gap-3 text-sm">
              {(Object.keys(FILTERS) as EstimateFilter[]).map((k) =>
                k === f ? (
                  <b key={k}>{FILTERS[k]}</b>
                ) : (
                  <Link key={k} href={k === "open" ? "/estimates" : `/estimates?f=${k}`} className="text-[var(--accent)]">
                    {FILTERS[k]}
                  </Link>
                ),
              )}
            </span>
          }
        >
          {rows.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-[var(--muted)]">
                  <tr>
                    <th className="py-1.5 pr-3 font-medium">견적</th>
                    <th className="py-1.5 pr-3 font-medium">고객·차량</th>
                    <th className="py-1.5 pr-3 font-medium">상태</th>
                    <th className="py-1.5 pr-3 text-right font-medium">총액</th>
                    <th className="py-1.5 font-medium">발급·승인</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--line)]">
                  {rows.map((r) => {
                    const expired = r.status === "sent" && !!r.validUntil && r.validUntil < today;
                    return (
                      <tr key={r.id}>
                        <td className="py-2 pr-3">
                          <Link href={`/repairs/${r.roId}/estimate/${r.id}`} className="font-medium text-[var(--accent)] hover:underline">
                            {r.docNo}
                          </Link>
                          <span className="block text-xs text-[var(--muted)]">
                            {r.rev}차 · {ESTIMATE_KIND[r.kind as keyof typeof ESTIMATE_KIND]} · 수리 건 {r.roNo}
                          </span>
                        </td>
                        <td className="py-2 pr-3">
                          {r.customerName} · {r.plateNo} <span className="text-[var(--muted)]">{r.model}</span>
                        </td>
                        <td className="py-2 pr-3">
                          <Badge tone={expired ? "danger" : (TONE[r.status] ?? "neutral")}>{expired ? "유효기간 지남" : ESTIMATE_STATUS_LABEL[r.status]}</Badge>
                        </td>
                        <td className="py-2 pr-3 text-right tabular-nums">{r.total.toLocaleString("ko-KR")}</td>
                        <td className="py-2 text-xs">
                          {r.issuedOn ? `발급 ${r.issuedOn} · ${r.validUntil}까지` : "발급 전"}
                          {r.status === "sent" && <span className="block">{r.sentAt ? `${r.sentOk ? "링크 보냄" : "⚠ 링크 발송 실패"} ${fmtTime(r.sentAt)}` : "승인 링크 안 보냄"}</span>}
                          {r.approvedAt && <span className="block">답 받음 {fmtTime(r.approvedAt)}</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty>{f === "open" ? "진행 중인 견적이 없습니다. 견적은 수리 건에서 진단을 확인한 뒤 '견적 쓰기'로 만듭니다." : "견적이 없습니다."}</Empty>
          )}
        </Card>
      </div>
    </>
  );
}
