import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/db/runtime";
import { listUsers } from "@/modules/auth/service";
import { ROLE_LABEL, type Role } from "@/modules/auth/roles";
import { KINDS, REMIND_OPTIONS, REPEATS, SCOPES, timeLabel, type Kind, type Repeat, type Scope } from "@/modules/schedule/rules";
import { getEvent } from "@/modules/schedule/service";
import { AssistForm } from "../../_assist";
import { TextField } from "../../_input";
import { requireUser } from "../../_lib/session";
import { SubmitButton } from "../../_submit";
import { Badge, Card, ErrorBox, fmtTime, Notice, PageTitle } from "../../_ui";
import { EventForm } from "../_form";
import { cancelEventAction, updateEventAction } from "../actions";

/** 일정 한 건: 내용, 고치기, 취소 */
export default async function EventPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; notice?: string }> }) {
  const { id } = await params;
  const q = await searchParams;
  const user = await requireUser();
  const db = await getDb();
  const r = await getEvent(db, user, id).catch(() => null);
  if (!r) notFound();
  const { e, name, attendees, editable } = r;
  const scope = e.scope as "shop" | "personal";
  const users = editable && scope === "shop" ? (await listUsers(db)).filter((u) => u.active).map((u) => ({ id: u.id, label: `${u.name}(${u.roles.map((x) => ROLE_LABEL[x as Role]).join("·")})` })) : [];
  const period = e.endOn !== e.startOn ? `${e.startOn} ~ ${e.endOn}` : e.startOn;
  return (
    <>
      <PageTitle
        help="schedule.detail"
        sub={scope === "shop" ? "사내 공용 일정 · 모든 직원이 봅니다" : "개인 일정 · 나만 봅니다"}
        actions={
          <Link href={`/schedule?m=${e.startOn.slice(0, 7)}&d=${e.startOn}`} className="text-sm text-[var(--accent)]">
            ← 일정표
          </Link>
        }
      >
        {e.title}
      </PageTitle>
      <ErrorBox message={q.error} />
      {q.notice && <Notice>{q.notice}</Notice>}
      <div className="grid gap-4 xl:grid-cols-2">
        <Card title="일정" help={{ kind: "panel", id: "schedule.info" }}>
          <dl className="grid grid-cols-[6rem_1fr] gap-x-2 gap-y-1.5 text-sm">
            <dt className="text-[var(--muted)]">구분</dt>
            <dd className="flex flex-wrap gap-1">
              <Badge tone={scope === "shop" ? "accent" : "ok"}>{SCOPES[scope as Scope]}</Badge>
              <Badge tone={e.kind === "off" ? "danger" : "neutral"}>{KINDS[e.kind as Kind] ?? e.kind}</Badge>
              {e.cancelledAt && <Badge tone="danger">취소됨</Badge>}
            </dd>
            <dt className="text-[var(--muted)]">날짜</dt>
            <dd>{period}</dd>
            <dt className="text-[var(--muted)]">시각</dt>
            <dd>{timeLabel(e.startTime, e.endTime)}</dd>
            {e.place && (
              <>
                <dt className="text-[var(--muted)]">장소</dt>
                <dd>{e.place}</dd>
              </>
            )}
            {scope === "shop" && (
              <>
                <dt className="text-[var(--muted)]">참석자</dt>
                <dd>{attendees.length ? attendees.join(", ") : "전 직원"}</dd>
              </>
            )}
            <dt className="text-[var(--muted)]">반복</dt>
            <dd>
              {REPEATS[e.repeat as Repeat] ?? e.repeat}
              {e.repeat !== "none" && (e.repeatUntil ? ` (${e.repeatUntil}까지)` : " (끝 없음)")}
            </dd>
            <dt className="text-[var(--muted)]">알림</dt>
            <dd>{REMIND_OPTIONS.find((o) => o.value === (e.remindDays == null ? "" : String(e.remindDays)))?.label}</dd>
            {e.note && (
              <>
                <dt className="text-[var(--muted)]">메모</dt>
                <dd className="whitespace-pre-wrap">{e.note}</dd>
              </>
            )}
            <dt className="text-[var(--muted)]">올린 사람</dt>
            <dd>
              {name(e.ownerId)} · {fmtTime(e.createdAt)}
              {e.updatedBy && <span className="text-xs text-[var(--muted)]"> (고침 {name(e.updatedBy)} {fmtTime(e.updatedAt)})</span>}
            </dd>
            {e.cancelledAt && (
              <>
                <dt className="text-[var(--muted)]">취소</dt>
                <dd>
                  {name(e.cancelledBy)} · {fmtTime(e.cancelledAt)}
                  {e.cancelReason && ` · ${e.cancelReason}`}
                </dd>
              </>
            )}
          </dl>
          {!editable && !e.cancelledAt && <p className="mt-3 text-xs text-[var(--muted)]">공용 일정은 올린 사람({name(e.ownerId)})이나 대표가 고칩니다.</p>}
        </Card>
        {editable && (
          <Card title="취소" help={{ kind: "panel", id: "schedule.cancel" }}>
            <AssistForm id={`sch-cancel-${e.id}`} action={cancelEventAction} className="grid gap-3">
              <input type="hidden" name="id" value={e.id} />
              <input type="hidden" name="date" value={e.startOn} />
              <TextField help="schedule.cancelReason" name="cancelReason" required={scope === "shop"} />
              <div>
                <SubmitButton variant="danger">일정 취소</SubmitButton>
              </div>
            </AssistForm>
          </Card>
        )}
      </div>
      {editable && (
        <div className="mt-4">
          <Card title="고치기" help={{ kind: "panel", id: "schedule.form" }}>
            <EventForm formId={`sch-edit-${e.id}`} action={updateEventAction} scope={scope} users={users} id={e.id} submit="고친 내용 저장" values={e} />
          </Card>
        </div>
      )}
    </>
  );
}
