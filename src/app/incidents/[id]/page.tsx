import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/db/runtime";
import { can } from "@/modules/auth/permissions";
import { getIncident } from "@/modules/safety/incident";
import {
  INC_KIND,
  INC_SEVERITY,
  INC_STATUS,
  INC_TONE,
  type IncKind,
  type IncSeverity,
  type IncStatus,
} from "@/modules/safety/rules";
import { AssistForm } from "../../_assist";
import { DateField, RadioRow, TextAreaField, TextField } from "../../_input";
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
import { incidentAction } from "../actions";

/** 사고·아차사고 보고서 한 건(F-09-03): 보고 · 조사(원인·재발 방지) · 종결(법정 신고·위험성평가) */
export default async function IncidentPage({
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
  const r = await getIncident(db, user, id).catch(() => null);
  if (!r) notFound();
  const { x, names, injured, injury, hidden } = r;
  const status = x.status as IncStatus;
  const severe = x.severity === "lost_time" || x.severity === "serious";
  const row = (k: string, v: React.ReactNode) => (
    <div className="flex gap-2 py-1">
      <dt className="w-28 shrink-0 text-[var(--muted)]">{k}</dt>
      <dd className="min-w-0 whitespace-pre-wrap">{v || "-"}</dd>
    </div>
  );
  const hiddenFields = (intent: string) => (
    <>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="intent" value={intent} />
    </>
  );
  return (
    <>
      <PageTitle
        help="incidents.detail"
        sub={`${fmtTime(x.occurredAt)} · ${x.place}${x.process ? ` · ${x.process}` : ""} · 보고 ${x.reportedBy ? names.get(x.reportedBy) : "-"}(${fmtTime(x.reportedAt)})`}
        actions={
          <Link href="/incidents" className="text-sm text-[var(--accent)]">
            ← 사고·아차사고
          </Link>
        }
      >
        {x.docNo}{" "}
        <Badge tone={x.kind === "accident" ? "danger" : "warn"}>
          {INC_KIND[x.kind as IncKind]}
        </Badge>{" "}
        <Badge tone={INC_TONE[status]}>{INC_STATUS[status]}</Badge>
      </PageTitle>
      <ErrorBox message={q.error} />
      {q.notice && <Notice>{q.notice}</Notice>}
      {x.severity === "serious" && status !== "closed" && (
        <p className="mb-3 rounded-md border border-[var(--danger)] bg-[var(--danger-soft)] p-3 text-sm">
          중대재해입니다. 관할 지방고용노동관서에 지체 없이 보고해야 합니다(법규
          대장 산업안전보건법 참고).
        </p>
      )}

      <Card title="보고 내용" help={{ kind: "panel", id: "inc.report" }}>
        <dl className="text-sm">
          {row("경위", x.description)}
          {row("부상 정도", INC_SEVERITY[x.severity as IncSeverity])}
          {row(
            "다친 사람",
            hidden ? "안전환경 담당·공장장·대표만 봅니다" : injured,
          )}
          {row(
            "부상 내용",
            hidden ? "안전환경 담당·공장장·대표만 봅니다" : injury,
          )}
          {row("물적 피해", x.damage)}
          {row("응급 조치", x.immediate)}
          {row("원인", x.cause)}
          {row("재발 방지", x.prevention)}
          {x.investigatedBy &&
            row(
              "조사",
              `${names.get(x.investigatedBy)} · ${fmtTime(x.investigatedAt)}`,
            )}
          {status === "closed" &&
            row(
              "법정 신고",
              x.legalNeeded
                ? `대상 · ${x.legalReportedOn} 신고`
                : `대상 아님${x.legalNote ? ` · ${x.legalNote}` : ""}`,
            )}
          {status === "closed" && row("위험성평가", x.hazardReview)}
        </dl>
        {x.ncId && (
          <Link
            href={`/nc/${x.ncId}`}
            className="mt-2 inline-block text-sm text-[var(--accent)]"
          >
            부적합 보고서 보기
          </Link>
        )}
      </Card>

      {status !== "closed" && can(user, "incident.investigate") && (
        <Card
          title={
            status === "investigated"
              ? "원인·재발 방지 고치기"
              : "조사: 원인·재발 방지"
          }
          help={{ kind: "panel", id: "inc.investigate" }}
        >
          <AssistForm
            id={`inc-inv-${id}`}
            action={incidentAction}
            className="grid gap-3 md:grid-cols-2"
          >
            {hiddenFields("investigate")}
            <div className="md:col-span-2">
              <TextAreaField
                help="inc.cause"
                name="cause"
                required
                rows={2}
                defaultValue={x.cause ?? ""}
              />
            </div>
            <div className="md:col-span-2">
              <TextAreaField
                help="inc.prevention"
                name="prevention"
                required
                rows={2}
                defaultValue={x.prevention ?? ""}
              />
            </div>
            <TextField
              help="inc.damage"
              name="damage"
              defaultValue={x.damage ?? ""}
            />
            <TextField
              help="inc.immediate"
              name="immediate"
              defaultValue={x.immediate ?? ""}
            />
            <div className="md:col-span-2">
              <SubmitButton>저장</SubmitButton>
            </div>
          </AssistForm>
        </Card>
      )}

      {status === "investigated" && can(user, "safety.manage") && (
        <Card title="종결" help={{ kind: "panel", id: "inc.close" }}>
          <Link
            href={`/hazards/new?kind=adhoc&incident=${id}`}
            className={`${buttonClass("secondary")} mb-3`}
          >
            이 사고로 수시 위험성평가 시작
          </Link>
          <AssistForm
            id={`inc-close-${id}`}
            action={incidentAction}
            className="grid gap-3 md:grid-cols-2"
          >
            {hiddenFields("close")}
            <div className="md:col-span-2">
              <RadioRow
                help="inc.legalNeeded"
                name="legalNeeded"
                required
                defaultValue={
                  severe ? "1" : x.kind === "near" ? "0" : undefined
                }
                options={[
                  { value: "1", label: "신고 대상", tone: "danger" },
                  { value: "0", label: "대상 아님", tone: "ok" },
                ]}
              />
            </div>
            <DateField
              help="inc.legalReportedOn"
              name="legalReportedOn"
              quick={["today"]}
            />
            <TextField help="inc.legalNote" name="legalNote" />
            <div className="md:col-span-2">
              <TextField help="inc.hazardReview" name="hazardReview" required />
            </div>
            <div className="md:col-span-2">
              <SubmitButton>종결</SubmitButton>
            </div>
          </AssistForm>
        </Card>
      )}
    </>
  );
}
