import Link from "next/link";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/runtime";
import { appUser } from "@/db/schema";
import { can } from "@/modules/auth/permissions";
import { fiveSBoard } from "@/modules/quality/five-s";
import { requireUser } from "../_lib/session";
import { AssistForm } from "../_assist";
import { SelectField } from "../_input";
import { SubmitButton } from "../_submit";
import { Badge, Card, ErrorBox, Notice, PageTitle } from "../_ui";
import { zoneAction } from "./actions";

/** 3정5S 현황: 구역별 담당, 오늘 일일 점검, 이달 점검률, 월간 점수 6개월 추이 */
export default async function FiveSPage({ searchParams }: { searchParams: Promise<{ error?: string; notice?: string }> }) {
  const { error, notice } = await searchParams;
  const user = await requireUser();
  const db = await getDb();
  const b = await fiveSBoard(db);
  const boss = can(user, "five_s.audit");
  const users = boss ? await db.select({ id: appUser.id, name: appUser.name }).from(appUser).where(eq(appUser.active, true)).orderBy(appUser.name) : [];
  const opts = users.map((u) => ({ value: u.id, label: u.name }));
  return (
    <>
      <PageTitle help="five_s" sub={`구역 담당이 작업 끝(종료 ${b.cleanupMinutes}분 전 청소)에 일일 점검을 하고, 공장장이 매월 첫 주 100점 만점으로 평가합니다. ${b.threshold}점 미만은 부적합이 발행됩니다(STD-08 14절).`}>
        3정5S 점검
      </PageTitle>
      <ErrorBox message={error} />
      {notice && <Notice>{notice}</Notice>}
      <Card title="구역 현황" help={{ kind: "panel", id: "five_s.board" }}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-[var(--muted)]">
              <tr>
                <th className="py-1.5 pr-2">구역</th>
                <th className="pr-2">담당·대행</th>
                <th className="pr-2">오늘 점검</th>
                <th className="pr-2">이달 점검률</th>
                {b.months.map((m) => (
                  <th key={m} className="pr-2 text-center">
                    {+m.slice(5)}월
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--line)]">
              {b.zones.map((z) => (
                <tr key={z.code}>
                  <td className="py-2 pr-2">
                    <Link href={`/five-s/${z.code}`} className="font-medium text-[var(--accent)]">
                      {z.code} {z.name}
                    </Link>
                  </td>
                  <td className="pr-2">
                    {z.ownerName ?? <Badge tone="warn">담당 없음</Badge>}
                    {z.deputyName && <span className="text-xs text-[var(--muted)]"> · {z.deputyName}</span>}
                  </td>
                  <td className="pr-2">{z.today ? z.today.results.every(Boolean) ? <Badge tone="ok">○ 모두</Badge> : <Badge tone="warn">× {z.today.results.filter((r) => !r).length}</Badge> : <Badge>안 함</Badge>}</td>
                  <td className="pr-2">{z.rate == null ? "-" : `${z.rate}%`}</td>
                  {b.months.map((m) => {
                    const sc = z.scores[m];
                    return (
                      <td key={m} className={`pr-2 text-center tabular-nums ${sc && sc.total < b.threshold ? "font-bold text-[var(--danger)]" : ""}`}>
                        {sc ? sc.total : "·"}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      {boss && (
        <div className="mt-4">
          <Card title="구역 담당 정하기" help={{ kind: "panel", id: "five_s.owners" }}>
            <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-4">
              {b.zones.map((z) => (
                <AssistForm key={z.code} id={`zone-${z.code}`} action={zoneAction} className="space-y-2 rounded-md border border-[var(--line)] p-3">
                  <input type="hidden" name="zone" value={z.code} />
                  <p className="font-semibold">
                    {z.code} {z.name}
                  </p>
                  <SelectField help="five_s.owner" name="ownerId" defaultValue={z.ownerId ?? ""} placeholder="정하지 않음" options={opts} />
                  <SelectField help="five_s.deputy" name="deputyId" defaultValue={z.deputyId ?? ""} placeholder="없음" options={opts} />
                  <SubmitButton variant="secondary">저장</SubmitButton>
                </AssistForm>
              ))}
            </div>
          </Card>
        </div>
      )}
    </>
  );
}
