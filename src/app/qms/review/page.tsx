import Link from "next/link";
import { getDb } from "@/db/runtime";
import { can } from "@/modules/auth/permissions";
import { reviewFor, staffOptions } from "@/modules/quality/qms";
import {
  REVIEW_INPUTS,
  type ReviewInputKey,
} from "@/modules/quality/qms-rules";
import { seoulDate } from "@/modules/platform/time";
import { AssistForm } from "../../_assist";
import { DateField, SelectField, TextAreaField, TextField } from "../../_input";
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
import { reviewAction } from "../actions";

/** 경영검토서(F-Q-09): 앱이 모은 입력 자료를 보고 항목별 의견, 다음 해 목표, 개선 과제(업무지시)를 정한다 */
export default async function ReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; notice?: string; error?: string }>;
}) {
  const q = await searchParams;
  const user = await requireUser();
  if (!can(user, "qms.review") && !can(user, "qms.docs"))
    return (
      <p className="text-sm text-[var(--muted)]">
        경영검토는 대표가 하고 품질 담당이 봅니다.
      </p>
    );
  const thisYear = Number(seoulDate().slice(0, 4));
  const year = Number(q.year) || thisYear;
  const db = await getDb();
  const { row, inputs } = await reviewFor(db, year);
  const staff = await staffOptions(db);
  const edit = can(user, "qms.review") && row?.status !== "confirmed";
  const actions = [
    ...(row?.actions ?? []),
    ...(edit
      ? Array.from({ length: 3 }, () => ({
          task: "",
          assigneeId: null,
          dueOn: null,
          instructionNo: null,
        }))
      : []),
  ];
  const nm = new Map(staff.map((s) => [s.id, s.name]));
  return (
    <>
      <PageTitle
        help="qms.review"
        sub={
          row?.status === "confirmed"
            ? `확정 ${fmtTime(row.confirmedAt)} — 입력 자료는 확정 때 고정했습니다`
            : "입력 자료는 앱 기록에서 지금 모은 것입니다. 확정하면 고정됩니다."
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {row && (
              <Badge tone={row.status === "confirmed" ? "ok" : "warn"}>
                {row.status === "confirmed" ? "확정" : "작성 중"}
              </Badge>
            )}
            <Link
              href={`/qms/review?year=${year - 1}`}
              className={buttonClass("secondary")}
            >
              {year - 1}년
            </Link>
          </div>
        }
      >
        {year}년 경영검토
      </PageTitle>
      <ErrorBox message={q.error} />
      {q.notice && <Notice>{q.notice}</Notice>}
      <AssistForm
        id={`review-${year}`}
        action={reviewAction}
        className="space-y-4"
      >
        <input type="hidden" name="year" value={year} />
        <input type="hidden" name="ac_n" value={actions.length} />
        <Card title="검토 정보" help={{ kind: "panel", id: "mr.info" }}>
          {edit ? (
            <div className="grid gap-3 md:grid-cols-2">
              <DateField
                help="mr.heldOn"
                name="heldOn"
                defaultValue={row?.heldOn ?? ""}
                quick={["today"]}
              />
              <TextField
                help="mr.attendees"
                name="attendees"
                defaultValue={row?.attendees ?? ""}
              />
            </div>
          ) : (
            <p className="text-sm">
              {row?.heldOn} · 참석 {row?.attendees}
            </p>
          )}
        </Card>
        {(Object.keys(REVIEW_INPUTS) as ReviewInputKey[]).map((k) => (
          <Card
            key={k}
            title={`${REVIEW_INPUTS[k].label} (${REVIEW_INPUTS[k].src})`}
            help={{ kind: "panel", id: "mr.input" }}
          >
            <ul className="mb-2 space-y-0.5 text-sm">
              {inputs[k].lines.map((l, i) => (
                <li key={i}>{l}</li>
              ))}
            </ul>
            {inputs[k].links?.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="mr-3 text-xs text-[var(--accent)]"
              >
                {l.label} 보기
              </Link>
            ))}
            {edit ? (
              <div className="mt-2">
                <TextField
                  help="mr.comment"
                  name={`c_${k}`}
                  defaultValue={row?.comments[k] ?? ""}
                />
              </div>
            ) : (
              <p className="mt-2 text-sm">검토 의견: {row?.comments[k]}</p>
            )}
          </Card>
        ))}
        <Card title="결정" help={{ kind: "panel", id: "mr.output" }}>
          {edit ? (
            <div className="space-y-3">
              <TextAreaField
                help="mr.nextGoals"
                name="nextGoals"
                rows={2}
                defaultValue={row?.nextGoals ?? ""}
              />
              <TextAreaField
                help="mr.resources"
                name="resources"
                rows={2}
                defaultValue={row?.resources ?? ""}
              />
            </div>
          ) : (
            <div className="space-y-1 text-sm">
              <p>다음 해 목표: {row?.nextGoals}</p>
              {row?.resources && <p>자원: {row.resources}</p>}
            </div>
          )}
        </Card>
        <Card title="개선 과제" help={{ kind: "panel", id: "mr.actions" }}>
          <div className="space-y-3">
            {actions.map((a, i) =>
              edit ? (
                <div
                  key={i}
                  className="grid gap-2 rounded-md border border-[var(--line)] p-3 md:grid-cols-3"
                >
                  <TextField
                    help="mr.task"
                    name={`ac_task_${i}`}
                    defaultValue={a.task}
                  />
                  <SelectField
                    help="mr.assignee"
                    name={`ac_assigneeId_${i}`}
                    defaultValue={a.assigneeId ?? ""}
                    placeholder="담당 고르기"
                    options={staff.map((s) => ({ value: s.id, label: s.name }))}
                  />
                  <DateField
                    help="mr.dueOn"
                    name={`ac_dueOn_${i}`}
                    defaultValue={a.dueOn ?? ""}
                    quick={["nextMonth"]}
                  />
                </div>
              ) : (
                <p key={i} className="text-sm">
                  {a.task} · {a.assigneeId ? nm.get(a.assigneeId) : "담당 없음"}{" "}
                  · {a.dueOn ?? "기한 없음"}{" "}
                  {a.instructionNo && (
                    <Badge tone="accent">업무지시 {a.instructionNo}</Badge>
                  )}
                </p>
              ),
            )}
          </div>
        </Card>
        {edit && (
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
              확정(대표)
            </SubmitButton>
          </div>
        )}
      </AssistForm>
    </>
  );
}
