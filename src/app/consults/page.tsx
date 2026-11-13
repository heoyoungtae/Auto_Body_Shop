import { can } from "@/modules/auth/permissions";
import Link from "next/link";
import { getDb } from "@/db/runtime";
import { listConsultations, reservationCalendar } from "@/modules/customer/service";
import { runList, tabOf, type Q } from "@/modules/listq/core";
import { CONSULT_TABS, consultsList } from "@/modules/listq/defs/repair";
import { CHANNEL_LABEL, INSURANCE_LABEL, RESULT_LABEL, seoulParts } from "@/modules/customer/rules";
import { seoulDate } from "@/modules/platform/time";
import { dayLabel } from "../_format";
import { requireUser } from "../_lib/session";
import { Badge, buttonClass, Card, Empty, PageTitle } from "../_ui";
import { Calendar } from "./calendar";
import { ListBar, ListPager } from "../_list-bar";

const RESULT_TONE = { open: "neutral", reserved: "accent", recontact: "warn", declined: "neutral", converted: "ok" } as const;

export default async function ConsultsPage({ searchParams }: { searchParams: Promise<Q> }) {
  const q = await searchParams;
  const user = await requireUser();
  if (q.q && !q.s) q.s = q.q; // 예전 주소(?q=)
  const f = q.f && CONSULT_TABS.some((t) => t.v === q.f) ? q.f : q.d ? "reservations" : tabOf(consultsList, q)!;
  const db = await getDb();
  const today = seoulDate();
  const [r, cal, due] = await Promise.all([runList(db, consultsList, user, { ...q, f }), reservationCalendar(db, 14), f === "due" ? Promise.resolve(null) : listConsultations(db, "due")]);
  const rows = r.rows;
  const canWrite = can(user, "consult.write");
  const href = (o: Record<string, string | null>) => `/consults${r.qs(o)}`;

  return (
    <>
      <PageTitle
        help="consults"
        std="F-01-01 · STD-01" sub="상담 일지를 쓰고 입고 예약을 잡습니다."
        actions={
          canWrite && (
            <Link href="/consults/new" className={buttonClass()}>
              새 상담
            </Link>
          )
        }
      >
        상담·예약
      </PageTitle>
      <div className="grid gap-4 xl:grid-cols-4 xl:items-start">
        <div className="space-y-3 xl:col-span-3">
          <div className="flex flex-wrap items-center gap-2">
            <nav className="flex flex-wrap gap-1" aria-label="상담 거르기">
              {CONSULT_TABS.map((t) => (
                <Link key={t.v} href={href({ f: t.v === "active" ? null : t.v, d: null })} aria-current={t.v === f && !q.d ? "page" : undefined} className="rounded-md border border-[var(--line)] px-3 py-1.5 text-sm aria-[current=page]:border-[var(--accent)] aria-[current=page]:bg-[var(--accent-soft)] aria-[current=page]:font-semibold">
                  {t.label}
                  {t.v === "due" && due?.length ? <span className="ml-1 rounded-full bg-[var(--danger)] px-1.5 text-xs text-white">{due.length}</span> : null}
                </Link>
              ))}
            </nav>
          </div>
          <ListBar r={r} />
          {q.d && (
            <p className="text-sm">
              <b>{dayLabel(q.d, today)}</b> 입고 예약만 보는 중 · <Link href={href({ d: null, f: null })} className="text-[var(--accent)]">모두 보기</Link>
            </p>
          )}
          {rows.length ? (
            <div className="overflow-x-auto rounded-lg border border-[var(--line)] bg-[var(--surface)]">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="bg-[var(--surface-2)] text-left text-xs text-[var(--muted)]">
                  <tr>
                    <th className="px-3 py-2">번호·일시</th>
                    <th className="px-3 py-2">고객</th>
                    <th className="px-3 py-2">차량</th>
                    <th className="px-3 py-2">손상</th>
                    <th className="px-3 py-2">결과</th>
                    <th className="px-3 py-2">챙길 것</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--line)]">
                  {rows.map((r) => (
                    <tr key={r.id} className="hover:bg-[var(--surface-2)]">
                      <td className="px-3 py-2">
                        <Link href={`/consults/${r.id}`} className="font-medium text-[var(--accent)] hover:underline">
                          {r.docNo}
                        </Link>
                        <div className="text-xs text-[var(--muted)]">
                          {seoulParts(r.at).date.slice(5)} {seoulParts(r.at).time} · {CHANNEL_LABEL[r.channel]}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <Link href={`/customers/${r.customerId}`} className="hover:underline">
                          {r.customerName}
                        </Link>
                        <div className="text-xs text-[var(--muted)]">{r.phone ?? "연락처 없음"}</div>
                      </td>
                      <td className="px-3 py-2">
                        {r.plateNo ?? "—"}
                        <div className="text-xs text-[var(--muted)]">{r.model}</div>
                      </td>
                      <td className="px-3 py-2">
                        {[r.damageParts, r.damageTypes.join("·")].filter(Boolean).join(" ")}
                        {r.insurance !== "self" && <div className="text-xs text-[var(--muted)]">{INSURANCE_LABEL[r.insurance]}</div>}
                      </td>
                      <td className="px-3 py-2">
                        <Badge tone={RESULT_TONE[r.result]}>{RESULT_LABEL[r.result]}</Badge>
                        {r.result === "reserved" && r.reservedAt && (
                          <div className="text-xs">
                            {dayLabel(seoulParts(r.reservedAt).date, today).split(" · ")[0]} {seoulParts(r.reservedAt).time}
                            {!r.confirmSentAt && <span className="text-[var(--warn)]"> · 확인 안내 전</span>}
                          </div>
                        )}
                        {r.result === "recontact" && r.recontactOn && <div className="text-xs">{r.recontactOn.slice(5)} 재연락</div>}
                      </td>
                      <td className="px-3 py-2">
                        <span className="flex flex-wrap gap-1">
                          {r.flags.map((x) => (
                            <Badge key={x.label} tone={x.tone}>
                              {x.label}
                            </Badge>
                          ))}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty action={canWrite && <Link href="/consults/new" className={buttonClass()}>새 상담</Link>}>
              {f === "due" ? "오늘 챙길 상담이 없습니다." : q.s ? `'${q.s}'로 찾은 상담이 없습니다.` : r.loaded ? "조건에 맞는 상담이 없습니다." : "아직 상담이 없습니다. 전화·방문·문자로 문의가 오면 '새 상담'으로 적습니다."}
            </Empty>
          )}
          <ListPager r={r} />
        </div>
        <Card title="입고 예약 현황(2주)" help={{ kind: "panel", id: "consult.calendar" }}>
          <Calendar days={cal} today={today} />
        </Card>
      </div>
    </>
  );
}
