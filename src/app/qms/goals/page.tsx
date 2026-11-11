import Link from "next/link";
import { getDb } from "@/db/runtime";
import { can } from "@/modules/auth/permissions";
import { goalYear, prevMonth } from "@/modules/quality/goals";
import { GOAL_KEYS, GOALS, goalText } from "@/modules/quality/qms-rules";
import { seoulDate } from "@/modules/platform/time";
import { AssistForm } from "../../_assist";
import { RadioRow, SelectField, TextField } from "../../_input";
import { requireUser } from "../../_lib/session";
import { SubmitButton } from "../../_submit";
import {
  Badge,
  buttonClass,
  Card,
  ErrorBox,
  fmtTime,
  Notice,
  PageTitle,
} from "../../_ui";
import { goalAction } from "../actions";

/** 품질목표 관리표(F-Q-02): 지표마다 1~12월 실적(앱 기록에서 자동 집계), 목표값, 분기 검토 서명 */
export default async function GoalsPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; notice?: string; error?: string }>;
}) {
  const q = await searchParams;
  const user = await requireUser();
  if (!can(user, "qms.goal_view"))
    return (
      <p className="text-sm text-[var(--muted)]">
        품질목표는 대표·공장장·품질·안전환경 담당이 봅니다.
      </p>
    );
  const today = seoulDate();
  const thisYear = Number(today.slice(0, 4));
  const year = Number(q.year) || thisYear;
  const y = await goalYear(await getDb(), year);
  const owner = can(user, "qms.goal_target");
  const last = prevMonth(today.slice(0, 7));
  const lastFixed =
    y.months.includes(last) &&
    y.rows.every((r) => r.months[Number(last.slice(5)) - 1]?.fixed);
  return (
    <>
      <PageTitle
        help="qms.goals"
        sub="지표는 작업·검사·출고·설문·불만·사고·법규·설비·5S 기록에서 저절로 계산합니다. 매월 5일 앞달 값을 고정하고, 2개월 연속 미달이면 부적합을 발행합니다."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/qms/goals?year=${year - 1}`}
              className={buttonClass("secondary")}
            >
              {year - 1}년
            </Link>
            {year < thisYear && (
              <Link
                href={`/qms/goals?year=${year + 1}`}
                className={buttonClass("secondary")}
              >
                {year + 1}년
              </Link>
            )}
          </div>
        }
      >
        {year}년 품질목표 관리표
      </PageTitle>
      <ErrorBox message={q.error} />
      {q.notice && <Notice>{q.notice}</Notice>}
      <Card title="지표별 실적" help={{ kind: "panel", id: "goal.table" }}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-xs">
            <thead>
              <tr className="text-left text-[var(--muted)]">
                <th className="py-1 pr-2">지표</th>
                <th className="pr-2">목표</th>
                {y.months.map((m) => (
                  <th key={m} className="px-1 text-center">
                    {Number(m.slice(5))}월
                  </th>
                ))}
                <th className="pl-2">달성</th>
              </tr>
            </thead>
            <tbody>
              {y.rows.map((r) => (
                <tr key={r.key} className="border-t border-[var(--line)]">
                  <td className="py-1.5 pr-2">
                    <div className="font-medium">{r.label}</div>
                    <div className="text-[var(--muted)]">{r.calc}</div>
                  </td>
                  <td className="pr-2 whitespace-nowrap">
                    {goalText(r.key, r.target)}{" "}
                    {r.dir === "lower" ? "이하" : "이상"}
                  </td>
                  {r.months.map((c, i) => (
                    <td
                      key={i}
                      className={`px-1 text-center whitespace-nowrap ${c?.ok === false ? "text-[var(--danger)] font-semibold" : c?.ok ? "text-[var(--ok)]" : "text-[var(--muted)]"}`}
                    >
                      {c ? goalText(r.key, c.value) : ""}
                      {c && !c.fixed && c.value != null ? "*" : ""}
                      {c?.ncId && (
                        <Link
                          href={`/nc/${c.ncId}`}
                          className="block text-[var(--accent)]"
                        >
                          부적합
                        </Link>
                      )}
                    </td>
                  ))}
                  <td className="pl-2 whitespace-nowrap">
                    {r.okMonths}/{r.judgedMonths}개월
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-[var(--muted)]">
          * 표시는 아직 고정하지 않은(지금 계산한) 값입니다. 대상 건이 없는 달은
          &lsquo;—&rsquo;로 두고 판정하지 않습니다.
        </p>
        {!lastFixed &&
          year === Number(last.slice(0, 4)) &&
          (can(user, "qms.docs") || owner) && (
            <AssistForm
              id={`snap-${last}`}
              action={goalAction}
              className="mt-3"
            >
              <input type="hidden" name="year" value={year} />
              <input type="hidden" name="intent" value="snapshot" />
              <input type="hidden" name="ym" value={last} />
              <SubmitButton variant="secondary">
                {last} 집계 지금 고정
              </SubmitButton>
            </AssistForm>
          )}
      </Card>

      <Card title="분기 검토 서명" help={{ kind: "panel", id: "goal.sign" }}>
        <ul className="mb-3 flex flex-wrap gap-2 text-sm">
          {[1, 2, 3, 4].map((qq) => {
            const s = y.signs.find((x) => x.quarter === qq);
            return (
              <li key={qq}>
                <Badge tone={s ? "ok" : "neutral"}>
                  {qq}분기 {s ? `서명 ${fmtTime(s.at)}` : "서명 전"}
                </Badge>
                {s?.note && (
                  <span className="ml-1 text-xs text-[var(--muted)]">
                    {s.note}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
        {owner && (
          <AssistForm
            id={`sign-${year}`}
            action={goalAction}
            className="grid gap-3 md:grid-cols-2"
          >
            <input type="hidden" name="year" value={year} />
            <input type="hidden" name="intent" value="sign" />
            <RadioRow
              help="goal.quarter"
              name="quarter"
              required
              options={[1, 2, 3, 4].map((x) => ({
                value: String(x),
                label: `${x}분기`,
              }))}
            />
            <TextField help="goal.signNote" name="note" />
            <div className="md:col-span-2">
              <SubmitButton>검토 서명</SubmitButton>
            </div>
          </AssistForm>
        )}
      </Card>

      {owner && (
        <Card title="목표값 바꾸기" help={{ kind: "panel", id: "goal.target" }}>
          <AssistForm
            id={`target-${year}`}
            action={goalAction}
            className="grid gap-3 md:grid-cols-3"
          >
            <input type="hidden" name="year" value={year} />
            <input type="hidden" name="intent" value="target" />
            <SelectField
              help="goal.key"
              name="key"
              required
              placeholder="지표 고르기"
              options={GOAL_KEYS.map((k) => ({
                value: k,
                label: `${GOALS[k].label}(${GOALS[k].unit})`,
              }))}
            />
            <TextField
              help="goal.target"
              name="target"
              required
              inputMode="decimal"
            />
            <TextField help="goal.reason" name="reason" required />
            <div className="md:col-span-3">
              <SubmitButton variant="secondary">목표값 저장</SubmitButton>
            </div>
          </AssistForm>
        </Card>
      )}
    </>
  );
}
