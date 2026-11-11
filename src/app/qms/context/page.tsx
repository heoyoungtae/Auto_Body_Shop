import Link from "next/link";
import { getDb } from "@/db/runtime";
import { can } from "@/modules/auth/permissions";
import { contextFor } from "@/modules/quality/qms";
import { CONTEXT_AREAS } from "@/modules/quality/qms-rules";
import { seoulDate } from "@/modules/platform/time";
import { AssistForm } from "../../_assist";
import { RadioRow, SelectField, TextAreaField, TextField } from "../../_input";
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
import { contextAction } from "../actions";

const LEVELS = [
  { value: "1", label: "1" },
  { value: "2", label: "2" },
  { value: "3", label: "3" },
];

/** 조직 상황·이해관계자 검토표(F-Q-01). 해마다 12월 대표가 쓰고 승인한다 */
export default async function ContextPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; notice?: string; error?: string }>;
}) {
  const q = await searchParams;
  const user = await requireUser();
  if (!can(user, "qms.context") && !can(user, "qms.docs"))
    return (
      <p className="text-sm text-[var(--muted)]">
        조직 상황 검토는 대표가 쓰고 품질 담당이 봅니다.
      </p>
    );
  const thisYear = Number(seoulDate().slice(0, 4));
  const year = Number(q.year) || thisYear;
  const { row, draft, from } = await contextFor(await getDb(), year);
  const edit = can(user, "qms.context") && row?.status !== "confirmed";
  const issues = edit
    ? [
        ...draft.issues,
        ...Array.from({ length: 2 }, () => ({
          area: "",
          issue: "",
          impact: "",
          action: "",
          riskId: null,
          riskNo: null,
        })),
      ]
    : draft.issues;
  const parties = edit
    ? [...draft.parties, { party: "", needs: "", check: "", std: "" }]
    : draft.parties;
  return (
    <>
      <PageTitle
        help="qms.context"
        sub="내부·외부 이슈와 이해관계자의 요구를 해마다 다시 봅니다. 영향이 크면 리스크·기회 대장에, 법령 요구는 법규 대장에 옮깁니다."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {row && (
              <Badge tone={row.status === "confirmed" ? "ok" : "warn"}>
                {row.status === "confirmed"
                  ? `승인 ${fmtTime(row.confirmedAt)}`
                  : "작성 중"}
              </Badge>
            )}
            <Link
              href={`/qms/context?year=${year - 1}`}
              className={buttonClass("secondary")}
            >
              {year - 1}년
            </Link>
            {year < thisYear + 1 && (
              <Link
                href={`/qms/context?year=${year + 1}`}
                className={buttonClass("secondary")}
              >
                {year + 1}년
              </Link>
            )}
          </div>
        }
      >
        {year}년 조직 상황·이해관계자 검토
      </PageTitle>
      <ErrorBox message={q.error} />
      {q.notice && <Notice>{q.notice}</Notice>}
      {!row && from && (
        <Notice>{from}를 불러왔습니다. 바뀐 칸만 고치고 저장하세요.</Notice>
      )}

      <AssistForm
        id={`context-${year}`}
        action={contextAction}
        className="space-y-4"
      >
        <input type="hidden" name="year" value={year} />
        <input type="hidden" name="is_n" value={issues.length} />
        <input type="hidden" name="pt_n" value={parties.length} />
        <Card title="내부·외부 이슈" help={{ kind: "panel", id: "ctx.issues" }}>
          <div className="space-y-4">
            {issues.map((it, i) => (
              <div
                key={i}
                className="grid gap-2 rounded-md border border-[var(--line)] p-3 md:grid-cols-2"
              >
                <input
                  type="hidden"
                  name={`is_riskId_${i}`}
                  value={it.riskId ?? ""}
                />
                <input
                  type="hidden"
                  name={`is_riskNo_${i}`}
                  value={it.riskNo ?? ""}
                />
                {edit ? (
                  <>
                    <SelectField
                      help="ctx.area"
                      name={`is_area_${i}`}
                      defaultValue={it.area}
                      placeholder="구분 고르기"
                      from={from && it.issue ? from : undefined}
                      options={CONTEXT_AREAS.map((a) => ({
                        value: a,
                        label: a,
                      }))}
                    />
                    <TextField
                      help="ctx.issue"
                      name={`is_issue_${i}`}
                      defaultValue={it.issue}
                    />
                    <TextField
                      help="ctx.impact"
                      name={`is_impact_${i}`}
                      defaultValue={it.impact}
                    />
                    <TextField
                      help="ctx.action"
                      name={`is_action_${i}`}
                      defaultValue={it.action}
                    />
                  </>
                ) : (
                  <p className="text-sm md:col-span-2">
                    <b>{it.area}</b> · {it.issue} · 영향: {it.impact} · 대응:{" "}
                    {it.action}
                  </p>
                )}
                {it.riskNo && (
                  <p className="text-xs md:col-span-2">
                    <Badge tone="accent">리스크 대장 {it.riskNo}</Badge>
                  </p>
                )}
              </div>
            ))}
          </div>
        </Card>
        <Card title="이해관계자" help={{ kind: "panel", id: "ctx.parties" }}>
          <div className="space-y-4">
            {parties.map((p, i) =>
              edit ? (
                <div
                  key={i}
                  className="grid gap-2 rounded-md border border-[var(--line)] p-3 md:grid-cols-4"
                >
                  <TextField
                    help="ctx.party"
                    name={`pt_party_${i}`}
                    defaultValue={p.party}
                  />
                  <TextField
                    help="ctx.needs"
                    name={`pt_needs_${i}`}
                    defaultValue={p.needs}
                  />
                  <TextField
                    help="ctx.check"
                    name={`pt_check_${i}`}
                    defaultValue={p.check}
                  />
                  <TextField
                    help="ctx.std"
                    name={`pt_std_${i}`}
                    defaultValue={p.std}
                  />
                </div>
              ) : (
                <p key={i} className="text-sm">
                  <b>{p.party}</b> · 요구: {p.needs} · 확인: {p.check} · 반영:{" "}
                  {p.std}
                </p>
              ),
            )}
          </div>
        </Card>
        {edit ? (
          <>
            <TextAreaField
              help="ctx.note"
              name="note"
              rows={2}
              defaultValue={draft.note}
            />
            <div className="flex flex-wrap gap-2">
              <SubmitButton
                name="intent"
                value="save"
                variant="secondary"
                noValidate
              >
                저장
              </SubmitButton>
              <SubmitButton name="intent" value="confirm">
                승인(대표)
              </SubmitButton>
            </div>
          </>
        ) : (
          draft.note && <p className="text-sm">메모: {draft.note}</p>
        )}
      </AssistForm>

      {row && can(user, "qms.context") && row.issues.some((x) => !x.riskId) && (
        <Card
          title="리스크·기회 대장에 올리기"
          help={{ kind: "panel", id: "ctx.risk" }}
        >
          <div className="space-y-3">
            {row.issues.map((it, i) =>
              it.riskId ? null : (
                <AssistForm
                  key={i}
                  id={`ctx-risk-${year}-${i}`}
                  action={contextAction}
                  className="grid gap-2 rounded-md border border-[var(--line)] p-3 md:grid-cols-4"
                >
                  <input type="hidden" name="year" value={year} />
                  <input type="hidden" name="intent" value="risk" />
                  <input type="hidden" name="index" value={i} />
                  <p className="text-sm md:col-span-4">
                    {it.area}: {it.issue}
                  </p>
                  <RadioRow
                    help="risk.kind"
                    name="kind"
                    required
                    defaultValue="risk"
                    options={[
                      { value: "risk", label: "리스크" },
                      { value: "opp", label: "기회" },
                    ]}
                  />
                  <RadioRow
                    help="risk.likelihood"
                    name="likelihood"
                    required
                    defaultValue="2"
                    options={LEVELS}
                  />
                  <RadioRow
                    help="risk.impact"
                    name="impact"
                    required
                    defaultValue="2"
                    options={LEVELS}
                  />
                  <div className="self-end">
                    <SubmitButton variant="secondary">
                      대장에 올리기
                    </SubmitButton>
                  </div>
                </AssistForm>
              ),
            )}
          </div>
        </Card>
      )}
    </>
  );
}
