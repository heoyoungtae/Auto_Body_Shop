import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/db/runtime";
import { can } from "@/modules/auth/permissions";
import { listUsers } from "@/modules/auth/service";
import { getAudit, mayRecord } from "@/modules/quality/audit";
import {
  AUDIT_STATUS,
  AUDIT_TONE,
  VERDICT,
  VERDICT_TONE,
  type AuditStatus,
  type Verdict,
} from "@/modules/quality/risk-rules";
import { AssistForm } from "../../_assist";
import { RadioRow, SelectField, TextAreaField, TextField } from "../../_input";
import { requireUser } from "../../_lib/session";
import { SubmitButton } from "../../_submit";
import { Badge, Card, ErrorBox, fmtTime, Notice, PageTitle } from "../../_ui";
import { auditAction } from "../actions";
import { AuditFields } from "../_form";

/** 내부심사 한 건(F-Q-08): 계획·발견 사항·보고·대표 승인 */
export default async function AuditPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  const { id } = await params;
  const q = await searchParams;
  const user = await requireUser();
  const db = await getDb();
  const r = await getAudit(db, id).catch(() => null);
  if (!r) notFound();
  const { x, findings, names } = r;
  const status = x.status as AuditStatus;
  const record = mayRecord(user, x);
  const manage = can(user, "audit.manage");
  const users =
    manage && status === "planned"
      ? (await listUsers(db)).filter((u) => u.active)
      : [];
  const done = new Set(findings.map((f) => f.f.chapter));
  const left = x.scope.filter((c) => !done.has(c));
  const hidden = (intent: string) => (
    <>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="intent" value={intent} />
    </>
  );
  return (
    <>
      <PageTitle
        help="audits.detail"
        sub={`심사일 ${x.plannedOn} · 심사자 ${x.auditorId ? names.get(x.auditorId) : `${x.externalAuditor}(외부)`} · 피심사자 ${x.auditeeIds.map((u) => names.get(u) ?? "-").join(", ")}`}
        actions={
          <Link
            href={`/audits?y=${x.year}`}
            className="text-sm text-[var(--accent)]"
          >
            ← 내부 심사
          </Link>
        }
      >
        {x.docNo}{" "}
        <Badge tone={AUDIT_TONE[status]}>{AUDIT_STATUS[status]}</Badge>
      </PageTitle>
      <ErrorBox message={q.error} />
      {q.notice && <Notice>{q.notice}</Notice>}

      <Card title="범위와 진행" help={{ kind: "panel", id: "audit.scope" }}>
        <div className="flex flex-wrap gap-1.5">
          {x.scope.map((c) => (
            <Badge key={c} tone={done.has(c) ? "ok" : "warn"}>
              {done.has(c) ? "✓ " : ""}
              {c}
            </Badge>
          ))}
        </div>
        <p className="mt-2 text-xs text-[var(--muted)]">
          기준: {x.criteria ?? "-"}
        </p>
      </Card>

      {record && (
        <Card
          title="발견 사항 기록"
          help={{ kind: "panel", id: "audit.finding" }}
        >
          <AssistForm
            id={`audit-finding-${id}`}
            action={auditAction}
            className="grid gap-3 md:grid-cols-2"
          >
            {hidden("finding")}
            <SelectField
              help="audit.chapter"
              name="chapter"
              required
              defaultValue={left[0] ?? ""}
              options={x.scope.map((c) => ({
                value: c,
                label: done.has(c) ? `${c} (기록 있음)` : c,
              }))}
            />
            <TextField help="audit.target" name="target" />
            <div className="md:col-span-2">
              <TextAreaField
                help="audit.evidence"
                name="evidence"
                required
                rows={2}
              />
            </div>
            <div className="md:col-span-2">
              <RadioRow
                help="audit.verdict"
                name="verdict"
                required
                options={(Object.entries(VERDICT) as [Verdict, string][]).map(
                  ([value, label]) => ({
                    value,
                    label,
                    tone: VERDICT_TONE[value],
                  }),
                )}
              />
            </div>
            <div className="md:col-span-2">
              <TextAreaField help="audit.findingText" name="finding" rows={2} />
            </div>
            <div className="md:col-span-2">
              <SubmitButton>기록</SubmitButton>
            </div>
          </AssistForm>
        </Card>
      )}

      <Card
        title={`발견 사항 ${findings.length}건`}
        help={{ kind: "panel", id: "audit.findings" }}
      >
        {findings.length ? (
          <ul className="divide-y divide-[var(--line)] text-sm">
            {findings.map(({ f, by }) => (
              <li key={f.id} className="py-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={VERDICT_TONE[f.verdict as Verdict]}>
                    {VERDICT[f.verdict as Verdict]}
                  </Badge>
                  <span className="font-medium">{f.chapter}</span>
                  {f.target && <span>{f.target}</span>}
                  <span className="text-xs text-[var(--muted)]">
                    {fmtTime(f.at)} · {by ?? "-"}
                  </span>
                  {f.ncId && (
                    <Link
                      href={`/nc/${f.ncId}`}
                      className="text-xs text-[var(--accent)]"
                    >
                      부적합 보기
                    </Link>
                  )}
                  {record && !f.ncId && (
                    <AssistForm
                      id={`audit-rm-${f.id}`}
                      action={auditAction}
                      guard={false}
                    >
                      {hidden("remove")}
                      <input type="hidden" name="findingId" value={f.id} />
                      <button className="text-xs text-[var(--danger)]">
                        지우기
                      </button>
                    </AssistForm>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-[var(--muted)]">
                  확인: {f.evidence}
                </p>
                {f.finding && (
                  <p className="mt-0.5 text-xs">발견: {f.finding}</p>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-[var(--muted)]">아직 기록이 없습니다.</p>
        )}
      </Card>

      {record && (
        <Card title="보고" help={{ kind: "panel", id: "audit.report" }}>
          {left.length ? (
            <p className="text-sm text-[var(--muted)]">
              아직 기록이 없는 장: {left.join(", ")}. 모든 장을 기록해야 보고할
              수 있습니다.
            </p>
          ) : (
            <AssistForm
              id={`audit-report-${id}`}
              action={auditAction}
              className="grid gap-3"
            >
              {hidden("report")}
              <TextAreaField
                help="audit.summary"
                name="summary"
                required
                rows={3}
                defaultValue={x.summary ?? ""}
              />
              <div>
                <SubmitButton>대표에게 보고</SubmitButton>
              </div>
            </AssistForm>
          )}
        </Card>
      )}

      {x.summary && status !== "planned" && (
        <Card
          title="종합 의견·좋은 점"
          help={{ kind: "panel", id: "audit.report" }}
        >
          <p className="text-sm whitespace-pre-wrap">{x.summary}</p>
          {x.approvedAt && (
            <p className="mt-2 text-xs text-[var(--muted)]">
              {fmtTime(x.approvedAt)}{" "}
              {x.approvedBy ? names.get(x.approvedBy) : ""} 승인
            </p>
          )}
        </Card>
      )}

      {status === "reported" && can(user, "audit.approve") && (
        <Card title="대표 승인" help={{ kind: "panel", id: "audit.approve" }}>
          <div className="flex flex-wrap items-start gap-4">
            <AssistForm
              id={`audit-approve-${id}`}
              action={auditAction}
              guard={false}
            >
              {hidden("approve")}
              <SubmitButton>승인</SubmitButton>
            </AssistForm>
            <AssistForm
              id={`audit-return-${id}`}
              action={auditAction}
              className="flex flex-1 flex-wrap items-end gap-2"
            >
              {hidden("return")}
              <div className="min-w-60 flex-1">
                <TextField help="audit.returnReason" name="reason" required />
              </div>
              <SubmitButton variant="secondary">보완 요청</SubmitButton>
            </AssistForm>
          </div>
        </Card>
      )}

      {manage && status === "planned" && (
        <Card title="계획 고치기" help={{ kind: "panel", id: "audit.plan" }}>
          <AssistForm
            id={`audit-edit-${id}`}
            action={auditAction}
            className="grid gap-3 md:grid-cols-2"
          >
            {hidden("update")}
            <AuditFields a={x} users={users} />
            <div className="md:col-span-2">
              <SubmitButton>저장</SubmitButton>
            </div>
          </AssistForm>
        </Card>
      )}
    </>
  );
}
