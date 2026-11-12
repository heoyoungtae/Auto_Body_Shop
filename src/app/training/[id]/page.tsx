import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/db/runtime";
import { can } from "@/modules/auth/permissions";
import { listUsers } from "@/modules/auth/service";
import { seoulDate } from "@/modules/platform/time";
import { getTraining, lastAttendees } from "@/modules/staff/training";
import {
  EFFECT_METHODS,
  EFFECT_RESULTS,
  TR_KINDS,
  TR_STATUS,
  type EffectResult,
  type TrKind,
} from "@/modules/staff/training-rules";
import { AssistForm } from "../../_assist";
import {
  CheckGroup,
  DateField,
  RadioRow,
  TextAreaField,
  TextField,
} from "../../_input";
import { requireUser } from "../../_lib/session";
import { SubmitButton } from "../../_submit";
import { Badge, Card, ErrorBox, fmtTime, Notice, PageTitle } from "../../_ui";
import { trainingAction } from "../actions";
import { TrainingFields } from "../_form";
import { LearnAdmin } from "../learn-admin";
import { learnProgress, learnView, questionsOf, stdOptions } from "@/modules/staff/elearning";
import { trainingManual } from "@/db/schema";
import { eq } from "drizzle-orm";

/** 교육 한 건(F-11-03): 계획란·이수란(이수자 서명)·효과란 */
export default async function TrainingItemPage({
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
  const r = await getTraining(db, id).catch(() => null);
  if (!r) notFound();
  const { t, attendees, names } = r;
  const manage = can(user, "training.manage");
  const mayRecord = manage || t.organizerId === user.id;
  const users = mayRecord ? (await listUsers(db)).filter((u) => u.active) : [];
  const kind = TR_KINDS[t.kind as TrKind];
  const today = seoulDate();
  const mine = attendees.find((a) => a.a.userId === user.id);
  // 앱 학습(관리자 카드): 자료·문제·현황, 고를 사내 교재·표준서
  const learn = manage
    ? await Promise.all([
        learnView(db, user, id),
        learnProgress(db, id),
        db.select({ id: trainingManual.id, no: trainingManual.no, title: trainingManual.title }).from(trainingManual).where(eq(trainingManual.status, "approved")),
        stdOptions(db),
        questionsOf(db, id),
      ])
    : null;
  // 이수자 기본값: 이미 적은 이수자 → 채용 시 교육이면 대상에 적힌 사람 → 지난 같은 종류 교육 이수자
  let defaults = attendees.map((a) => a.a.userId);
  let from: string | undefined;
  if (!defaults.length && mayRecord) {
    if (t.kind === "safety_hire" && t.target)
      defaults = users
        .filter((u) => t.target!.includes(u.name))
        .map((u) => u.id);
    if (!defaults.length) {
      defaults = await lastAttendees(db, t.kind, t.id);
      if (defaults.length) from = "지난 같은 교육";
    }
    if (!defaults.length && t.target?.startsWith("전 직원")) {
      defaults = users.map((u) => u.id);
      from = "대상(전 직원)";
    }
  }
  const back = `/training/${id}`;
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
        help="training.detail"
        sub={`${t.docNo} · ${kind?.label ?? t.kind}${kind?.legal ? " · 법정 교육" : ""}`}
        actions={
          <Link
            href={`/training?year=${t.year}`}
            className="text-sm text-[var(--accent)]"
          >
            ← 교육 훈련
          </Link>
        }
      >
        {t.title}{" "}
        <Badge
          tone={
            t.status === "done"
              ? "ok"
              : t.status === "cancelled"
                ? "neutral"
                : "warn"
          }
        >
          {TR_STATUS[t.status as keyof typeof TR_STATUS]}
        </Badge>
      </PageTitle>
      <ErrorBox message={q.error} />
      {q.notice && <Notice>{q.notice}</Notice>}

      {mine && mine.a.dueOn && (
        <Card title="앱 학습" help={{ kind: "panel", id: "learn.mine" }}>
          <p className="text-sm">
            {mine.a.signedAt ? "이수했습니다." : `${mine.a.dueOn}까지 앱에서 자료를 보고 확인합니다.`}{" "}
            <Link href={`/training/learn/${id}`} className="text-[var(--accent)]">
              {mine.a.signedAt ? "자료 다시 보기" : "학습하기"}
            </Link>
          </p>
        </Card>
      )}

      {mine && !mine.a.signedAt && !mine.a.dueOn && t.status === "done" && (
        <Card title="이수 서명" help={{ kind: "panel", id: "tr.sign" }}>
          <p className="mb-2 text-sm">
            {t.heldOn}에 {t.hours}시간 교육을 받았다면 서명하세요. 서명해야
            이수로 기록됩니다.
          </p>
          <AssistForm
            id={`tr-sign-${id}`}
            action={trainingAction}
            guard={false}
          >
            {hidden("sign")}
            <SubmitButton>교육을 받았습니다(서명)</SubmitButton>
          </AssistForm>
        </Card>
      )}

      <Card title="계획란" help={{ kind: "panel", id: "tr.plan" }}>
        <dl className="text-sm">
          {row("계획 달", t.plannedMonth ?? "수시")}
          {row("계획 시간", t.plannedHours ? `${t.plannedHours}시간` : null)}
          {row("대상", t.target)}
          {row("주관자", t.organizerId ? names.get(t.organizerId) : null)}
          {t.cancelReason && row("취소 사유", t.cancelReason)}
        </dl>
      </Card>

      <Card title="이수란" help={{ kind: "panel", id: "tr.held" }}>
        {t.status === "done" && (
          <dl className="mb-3 text-sm">
            {row("실시일", t.heldOn)}
            {row("시간", `${t.hours}시간`)}
            {row("강사", t.instructor)}
            {row("내용·자료", t.content)}
            {row(
              "이수자",
              <ul>
                {attendees.map(({ a, name }) => (
                  <li key={a.id}>
                    {name}{" "}
                    {a.signedAt ? (
                      <span className="text-xs text-[var(--muted)]">
                        · {fmtTime(a.signedAt)} 서명
                      </span>
                    ) : (
                      <Badge tone="warn">서명 전</Badge>
                    )}
                  </li>
                ))}
              </ul>,
            )}
          </dl>
        )}
        {mayRecord && t.status !== "cancelled" ? (
          <AssistForm
            id={`tr-held-${id}`}
            action={trainingAction}
            className="grid gap-3 md:grid-cols-2"
          >
            {hidden("held")}
            <input type="hidden" name="back" value={back} />
            <DateField
              help="tr.heldOn"
              name="heldOn"
              required
              defaultValue={t.heldOn ?? today}
              quick={["today"]}
            />
            <TextField
              help="tr.hours"
              name="hours"
              required
              type="number"
              inputMode="decimal"
              step={0.5}
              min={0.5}
              max={100}
              defaultValue={String(t.hours ?? t.plannedHours ?? "")}
              from={!t.hours && t.plannedHours ? "계획 시간" : undefined}
            />
            <TextField
              help="tr.instructor"
              name="instructor"
              required
              defaultValue={t.instructor ?? ""}
              suggestions={[
                "안전환경 담당(사내)",
                "공장장(사내)",
                "대표(사내)",
                "안전보건공단 온라인",
                "도료사 기술 교육",
                "고용노동부 지정 위탁 기관",
              ].map((v) => ({ value: v }))}
            />
            <div className="md:col-span-2">
              <TextAreaField
                help="tr.content"
                name="content"
                rows={2}
                defaultValue={t.content ?? ""}
              />
            </div>
            <div className="md:col-span-2">
              <CheckGroup
                help="tr.attendeeIds"
                name="attendeeIds"
                defaultChecked={defaults}
                options={users.map((u) => ({ value: u.id, label: u.name }))}
              />
              {from && (
                <p className="mt-1 text-xs text-[var(--muted)]">
                  {from}의 이수자를 불러왔습니다.
                </p>
              )}
            </div>
            <div className="md:col-span-2">
              <SubmitButton>
                {t.status === "done" ? "실시 기록 고치기" : "실시 기록"}
              </SubmitButton>
            </div>
          </AssistForm>
        ) : (
          t.status !== "done" && (
            <p className="text-sm text-[var(--muted)]">
              아직 실시 기록이 없습니다.
            </p>
          )
        )}
      </Card>

      {learn && t.status !== "cancelled" && (
        <LearnAdmin
          t={t}
          materials={learn[0].materials}
          questions={learn[4]}
          progress={learn[1]}
          users={users.map((u) => ({ value: u.id, label: u.name }))}
          manuals={learn[2].map((m) => ({ value: m.id, label: `${m.no} ${m.title}` }))}
          docs={learn[3].map((d) => ({ value: d.id, label: `${d.no} ${d.name} (${d.rev}${d.effectiveOn ? ` · ${d.effectiveOn}` : ""})` }))}
          stdRev={t.kind === "std_rev" && !learn[0].materials.length ? learn[3][0]?.id : undefined}
          today={today}
        />
      )}

      {t.effectDue && (
        <Card title="효과란" help={{ kind: "panel", id: "tr.effect" }}>
          {t.effectAt ? (
            <dl className="text-sm">
              {row(
                "확인 방법",
                EFFECT_METHODS[t.effectMethod as keyof typeof EFFECT_METHODS],
              )}
              {row(
                "결과",
                <Badge
                  tone={
                    t.effectResult === "effective"
                      ? "ok"
                      : t.effectResult === "partial"
                        ? "warn"
                        : "danger"
                  }
                >
                  {EFFECT_RESULTS[t.effectResult as EffectResult]}
                </Badge>,
              )}
              {row("근거", t.effectNote)}
              {row(
                "확인",
                `${t.effectBy ? names.get(t.effectBy) : "-"} · ${fmtTime(t.effectAt)}`,
              )}
            </dl>
          ) : can(user, "training.effect") ? (
            <AssistForm
              id={`tr-eff-${id}`}
              action={trainingAction}
              className="grid gap-3"
            >
              {hidden("effect")}
              <p className="text-xs text-[var(--muted)]">
                {t.effectDue}까지 확인합니다. 효과 없음이면 재교육 계획이 다음
                달에 자동으로 올라갑니다.
              </p>
              <RadioRow
                help="tr.effectMethod"
                name="effectMethod"
                required
                options={Object.entries(EFFECT_METHODS).map(
                  ([value, label]) => ({ value, label }),
                )}
              />
              <RadioRow
                help="tr.effectResult"
                name="effectResult"
                required
                options={[
                  {
                    value: "effective",
                    label: EFFECT_RESULTS.effective,
                    tone: "ok",
                  },
                  {
                    value: "partial",
                    label: EFFECT_RESULTS.partial,
                    tone: "warn",
                  },
                  { value: "none", label: EFFECT_RESULTS.none, tone: "danger" },
                ]}
              />
              <TextAreaField
                help="tr.effectNote"
                name="effectNote"
                required
                rows={2}
              />
              <div>
                <SubmitButton>효과 확인 기록</SubmitButton>
              </div>
            </AssistForm>
          ) : (
            <p className="text-sm text-[var(--muted)]">
              {t.effectDue}까지 공장장이 효과를 확인합니다.
            </p>
          )}
        </Card>
      )}

      {manage && t.status === "planned" && (
        <>
          <Card title="계획 고치기" help={{ kind: "panel", id: "tr.plan" }}>
            <AssistForm
              id={`tr-edit-${id}`}
              action={trainingAction}
              className="grid gap-3 md:grid-cols-2"
            >
              {hidden("update")}
              <TrainingFields t={t} users={users} year={t.year} />
              <div className="md:col-span-2">
                <SubmitButton>저장</SubmitButton>
              </div>
            </AssistForm>
          </Card>
          <Card title="취소" help={{ kind: "panel", id: "tr.cancel" }}>
            <AssistForm
              id={`tr-cancel-${id}`}
              action={trainingAction}
              className="grid gap-3"
            >
              {hidden("cancel")}
              <TextField help="tr.cancelReason" name="cancelReason" required />
              <div>
                <SubmitButton variant="danger">계획 취소</SubmitButton>
              </div>
            </AssistForm>
          </Card>
        </>
      )}
    </>
  );
}
