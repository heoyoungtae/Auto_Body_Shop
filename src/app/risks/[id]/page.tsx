import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/db/runtime";
import { can } from "@/modules/auth/permissions";
import { listUsers } from "@/modules/auth/service";
import { getRisk } from "@/modules/quality/risk";
import {
  RISK_KIND,
  RISK_STATUS,
  RISK_TONE,
  scoreTone,
  type RiskKind,
  type RiskStatus,
} from "@/modules/quality/risk-rules";
import { AssistForm } from "../../_assist";
import { DateField, SelectField, TextAreaField, TextField } from "../../_input";
import { requireUser } from "../../_lib/session";
import { SubmitButton } from "../../_submit";
import { Badge, Card, ErrorBox, fmtTime, Notice, PageTitle } from "../../_ui";
import { riskAction } from "../actions";
import { ResidualFields, RiskFields } from "../_form";

const EVENT: Record<string, string> = {
  create: "올림",
  edit: "고침",
  plan: "대응 계획",
  done: "대응 끝",
  close: "종료",
  reopen: "다시 엶",
};

/** 리스크·기회 한 건(F-Q-03) */
export default async function RiskPage({
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
  const r = await getRisk(db, id).catch(() => null);
  if (!r) notFound();
  const { x, events, names, threshold } = r;
  const manage = can(user, "risk.manage");
  const status = x.status as RiskStatus;
  const editable = manage || (x.createdBy === user.id && status === "open");
  const mayFinish = status === "acting" && (manage || x.ownerId === user.id);
  const users = manage ? (await listUsers(db)).filter((u) => u.active) : [];
  const hidden = (intent: string) => (
    <>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="intent" value={intent} />
    </>
  );
  const row = (k: string, v: React.ReactNode) => (
    <div className="flex gap-2 py-1">
      <dt className="w-28 shrink-0 text-[var(--muted)]">{k}</dt>
      <dd className="min-w-0 whitespace-pre-wrap">{v || "-"}</dd>
    </div>
  );
  return (
    <>
      <PageTitle
        help="risks.detail"
        sub={`${x.docNo} · ${RISK_KIND[x.kind as RiskKind]}${x.chapter ? ` · ${x.chapter}` : ""}${x.source ? ` · ${x.source}` : ""}`}
        actions={
          <Link href="/risks" className="text-sm text-[var(--accent)]">
            ← 리스크·기회
          </Link>
        }
      >
        {x.content}{" "}
        <Badge tone={scoreTone(x.score, threshold)}>{x.score}점</Badge>{" "}
        <Badge tone={RISK_TONE[status]}>{RISK_STATUS[status]}</Badge>
      </PageTitle>
      <ErrorBox message={q.error} />
      {q.notice && <Notice>{q.notice}</Notice>}

      <Card title="내용" help={{ kind: "panel", id: "risk.info" }}>
        <dl className="text-sm">
          {row(
            "점수",
            `가능성 ${x.likelihood} × 영향 ${x.impact} = ${x.score}점${x.score >= threshold ? ` (${threshold}점 이상)` : ""}`,
          )}
          {row("현재 관리", x.control)}
          {row("대응 계획", x.plan)}
          {row(
            "담당·기한",
            x.ownerId
              ? `${names.get(x.ownerId) ?? "-"} · ${x.due ?? "-"}`
              : null,
          )}
          {row("대응 결과", x.result)}
          {row("올린 사람", x.createdBy ? names.get(x.createdBy) : null)}
        </dl>
      </Card>

      {mayFinish && (
        <Card title="대응 끝" help={{ kind: "panel", id: "risk.finish" }}>
          <AssistForm
            id={`risk-finish-${id}`}
            action={riskAction}
            className="grid gap-3 md:grid-cols-2"
          >
            {hidden("finish")}
            <div className="md:col-span-2">
              <TextAreaField
                help="risk.result"
                name="result"
                required
                rows={2}
              />
            </div>
            <ResidualFields
              likelihood={x.likelihood}
              impact={x.impact}
              threshold={threshold}
            />
            <div className="md:col-span-2">
              <SubmitButton>대응 끝 기록</SubmitButton>
            </div>
          </AssistForm>
        </Card>
      )}

      {manage && status !== "closed" && (
        <Card
          title={x.plan ? "대응 계획 고치기" : "대응 계획 정하기"}
          help={{ kind: "panel", id: "risk.plan" }}
        >
          {x.score >= threshold && !x.plan && (
            <p className="mb-2 text-sm text-[var(--danger)]">
              {threshold}점 이상입니다. 대응 계획·담당·기한을 정하세요.
            </p>
          )}
          <AssistForm
            id={`risk-plan-${id}`}
            action={riskAction}
            className="grid gap-3 md:grid-cols-2"
          >
            {hidden("plan")}
            <div className="md:col-span-2">
              <TextAreaField
                help="risk.plan"
                name="plan"
                required
                rows={2}
                defaultValue={x.plan ?? ""}
              />
            </div>
            <SelectField
              help="risk.ownerId"
              name="ownerId"
              required
              defaultValue={x.ownerId ?? ""}
              placeholder="담당 고르기"
              options={users.map((u) => ({ value: u.id, label: u.name }))}
            />
            <DateField
              help="risk.due"
              name="due"
              required
              defaultValue={x.due ?? ""}
              quick={["week", "nextMonth"]}
            />
            <div className="md:col-span-2">
              <SubmitButton>
                {status === "done" ? "추가 대응 계획" : "계획 저장"}
              </SubmitButton>
            </div>
          </AssistForm>
        </Card>
      )}

      {editable && (status === "open" || manage) && (
        <Card title="고치기" help={{ kind: "panel", id: "risk.edit" }}>
          <AssistForm
            id={`risk-edit-${id}`}
            action={riskAction}
            className="grid gap-3 md:grid-cols-2"
          >
            {hidden("update")}
            <RiskFields r={x} threshold={threshold} />
            <div className="md:col-span-2">
              <SubmitButton>저장</SubmitButton>
            </div>
          </AssistForm>
        </Card>
      )}

      {manage && (
        <Card
          title={
            status === "closed" || status === "done" ? "다시 열기" : "종료"
          }
          help={{ kind: "panel", id: "risk.close" }}
        >
          <AssistForm
            id={`risk-close-${id}`}
            action={riskAction}
            className="grid gap-3"
          >
            {hidden(
              status === "closed" || status === "done" ? "reopen" : "close",
            )}
            <TextField
              help="risk.reason"
              name="reason"
              required={status !== "closed" && status !== "done"}
            />
            <div>
              <SubmitButton>
                {status === "closed" || status === "done"
                  ? "다시 열기"
                  : "종료"}
              </SubmitButton>
            </div>
          </AssistForm>
        </Card>
      )}

      <Card title="이력" help={{ kind: "panel", id: "risk.history" }}>
        <ul className="divide-y divide-[var(--line)] text-sm">
          {events.map(({ e, by }) => (
            <li key={e.id} className="py-2">
              <Badge>{EVENT[e.kind] ?? e.kind}</Badge>{" "}
              <span className="text-xs text-[var(--muted)]">
                {fmtTime(e.at)} · {by ?? "-"}
              </span>
              {e.detail && (
                <p className="mt-0.5 text-xs text-[var(--muted)]">{e.detail}</p>
              )}
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
