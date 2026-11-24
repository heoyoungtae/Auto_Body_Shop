import { can } from "@/modules/auth/permissions";
import Link from "next/link";
import { getDb } from "@/db/runtime";
import { intakePanel } from "@/modules/dashboard/service";
import { listConsultations } from "@/modules/customer/service";
import { INSURANCE_LABEL, seoulParts } from "@/modules/customer/rules";
import { runList, type Q } from "@/modules/listq/core";
import { repairsList } from "@/modules/listq/defs/repair";
import { RO_STATUS_LABEL } from "@/modules/repair/rules";
import { loadPolicy } from "@/modules/platform/policy";
import { seoulDate } from "@/modules/platform/time";
import { dayLabel } from "../_format";
import { SubmitButton } from "../_submit";
import { requireUser } from "../_lib/session";
import { Badge, buttonClass, Card, Empty, ErrorBox, PageTitle, fmtTime } from "../_ui";
import { HelpButton } from "../_help-drawer";
import { startRepairAction } from "./actions";
import { ListBar, ListPager } from "../_list-bar";

/** 상태별 다음 할 일(수리 건 화면의 '다음' 단추와 같은 순서) */
const NEXT_STEP: Partial<Record<keyof typeof RO_STATUS_LABEL, { label: string; path: string }>> = {
  intake: { label: "입고 점검 마치기", path: "" },
  checked: { label: "손상 진단", path: "" },
  estimating: { label: "견적·고객 승인", path: "" },
  working: { label: "작업 진행 보기", path: "" },
  inspecting: { label: "검사하기", path: "/inspect" },
  ready: { label: "출고하기", path: "/delivery" },
};

export default async function RepairsPage({ searchParams }: { searchParams: Promise<Q> }) {
  const q = await searchParams;
  const user = await requireUser();
  const db = await getDb();
  const now = new Date();
  const today = seoulDate(now);
  const canWrite = can(user, "repair.write");
  const all = q.f === "all";
  const [panel, due, r, policy] = await Promise.all([intakePanel(db, now), listConsultations(db, "due", now), runList(db, repairsList, user, q), loadPolicy(db, today)]);
  const repairs = r.rows;
  const late = due.filter((c) => c.result === "reserved");
  const arrivals = [...late.map((c) => ({ ...c, tag: "late" as const })), ...panel.todayRows.map((c) => ({ ...c, tag: "today" as const })), ...panel.nextRows.map((c) => ({ ...c, tag: "next" as const }))];
  const minPhotos = Math.min(policy["intake.min_photos"], 8);

  return (
    <>
      <PageTitle
        help="repairs" std="F-02-01 · STD-02"
        sub="예약된 차를 입고 받고, 입고 점검표를 채워 수리 건을 엽니다."
        actions={
          canWrite && (
            <Link href="/consults/new" className={buttonClass("secondary")} title="예약 없이 온 차는 상담을 먼저 씁니다. 전화번호·차량번호로 찾으면 고객·차량을 다시 치지 않습니다">
              예약 없이 온 차(새 상담)
            </Link>
          )
        }
      >
        입고·진단
      </PageTitle>
      <ErrorBox message={q.error} />
      {/* 입고 예정이 없으면 한 줄 안내만 두고 목록이 화면 폭을 다 쓴다(대표 결정 2026-11-23 PC 화면 개선) */}
      {!arrivals.length && (
        <p className="mt-2 mb-3 flex flex-wrap items-center gap-1 text-sm text-[var(--muted)]">
          <HelpButton topic={{ kind: "panel", id: "repairs.arrivals" }} name="입고 예정" />
          입고 예정: 오늘·{dayLabel(panel.next, today)} 입고 예약이 없습니다. 예약 없이 온 차는{" "}
          <Link href="/consults/new" className="text-[var(--accent)]">
            새 상담
          </Link>
          을 먼저 씁니다.
        </p>
      )}
      <div className={`mt-4 grid gap-4 xl:items-start ${arrivals.length ? "xl:grid-cols-5" : ""}`}>
        {arrivals.length > 0 && (
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
            ) : null}
          </Card>
        </div>
        )}
        <div className={arrivals.length ? "xl:col-span-3" : ""}>
          <ListBar r={r} />
          <Card title="수리 건" help={{ kind: "panel", id: "repairs.list" }}>
            {repairs.length ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs text-[var(--muted)]">
                    <tr>
                      <th className="py-1.5 pr-3 font-medium">번호</th>
                      <th className="py-1.5 pr-3 font-medium">고객·차량</th>
                      <th className="py-1.5 pr-3 font-medium">상태</th>
                      <th className="py-1.5 pr-3 font-medium">담당</th>
                      <th className="py-1.5 pr-3 font-medium">입고</th>
                      <th className="py-1.5 pr-3 font-medium">점검</th>
                      <th className="py-1.5 font-medium">다음 할 일</th>
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
                        <td className="py-2 pr-3 whitespace-nowrap">{r.advisor ?? "—"}</td>
                        <td className="py-2 pr-3 whitespace-nowrap">{fmtTime(r.inAt)}</td>
                        <td className="py-2 pr-3 text-xs">
                          {r.signedAt ? <Badge tone="ok">점검 마침 {fmtTime(r.signedAt)}</Badge> : <span className={r.photos >= minPhotos ? "" : "text-[var(--warn)]"}>사진 {r.photos}장 · 점검 중</span>}
                        </td>
                        <td className="py-2 text-sm whitespace-nowrap">
                          {/* 목록에서 바로 다음 일로(대표 결정 2026-11-23) */}
                          {NEXT_STEP[r.status] && (
                            <Link href={`/repairs/${r.id}${NEXT_STEP[r.status]!.path}`} className="text-[var(--accent)] hover:underline">
                              {NEXT_STEP[r.status]!.label} →
                            </Link>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <Empty>{r.loaded && r.count === 0 ? "조건에 맞는 수리 건이 없습니다." : all ? "수리 건이 없습니다." : "진행 중인 수리 건이 없습니다. 입고 예정에서 '입고 시작'을 누르면 생깁니다."}</Empty>
            )}
            <ListPager r={r} />
          </Card>
        </div>
      </div>
    </>
  );
}
