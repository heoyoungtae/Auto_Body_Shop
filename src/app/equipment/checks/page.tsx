import Link from "next/link";
import { getDb } from "@/db/runtime";
import { lastDay, MARK_SHORT } from "@/modules/equipment/rules";
import { listEquipment, monthSheet } from "@/modules/equipment/service";
import { seoulDate } from "@/modules/platform/time";
import { requireUser } from "../../_lib/session";
import { Badge, Card, Empty, PageTitle } from "../../_ui";

const shiftMonth = (ym: string, d: number) => {
  const m = +ym.slice(5, 7) - 1 + d;
  const y = +ym.slice(0, 4) + Math.floor(m / 12);
  return `${y}-${String(((m % 12) + 12) % 12 + 1).padStart(2, "0")}`;
};

/** 월 점검표(F-08-02 모양): 설비 하나의 항목 × 1~31일 */
export default async function ChecksPage({ searchParams }: { searchParams: Promise<{ eq?: string; month?: string }> }) {
  const q = await searchParams;
  await requireUser();
  const db = await getDb();
  const today = seoulDate();
  const list = (await listEquipment(db)).filter((e) => e.checkDaily || e.checkMonthly);
  const ym = /^\d{4}-\d{2}$/.test(q.month ?? "") ? q.month! : today.slice(0, 7);
  const e = list.find((x) => x.id === q.eq) ?? list[0];
  const days = lastDay(+ym.slice(0, 4), +ym.slice(5, 7));
  const sheet = e ? await monthSheet(db, e.id, ym) : null;
  const link = (eq: string, m: string) => `/equipment/checks?eq=${eq}&month=${m}`;
  return (
    <>
      <PageTitle help="equip.checks" sub="점검표 양식 모양 그대로 날짜별 결과를 봅니다. 점검은 설비 화면이나 설비 QR에서 합니다.">
        일상 점검
      </PageTitle>
      {!e ? (
        <Empty>점검하는 설비가 없습니다. 설비 대장에서 설비를 먼저 등록하세요.</Empty>
      ) : (
        <div className="space-y-4">
          <Card title="설비 고르기" help={{ kind: "panel", id: "equip.pick" }}>
            <div className="flex flex-wrap gap-1.5 text-sm">
              {list.map((x) => (
                <Link key={x.id} href={link(x.id, ym)} className={`rounded-full border px-3 py-1 ${x.id === e.id ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]" : "border-[var(--line)]"}`}>
                  {x.no} {x.name}
                </Link>
              ))}
            </div>
          </Card>
          <Card
            title={`${e.no} ${e.name} · ${ym}`}
            help={{ kind: "panel", id: "equip.sheet" }}
            actions={
              <div className="flex gap-2 text-sm">
                <Link href={link(e.id, shiftMonth(ym, -1))} className="text-[var(--accent)]">
                  ← 지난달
                </Link>
                <Link href={link(e.id, shiftMonth(ym, 1))} className="text-[var(--accent)]">
                  다음 달 →
                </Link>
                <Link href={`/equipment/${e.id}/check`} className="font-semibold text-[var(--accent)]">
                  오늘 점검
                </Link>
              </div>
            }
          >
            <div className="overflow-x-auto">
              <table className="border-collapse text-xs">
                <thead>
                  <tr>
                    <th className="sticky left-0 min-w-40 border border-[var(--line)] bg-[var(--surface-2)] px-2 py-1 text-left">점검 항목 · 기준</th>
                    {Array.from({ length: days }, (_, i) => (
                      <th key={i} className={`w-7 border border-[var(--line)] bg-[var(--surface-2)] px-1 py-1 ${`${ym}-${String(i + 1).padStart(2, "0")}` === today ? "text-[var(--accent)]" : ""}`}>
                        {i + 1}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {e.dailyItems.map((it) => (
                    <tr key={it.item}>
                      <td className="sticky left-0 border border-[var(--line)] bg-[var(--surface)] px-2 py-1">
                        {it.item}
                        {it.std && <span className="text-[var(--muted)]"> · {it.std}</span>}
                      </td>
                      {Array.from({ length: days }, (_, i) => {
                        const c = sheet!.daily.get(i + 1);
                        const m = c?.results.find((x) => x.item === it.item)?.mark;
                        return (
                          <td key={i} title={c?.results.find((x) => x.item === it.item)?.note ?? ""} className={`border border-[var(--line)] text-center ${m === "x" ? "bg-[var(--danger-soft)] font-bold text-[var(--danger)]" : m === "tri" ? "bg-[var(--warn-soft)]" : ""}`}>
                            {m ? MARK_SHORT[m] : ""}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <h3 className="mt-4 mb-1 text-sm font-semibold">월간 점검</h3>
            {sheet!.monthly.length ? (
              <ul className="text-sm">
                {sheet!.monthly.map((c) => (
                  <li key={c.id}>
                    {c.checkDate} {c.ok ? <Badge tone="ok">이상 없음</Badge> : <Badge tone="danger">× 이상</Badge>} {c.results.map((x) => `${x.item} ${MARK_SHORT[x.mark]}`).join(" · ")}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-[var(--muted)]">
                이 달 월간 점검이 없습니다.{" "}
                {e.checkMonthly && (
                  <Link href={`/equipment/${e.id}/check?kind=monthly`} className="text-[var(--accent)]">
                    월간 점검하기
                  </Link>
                )}
              </p>
            )}
          </Card>
        </div>
      )}
    </>
  );
}
