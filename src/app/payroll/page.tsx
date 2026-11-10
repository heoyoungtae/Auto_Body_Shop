import Link from "next/link";
import { getDb } from "@/db/runtime";
import { can } from "@/modules/auth/permissions";
import { seoulDate } from "@/modules/platform/time";
import { listRuns } from "@/modules/staff/payroll";
import { RUN_STATUS, type RunStatus } from "@/modules/staff/payroll-rules";
import { AssistForm } from "../_assist";
import { TextField } from "../_input";
import { requireUser } from "../_lib/session";
import { SubmitButton } from "../_submit";
import { Badge, Card, Empty, ErrorBox, Notice, PageTitle } from "../_ui";
import { preparePayrollAction } from "./actions";

const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;
const prev = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
};

/** 급여대장 목록(F-11-05): 달마다 계산 → 승인 → 지급 */
export default async function PayrollPage({
  searchParams,
}: {
  searchParams: Promise<{ ym?: string; notice?: string; error?: string }>;
}) {
  const q = await searchParams;
  const user = await requireUser();
  if (!can(user, "payroll.view"))
    return (
      <p className="text-sm text-[var(--muted)]">
        급여대장은 대표·회계 담당만 봅니다. 내 명세서는{" "}
        <Link href="/payroll/me" className="text-[var(--accent)]">
          내 임금명세서
        </Link>
        에서 봅니다.
      </p>
    );
  const runs = await listRuns(await getDb());
  const last = prev(seoulDate().slice(0, 7));
  const suggest = q.ym ?? (runs.some((r) => r.ym === last) ? "" : last);
  return (
    <>
      <PageTitle
        help="payroll"
        sub="회계 담당이 확정된 근태와 서명한 근로계약서로 계산하고, 대표가 승인하면 지급일에 지급합니다. 직원은 자기 명세서만 봅니다."
      >
        급여대장
      </PageTitle>
      <ErrorBox message={q.error} />
      {q.notice && <Notice>{q.notice}</Notice>}
      {can(user, "payroll.prepare") && (
        <Card title="급여 계산" help={{ kind: "panel", id: "pay.prepare" }}>
          <AssistForm
            id="payroll-prepare"
            action={preparePayrollAction}
            className="flex flex-wrap items-end gap-3"
          >
            <div className="w-56">
              <TextField
                help="pay.ym"
                name="ym"
                type="month"
                required
                defaultValue={suggest}
                from={suggest && !q.ym ? "지난달" : undefined}
              />
            </div>
            <SubmitButton>계산하기</SubmitButton>
          </AssistForm>
        </Card>
      )}
      <Card title="달별 급여대장" help={{ kind: "panel", id: "pay.list" }}>
        {runs.length ? (
          <ul className="divide-y divide-[var(--line)] text-sm">
            {runs.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-2 py-2">
                <Link
                  href={`/payroll/${r.ym}`}
                  className="font-medium text-[var(--accent)]"
                >
                  {r.ym}
                </Link>
                <Badge
                  tone={
                    r.status === "paid"
                      ? "ok"
                      : r.status === "draft"
                        ? "neutral"
                        : "warn"
                  }
                >
                  {RUN_STATUS[r.status as RunStatus]}
                </Badge>
                <span className="text-xs text-[var(--muted)]">
                  {r.headcount}명 · 지급 총액 {won(r.totalGross)} · 공제{" "}
                  {won(r.totalDeduct)} · 실지급 {won(r.totalNet)} ·{" "}
                  {r.status === "paid"
                    ? `${r.payDate} 지급`
                    : `${r.payDate} 지급 예정`}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <Empty>아직 급여대장이 없습니다.</Empty>
        )}
      </Card>
    </>
  );
}
