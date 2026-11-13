// 월간 경영보고서(보고서 센터 5단계): 그 달 핵심 숫자를 한 장으로 보고, 의견을 붙여 대표 결재로 올린다.
// 올린 뒤에는 올릴 때 숫자(결재 문서와 같은 숫자)를 보여 준다.
import Link from "next/link";
import { getDb } from "@/db/runtime";
import { delta, fmtMetric } from "@/modules/report/service";
import { canMonthly, lastYm, latestMonthly, monthlyPack, type Section } from "@/modules/report/monthly";
import { seoulDate } from "@/modules/platform/time";
import { AssistForm } from "../../_assist";
import { TextAreaField } from "../../_input";
import { requireUser } from "../../_lib/session";
import { SubmitButton } from "../../_submit";
import { Badge, buttonClass, Card, ErrorBox, Notice, PageTitle } from "../../_ui";
import { PdfButton, PrintButton } from "../print-button";
import { monthlyAction } from "./actions";

const STATUS: Record<string, { label: string; tone: "ok" | "warn" | "danger" | "neutral" }> = {
  draft: { label: "작성 중", tone: "neutral" },
  in_progress: { label: "결재 중", tone: "warn" },
  rejected: { label: "반려", tone: "danger" },
  confirmed: { label: "승인", tone: "ok" },
  checked: { label: "승인", tone: "ok" },
  cancelled: { label: "취소", tone: "neutral" },
  discarded: { label: "폐기", tone: "neutral" },
};
const shift = (ym: string, n: number) => {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};

function Sections({ list }: { list: Section[] }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {list.map((s) => (
        <section key={s.id} className="rounded-md border border-[var(--line)] p-3">
          <h3 className="mb-2 text-sm font-semibold">
            <Link href={`/reports/${s.id}`} className="hover:underline">
              {s.no}. {s.title}
            </Link>
          </h3>
          <table className="w-full text-sm">
            <tbody>
              {s.kpis.map((k) => {
                const d = delta(k);
                return (
                  <tr key={k.key} className="border-t border-[var(--line)]">
                    <td className="py-1 pr-2">{k.label}</td>
                    <td className={`py-1 pr-2 text-right font-semibold whitespace-nowrap tabular-nums ${k.ok === false ? "text-[var(--danger)]" : ""}`}>{fmtMetric(k.value, k.unit)}</td>
                    <td className={`py-1 text-right text-xs whitespace-nowrap ${d?.tone === "ok" ? "text-[var(--ok)]" : d?.tone === "danger" ? "text-[var(--danger)]" : "text-[var(--muted)]"}`}>
                      {k.now ? "지금 기준" : (d?.text ?? "")}
                      {k.ok === false && <> · 목표 미달</>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      ))}
    </div>
  );
}

export default async function MonthlyPage({ searchParams }: { searchParams: Promise<{ ym?: string; notice?: string; error?: string }> }) {
  const q = await searchParams;
  const user = await requireUser();
  if (!canMonthly(user))
    return (
      <>
        <PageTitle help="reports.monthly">월간 경영보고서</PageTitle>
        <p className="text-sm text-[var(--muted)]">월간 경영보고서는 회계 담당·대표가 봅니다.</p>
      </>
    );
  const today = seoulDate();
  const ym = /^\d{4}-(0[1-9]|1[0-2])$/.test(q.ym ?? "") ? q.ym! : lastYm(today);
  const db = await getDb();
  const cur = await latestMonthly(db, ym);
  const fixed = cur && cur.status !== "rejected" && cur.status !== "cancelled" && cur.status !== "discarded";
  const list = fixed ? cur.sections : await monthlyPack(db, user.id, ym);
  const done = ym < today.slice(0, 7);
  const st = cur ? (STATUS[cur.status] ?? { label: cur.status, tone: "neutral" as const }) : null;
  return (
    <>
      <PageTitle
        help="reports.monthly"
        std="STD-Q Q.10"
        sub="그 달 경영 요약·예산 대비·손익·재무상태·현금흐름·채권·채무·재고·품질 핵심 숫자를 한 장으로 묶어 대표 결재로 올립니다. 숫자는 앞 달과 견줍니다."
        actions={
          <div className="no-print flex flex-wrap gap-2">
            <Link href={`/reports/monthly?ym=${shift(ym, -1)}`} className={buttonClass("secondary")}>
              앞 달
            </Link>
            {shift(ym, 1) < today.slice(0, 7) && (
              <Link href={`/reports/monthly?ym=${shift(ym, 1)}`} className={buttonClass("secondary")}>
                다음 달
              </Link>
            )}
            <PrintButton />
            <PdfButton fileName={`월간경영보고서_${ym}`} />
          </div>
        }
      >
        {ym.replace("-", "년 ")}월 경영보고서
      </PageTitle>
      {q.notice && <Notice>{q.notice}</Notice>}
      <ErrorBox message={q.error} />

      <Card title="결재" help={{ kind: "panel", id: "monthly.submit" }}>
        {cur && (
          <p className="mb-3 text-sm">
            <Link href={`/approvals/${cur.approvalDocId}`} className="text-[var(--accent)]">
              {cur.docNo}
            </Link>{" "}
            {st && <Badge tone={st.tone}>{st.label}</Badge>} {cur.comment && <span className="text-[var(--muted)]">의견: {cur.comment}</span>}
            {fixed && <span className="block text-xs text-[var(--muted)]">아래 숫자는 올릴 때 숫자입니다(그 뒤 전표가 바뀌어도 그대로).</span>}
          </p>
        )}
        {fixed ? null : !done ? (
          <p className="text-sm text-[var(--muted)]">끝난 달만 올립니다. 이 달은 말일 다음 날부터 올릴 수 있습니다.</p>
        ) : (
          <AssistForm id={`monthly-${ym}`} action={monthlyAction} className="grid gap-3">
            <input type="hidden" name="ym" value={ym} />
            <TextAreaField help="monthly.comment" name="comment" rows={3} />
            <div>
              <SubmitButton>{cur?.status === "rejected" ? "고친 숫자로 다시 올리기" : "결재 올리기"}</SubmitButton>
            </div>
          </AssistForm>
        )}
      </Card>

      <Card title="핵심 숫자" help={{ kind: "panel", id: "monthly.pack" }}>
        {list.length ? <Sections list={list} /> : <p className="text-sm text-[var(--muted)]">계산할 보고서가 없습니다.</p>}
      </Card>
      <p className="report-sheet hidden text-xs text-[var(--muted)] print:block">
        출력: {today} · {user.name} · 월간 경영보고서 {ym}
      </p>
    </>
  );
}
