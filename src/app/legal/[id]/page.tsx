import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/db/runtime";
import { can } from "@/modules/auth/permissions";
import { listUsers } from "@/modules/auth/service";
import { getLegal } from "@/modules/quality/legal";
import {
  APPLIES,
  CYCLES,
  EVAL_RESULTS,
  lawSearchUrl,
  nextDueAfter,
  type Applies,
  type Cycle,
  type EvalResult,
} from "@/modules/quality/legal-rules";
import { seoulDate } from "@/modules/platform/time";
import { AssistForm } from "../../_assist";
import { DateField, RadioRow, TextAreaField, TextField } from "../../_input";
import { requireUser } from "../../_lib/session";
import { SubmitButton } from "../../_submit";
import { Badge, Card, ErrorBox, fmtTime, Notice, PageTitle } from "../../_ui";
import { legalAction } from "../actions";
import { LegalFields } from "../_form";

const EVENT: Record<string, string> = {
  create: "올림",
  edit: "고침",
  done: "이행",
  revcheck: "개정 확인",
  inspect: "관청 점검",
  eval: "준수 평가",
};

/** 법규 항목 한 건(F-Q-06): 정보·이행 기록·관청 점검·개정 확인·이력 */
export default async function LegalItemPage({
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
  const r = await getLegal(db, id).catch(() => null);
  if (!r) notFound();
  const { x, events, ownerName } = r;
  const manage = can(user, "legal.manage");
  const mayDo = manage || x.ownerId === user.id;
  const users = manage ? (await listUsers(db)).filter((u) => u.active) : [];
  const today = seoulDate(new Date());
  const nextHint = nextDueAfter(x.cycle as Cycle, today);
  const back = `/legal/${id}`;
  const row = (k: string, v: React.ReactNode) => (
    <div className="flex gap-2 py-1">
      <dt className="w-28 shrink-0 text-[var(--muted)]">{k}</dt>
      <dd className="min-w-0 whitespace-pre-wrap">{v || "-"}</dd>
    </div>
  );
  return (
    <>
      <PageTitle
        help="legal.detail"
        sub={`${x.area}${x.clause ? ` · ${x.clause}` : ""}${x.stdRef ? ` · 표준서 ${x.stdRef}` : ""}`}
        actions={
          <Link href="/legal" className="text-sm text-[var(--accent)]">
            ← 법규 대장
          </Link>
        }
      >
        {x.lawName}{" "}
        <Badge
          tone={
            x.applies === "yes"
              ? "ok"
              : x.applies === "check"
                ? "warn"
                : "neutral"
          }
        >
          {APPLIES[x.applies as Applies]}
        </Badge>
      </PageTitle>
      <ErrorBox message={q.error} />
      {q.notice && <Notice>{q.notice}</Notice>}

      <Card title="항목 정보" help={{ kind: "panel", id: "legal.info" }}>
        <dl className="text-sm">
          {row("의무", x.duty)}
          {row("대상 여부 근거", x.basis)}
          {row("담당", ownerName)}
          {row("주기", CYCLES[x.cycle as Cycle])}
          {row("다음 기한", x.nextDue)}
          {row("증빙", x.evidence)}
          {row("관할 기관", x.authority)}
          {row("인허가 번호", x.permitNo)}
          {row("유효기간", x.validUntil)}
          {row("개정 확인", x.revCheckedOn)}
          {row("메모", x.note)}
        </dl>
        <a
          href={lawSearchUrl(x.lawName)}
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-block text-sm text-[var(--accent)]"
        >
          국가법령정보센터에서 조문 보기 ↗
        </a>
      </Card>

      {mayDo && x.applies !== "no" && (
        <Card title="이행 기록" help={{ kind: "panel", id: "legal.done" }}>
          <AssistForm
            id={`legal-done-${id}`}
            action={legalAction}
            className="grid gap-3 md:grid-cols-2"
          >
            <input type="hidden" name="id" value={id} />
            <input type="hidden" name="intent" value="done" />
            <input type="hidden" name="back" value={back} />
            <DateField
              help="legal.doneOn"
              name="doneOn"
              required
              defaultValue={today}
              quick={["today"]}
            />
            <TextField
              help="legal.doneEvidence"
              name="doneEvidence"
              required
              from={x.evidence ? "지난 증빙" : undefined}
              defaultValue={x.evidence ?? ""}
            />
            {(x.validUntil || x.permitNo) && (
              <DateField
                help="legal.newValidUntil"
                name="newValidUntil"
                quick={[]}
              />
            )}
            <p className="text-xs text-[var(--muted)] md:col-span-2">
              {nextHint
                ? `${CYCLES[x.cycle as Cycle]} 주기라서 저장하면 다음 기한이 이행일 기준으로 저절로 정해집니다(오늘 이행이면 ${nextHint}).`
                : "1회·수시 항목은 다음 기한이 바뀌지 않습니다. 필요하면 '고치기'에서 바꾸세요."}
            </p>
            <div className="md:col-span-2">
              <SubmitButton>이행 기록</SubmitButton>
            </div>
          </AssistForm>
        </Card>
      )}

      {manage && (
        <Card
          title="관청 점검·지적"
          help={{ kind: "panel", id: "legal.inspect" }}
        >
          <AssistForm
            id={`legal-inspect-${id}`}
            action={legalAction}
            className="grid gap-3 md:grid-cols-2"
          >
            <input type="hidden" name="id" value={id} />
            <input type="hidden" name="intent" value="inspect" />
            <input type="hidden" name="back" value={back} />
            <DateField
              help="legal.inspectOn"
              name="inspectOn"
              required
              defaultValue={today}
              quick={["today"]}
            />
            <DateField
              help="legal.fixDue"
              name="fixDue"
              quick={["week", "nextMonth"]}
            />
            <div className="md:col-span-2">
              <TextAreaField help="legal.finding" name="finding" rows={2} />
            </div>
            <div className="md:col-span-2">
              <SubmitButton>점검 기록</SubmitButton>
            </div>
          </AssistForm>
        </Card>
      )}

      {manage && (
        <Card
          title="법령 개정 확인"
          help={{ kind: "panel", id: "legal.revcheck" }}
        >
          <AssistForm
            id={`legal-rev-${id}`}
            action={legalAction}
            className="grid gap-3"
          >
            <input type="hidden" name="id" value={id} />
            <input type="hidden" name="intent" value="revcheck" />
            <input type="hidden" name="back" value={back} />
            <RadioRow
              help="legal.changed"
              name="changed"
              required
              defaultValue="0"
              options={[
                { value: "0", label: "개정 없음", tone: "ok" },
                { value: "1", label: "개정 있음", tone: "warn" },
              ]}
            />
            <TextAreaField help="legal.revNote" name="revNote" rows={2} />
            <div>
              <SubmitButton>확인 기록</SubmitButton>
            </div>
          </AssistForm>
        </Card>
      )}

      {manage && (
        <Card title="고치기" help={{ kind: "panel", id: "legal.edit" }}>
          <AssistForm
            id={`legal-edit-${id}`}
            action={legalAction}
            className="grid gap-3 md:grid-cols-2"
          >
            <input type="hidden" name="id" value={id} />
            <input type="hidden" name="intent" value="update" />
            <input type="hidden" name="back" value={back} />
            <LegalFields l={x} users={users} />
            <div className="md:col-span-2">
              <SubmitButton>저장</SubmitButton>
            </div>
          </AssistForm>
        </Card>
      )}

      <Card title="이력" help={{ kind: "panel", id: "legal.history" }}>
        {events.length ? (
          <ul className="divide-y divide-[var(--line)] text-sm">
            {events.map(({ e, by }) => (
              <li key={e.id} className="py-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge
                    tone={
                      e.kind === "eval" && e.result === "lacking"
                        ? "danger"
                        : e.kind === "revcheck" && e.changed
                          ? "warn"
                          : "neutral"
                    }
                  >
                    {EVENT[e.kind] ?? e.kind}
                  </Badge>
                  {e.kind === "eval" && e.year && (
                    <span>
                      {e.year}년 {EVAL_RESULTS[e.result as EvalResult]}
                    </span>
                  )}
                  <span className="text-xs text-[var(--muted)]">
                    {fmtTime(e.at)} · {by ?? "-"}
                  </span>
                  {e.ncId && (
                    <Link
                      href={`/nc/${e.ncId}`}
                      className="text-xs text-[var(--accent)]"
                    >
                      부적합 보기
                    </Link>
                  )}
                </div>
                {e.detail && (
                  <p className="mt-0.5 text-xs whitespace-pre-wrap text-[var(--muted)]">
                    {e.detail}
                  </p>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-[var(--muted)]">아직 기록이 없습니다.</p>
        )}
      </Card>
    </>
  );
}
