import Link from "next/link";
import { getDb } from "@/db/runtime";
import { can } from "@/modules/auth/permissions";
import { evalSheet } from "@/modules/quality/legal";
import { EVAL_RESULTS, type EvalResult } from "@/modules/quality/legal-rules";
import { seoulDate } from "@/modules/platform/time";
import { AssistForm } from "../../_assist";
import { RadioRow, TextField } from "../../_input";
import { requireUser } from "../../_lib/session";
import { SubmitButton } from "../../_submit";
import {
  Badge,
  Card,
  Empty,
  ErrorBox,
  fmtTime,
  Notice,
  PageTitle,
} from "../../_ui";
import { legalAction } from "../actions";

const TONE = { ok: "ok", lacking: "danger", na: "neutral" } as const;

/** 연간 법규 준수 평가(F-Q-07, Q.6 5): 12월에 항목별 준수·미흡을 매기고 대표가 확정. 미흡은 부적합으로 간다 */
export default async function LegalEvalPage({
  searchParams,
}: {
  searchParams: Promise<{ y?: string; error?: string; notice?: string }>;
}) {
  const q = await searchParams;
  const user = await requireUser();
  const db = await getDb();
  const thisYear = Number(seoulDate(new Date()).slice(0, 4));
  const year =
    Number(q.y) >= 2026 && Number(q.y) <= thisYear + 1 ? Number(q.y) : thisYear;
  const { rows, confirmed } = await evalSheet(db, year);
  const manage = can(user, "legal.manage");
  const left = rows.filter((r) => !r.ev).length;
  const back = `/legal/eval?y=${year}`;
  return (
    <>
      <PageTitle
        help="legal.eval"
        sub={`${year}년 · 평가 대상 ${rows.length}건 · 남음 ${left}건. '대상'과 '확인 필요' 항목을 모두 평가해야 대표가 확정할 수 있습니다.`}
        actions={
          <div className="flex flex-wrap items-center gap-3 text-sm">
            {year > 2026 && (
              <Link
                href={`/legal/eval?y=${year - 1}`}
                className="text-[var(--accent)]"
              >
                ← {year - 1}년
              </Link>
            )}
            {year < thisYear && (
              <Link
                href={`/legal/eval?y=${year + 1}`}
                className="text-[var(--accent)]"
              >
                {year + 1}년 →
              </Link>
            )}
            <Link href="/legal" className="text-[var(--accent)]">
              법규 대장
            </Link>
          </div>
        }
      >
        법규 준수 평가
      </PageTitle>
      <ErrorBox message={q.error} />
      {q.notice && <Notice>{q.notice}</Notice>}
      {confirmed && (
        <Notice>
          {fmtTime(confirmed.confirmedAt)} 대표 확정: {confirmed.summary}
        </Notice>
      )}
      {!confirmed && can(user, "legal.confirm") && rows.length > 0 && (
        <Card title="대표 확정" help={{ kind: "panel", id: "legal.confirm" }}>
          {left ? (
            <p className="text-sm text-[var(--muted)]">
              아직 평가하지 않은 항목이 {left}건 있어 확정할 수 없습니다.
            </p>
          ) : (
            <AssistForm
              id={`legal-confirm-${year}`}
              action={legalAction}
              guard={false}
              className="flex flex-wrap items-center gap-3"
            >
              <input type="hidden" name="intent" value="confirm" />
              <input type="hidden" name="year" value={year} />
              <input type="hidden" name="back" value={back} />
              <p className="text-sm">
                모든 항목을 평가했습니다. 확정하면 더는 고칠 수 없고 경영검토
                자료로 넘어갑니다.
              </p>
              <SubmitButton>{year}년 평가 확정</SubmitButton>
            </AssistForm>
          )}
        </Card>
      )}
      <Card
        title={`${year}년 평가표(F-Q-07)`}
        help={{ kind: "panel", id: "legal.evalSheet" }}
      >
        {rows.length ? (
          <ul className="divide-y divide-[var(--line)]">
            {rows.map(({ x, ev }) => (
              <li key={x.id} className="py-3">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <Link
                    href={`/legal/${x.id}`}
                    className="font-medium text-[var(--accent)]"
                  >
                    {x.lawName}
                  </Link>
                  <span className="text-xs text-[var(--muted)]">{x.duty}</span>
                  {ev ? (
                    <Badge tone={TONE[ev.result as EvalResult]}>
                      {EVAL_RESULTS[ev.result as EvalResult]}
                    </Badge>
                  ) : (
                    <Badge tone="warn">평가 전</Badge>
                  )}
                  {ev?.ncId && (
                    <Link
                      href={`/nc/${ev.ncId}`}
                      className="text-xs text-[var(--accent)]"
                    >
                      부적합 보기
                    </Link>
                  )}
                </div>
                {ev?.detail && (
                  <p className="mt-0.5 text-xs text-[var(--muted)]">
                    증빙: {ev.detail}
                  </p>
                )}
                {manage && !confirmed && (
                  <AssistForm
                    id={`legal-eval-${year}-${x.id}`}
                    action={legalAction}
                    className="mt-2 grid gap-2 md:grid-cols-[auto_1fr_auto] md:items-end"
                  >
                    <input type="hidden" name="id" value={x.id} />
                    <input type="hidden" name="intent" value="eval" />
                    <input type="hidden" name="year" value={year} />
                    <input type="hidden" name="back" value={back} />
                    <RadioRow
                      help="legal.result"
                      name="result"
                      required
                      defaultValue={ev?.result ?? undefined}
                      options={Object.entries(EVAL_RESULTS).map(
                        ([value, label]) => ({
                          value,
                          label,
                          tone:
                            value === "ok"
                              ? ("ok" as const)
                              : value === "lacking"
                                ? ("danger" as const)
                                : undefined,
                        }),
                      )}
                    />
                    <TextField
                      help="legal.evalEvidence"
                      name="evalEvidence"
                      defaultValue={ev?.detail ?? x.evidence ?? ""}
                      from={!ev && x.evidence ? "대장 증빙" : undefined}
                    />
                    <SubmitButton>{ev ? "다시 저장" : "저장"}</SubmitButton>
                  </AssistForm>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <Empty>
            평가할 항목이 없습니다. 먼저 법규 대장에 항목을 올리세요.
          </Empty>
        )}
      </Card>
    </>
  );
}
