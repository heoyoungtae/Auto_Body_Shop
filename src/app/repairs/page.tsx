import Link from "next/link";
import { getDb } from "@/db/runtime";
import { intakePanel } from "@/modules/dashboard/service";
import { listConsultations } from "@/modules/customer/service";
import { INSURANCE_LABEL, seoulParts } from "@/modules/customer/rules";
import { listRepairs } from "@/modules/repair/service";
import { RO_STATUS_LABEL } from "@/modules/repair/rules";
import { loadPolicy } from "@/modules/platform/policy";
import { seoulDate } from "@/modules/platform/time";
import { dayLabel } from "../_format";
import { SubmitButton } from "../_submit";
import { requireUser } from "../_lib/session";
import { Badge, buttonClass, Card, Empty, ErrorBox, PageTitle, fmtTime } from "../_ui";
import { startRepairAction } from "./actions";

export default async function RepairsPage({ searchParams }: { searchParams: Promise<{ error?: string; f?: string }> }) {
  const q = await searchParams;
  const user = await requireUser();
  const db = await getDb();
  const now = new Date();
  const today = seoulDate(now);
  const canWrite = user.roles.some((r) => r === "owner" || r === "plant_manager" || r === "advisor");
  const all = q.f === "all";
  const [panel, due, repairs, policy] = await Promise.all([intakePanel(db, now), listConsultations(db, "due", now), listRepairs(db, all ? "all" : "open"), loadPolicy(db, today)]);
  const late = due.filter((c) => c.result === "reserved");
  const arrivals = [...late.map((c) => ({ ...c, tag: "late" as const })), ...panel.todayRows.map((c) => ({ ...c, tag: "today" as const })), ...panel.nextRows.map((c) => ({ ...c, tag: "next" as const }))];
  const minPhotos = Math.min(policy["intake.min_photos"], 8);

  return (
    <>
      <PageTitle
        help="repairs"
        sub="입고 접수와 입고 점검표(F-02-01). 사내 표준서 STD-02."
        actions={
          canWrite && (
            <Link href="/consults/new" className={buttonClass("secondary")} title="예약 없이 온 차는 상담을 먼저 씁니다. 전화번호·차량번호로 찾으면 고객·차량을 다시 치지 않습니다">
              예약 없이 온 차(새 상담)
            </Link>
          )
        }
      >
        접수·입고
      </PageTitle>
      <ErrorBox message={q.error} />
      <div className="mt-4 grid gap-4 xl:grid-cols-5 xl:items-start">
        <div className="xl:col-span-2">
          <Card title="입고 예정" help={{ kind: "panel", id: "repairs.arrivals" }}>
            {arrivals.length ? (
              <ul className="divide-y divide-[var(--line)] text-sm">
                {arrivals.map((c) => {
                  const p = c.reservedAt ? seoulParts(c.reservedAt) : null;
                  return (
                    <li key={c.id} className="flex flex-wrap items-center gap-2 py-2.5">
                      <span className="min-w-0 flex-1">
                        <Link href={`/consults/${c.id}`} className="font-medium text-[var(--accent)] hover:underline">
                          {c.customerName}
                        </Link>{" "}
                        {c.plateNo ?? <Badge tone="warn">차량 없음</Badge>} <span className="text-[var(--muted)]">{c.model}</span>
                        <br />
                        <span className="text-xs text-[var(--muted)]">
                          {c.docNo} · {p && `${dayLabel(p.date, today)} ${p.time}`} · {INSURANCE_LABEL[c.insurance]}
                        </span>{" "}
                        {c.tag === "late" && <Badge tone="danger">예약일 지남</Badge>}
                        {c.tag === "today" && <Badge tone="accent">오늘</Badge>}
                      </span>
                      {canWrite && (
                        <form action={startRepairAction}>
                          <input type="hidden" name="consultId" value={c.id} />
                          <input type="hidden" name="back" value="/repairs" />
                          <SubmitButton variant={c.tag === "next" ? "secondary" : "primary"}>입고 시작</SubmitButton>
                        </form>
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <Empty>
                오늘·{dayLabel(panel.next, today)} 입고 예약이 없습니다. 예약 없이 온 차는 <Link href="/consults/new" className="text-[var(--accent)]">새 상담</Link>을 먼저 씁니다.
              </Empty>
            )}
          </Card>
        </div>
        <div className="xl:col-span-3">
          <Card
            title="수리 건"
            help={{ kind: "panel", id: "repairs.list" }}
            actions={
              <Link href={all ? "/repairs" : "/repairs?f=all"} className="text-sm text-[var(--accent)]">
                {all ? "진행 중만" : "출고·취소 포함"}
              </Link>
            }
          >
            {repairs.length ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs text-[var(--muted)]">
                    <tr>
                      <th className="py-1.5 pr-3 font-medium">번호</th>
                      <th className="py-1.5 pr-3 font-medium">고객·차량</th>
                      <th className="py-1.5 pr-3 font-medium">상태</th>
                      <th className="py-1.5 pr-3 font-medium">입고</th>
                      <th className="py-1.5 font-medium">점검</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--line)]">
                    {repairs.map((r) => (
                      <tr key={r.id}>
                        <td className="py-2 pr-3">
                          <Link href={`/repairs/${r.id}`} className="font-medium text-[var(--accent)] hover:underline">
                            {r.docNo}
                          </Link>
                        </td>
                        <td className="py-2 pr-3">
                          {r.customerName} · {r.plateNo} <span className="text-[var(--muted)]">{r.model}</span>
                        </td>
                        <td className="py-2 pr-3">
                          <Badge tone={r.status === "intake" ? "warn" : r.status === "checked" ? "accent" : "neutral"}>{RO_STATUS_LABEL[r.status]}</Badge>
                        </td>
                        <td className="py-2 pr-3 whitespace-nowrap">{fmtTime(r.inAt)}</td>
                        <td className="py-2 text-xs">
                          {r.signedAt ? <Badge tone="ok">서명 {fmtTime(r.signedAt)}</Badge> : <span className={r.photos >= minPhotos ? "" : "text-[var(--warn)]"}>사진 {r.photos}장 · 서명 전</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <Empty>{all ? "수리 건이 없습니다." : "진행 중인 수리 건이 없습니다. 왼쪽 입고 예정에서 '입고 시작'을 누르면 생깁니다."}</Empty>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
