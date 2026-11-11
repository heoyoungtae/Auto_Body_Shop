// 업무일지 '내가 적는 칸'(특이사항·내일 할 일·앱 밖에서 한 일·건의·안전 확인)과 마감·덧붙이기·확인
import Link from "next/link";
import type { dailyJournal } from "@/db/schema";
import { JOURNAL_STATUS, OFF_APP_KINDS, type JournalStatus } from "@/modules/journal/entry";
import { AssistForm } from "../_assist";
import { RadioRow, SelectField, TextAreaField, TextField } from "../_input";
import { SubmitButton } from "../_submit";
import { Badge, Card, fmtTime } from "../_ui";
import { entryAction, reviewAction } from "./actions";

type Entry = typeof dailyJournal.$inferSelect;
type Plan = { next: string; items: { text: string; ref: string; href: string; due?: string; kind: string }[] };

const TONE: Record<JournalStatus, "neutral" | "ok" | "warn" | "accent"> = { draft: "neutral", closed: "accent", returned: "warn", confirmed: "ok" };

export function StatusLine({ e, confirmerLabel }: { e: Entry | null; confirmerLabel: string | null }) {
  const st = (e?.status ?? "draft") as JournalStatus;
  return (
    <p className="flex flex-wrap items-center gap-2 text-sm">
      <Badge tone={TONE[st]}>{e ? JOURNAL_STATUS[st] : "아직 안 씀"}</Badge>
      {e?.closedAt && <span className="text-[var(--muted)]">마감 {fmtTime(e.closedAt)}</span>}
      {e?.confirmedAt && e.confirmedBy && <span className="text-[var(--muted)]">확인 {fmtTime(e.confirmedAt)}</span>}
      {st !== "confirmed" && confirmerLabel && <span className="text-[var(--muted)]">확인: {confirmerLabel}</span>}
      {!confirmerLabel && <span className="text-[var(--muted)]">대표 본인 일지는 마감하면 끝(확인 없음)</span>}
    </p>
  );
}

function PlanList({ plan }: { plan: Plan }) {
  return (
    <div className="rounded-md border border-[var(--line)] p-2 text-sm">
      <p className="mb-1 text-xs text-[var(--muted)]">저절로 채운 내일({plan.next}) 할 일 — 넘어가는 일·배정된 공정·기한 된 지시</p>
      {plan.items.length === 0 ? (
        <p className="text-[var(--muted)]">앱에 잡힌 내일 할 일이 없습니다.</p>
      ) : (
        <ul className="space-y-0.5">
          {plan.items.map((i, k) => (
            <li key={k}>
              <Badge>{i.kind}</Badge>{" "}
              <Link href={i.href} className="text-[var(--accent)]">
                {i.text}
              </Link>{" "}
              <span className="text-xs text-[var(--muted)]">{i.ref}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ReadView({ e, day }: { e: Entry; day: string }) {
  const row = (label: string, v: React.ReactNode) => (
    <div>
      <p className="text-xs text-[var(--muted)]">{label}</p>
      <div className="whitespace-pre-wrap text-sm">{v || <span className="text-[var(--muted)]">없음</span>}</div>
    </div>
  );
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {row("특이사항", e.notes)}
      {row("내일 할 일 메모", e.tomorrow)}
      {row(
        "앱 밖에서 한 일",
        e.offApp.length ? (
          <ul>
            {e.offApp.map((o, i) => (
              <li key={i}>
                {o.from || o.to ? `${o.from}~${o.to} ` : ""}
                <b>{o.kind}</b> {o.detail}
              </li>
            ))}
          </ul>
        ) : null,
      )}
      {row(
        "건의",
        e.suggestionText ? (
          <>
            {e.suggestionText}
            {e.suggestionNo ? <Badge tone="ok">개선 제안 {e.suggestionNo}</Badge> : <Link href={`/suggestions/new?jd=${day}&problem=${encodeURIComponent(e.suggestionText)}`} className="ml-2 text-xs text-[var(--accent)]">개선 제안으로 올리기</Link>}
          </>
        ) : null,
      )}
      {row(
        "안전 확인",
        e.safetyOk === null ? null : e.safetyOk ? (
          <Badge tone="ok">다치거나 아차사고 없음</Badge>
        ) : (
          <>
            <Badge tone="danger">있음</Badge> {e.safetyNote}
          </>
        ),
      )}
      {e.addenda.length > 0 &&
        row(
          "덧붙임",
          <ul>
            {e.addenda.map((a, i) => (
              <li key={i}>
                <span className="text-xs text-[var(--muted)]">{fmtTime(a.at)}</span> {a.text}
              </li>
            ))}
          </ul>,
        )}
    </div>
  );
}

/** 본인: 작성 중·보완 요청이면 칸, 마감했으면 읽기 + 덧붙이기 */
export function MyEntryPanel({ e, day, plan, confirmerLabel }: { e: Entry | null; day: string; plan: Plan; confirmerLabel: string | null }) {
  const open = !e || e.status === "draft" || e.status === "returned";
  const rows = [...(e?.offApp ?? []), ...Array.from({ length: Math.max(2, 4 - (e?.offApp.length ?? 0)) }, () => ({ from: "", to: "", kind: "", detail: "" }))];
  const safety = e?.safetyOk === true ? "yes" : e?.safetyOk === false ? "no" : undefined;
  return (
    <Card title="내가 적는 칸" help={{ kind: "panel", id: "journal.mine" }}>
      <StatusLine e={e} confirmerLabel={confirmerLabel} />
      {e?.status === "returned" && <p className="my-2 rounded-md border border-[var(--warn)] bg-[var(--warn-soft)] px-3 py-2 text-sm">보완 요청: {e.returnNote}</p>}
      {open ? (
        <AssistForm id={`journal-${day}`} action={entryAction} draft className="mt-3 grid gap-3 md:grid-cols-2">
          <input type="hidden" name="day" value={day} />
          <div className="md:col-span-2">
            <TextAreaField help="journal.notes" name="notes" rows={3} defaultValue={e?.notes ?? ""} />
            <p className="mt-1 text-xs text-[var(--muted)]">
              설비가 고장 났으면{" "}
              <Link href="/equipment" className="text-[var(--accent)]">
                설비 고장 보고
              </Link>
              , 고객 불만이면{" "}
              <Link href="/complaints/new" className="text-[var(--accent)]">
                불만 접수
              </Link>
              로 따로 올려야 처리 흐름이 시작됩니다.
            </p>
          </div>
          <div className="md:col-span-2">
            <PlanList plan={plan} />
          </div>
          <div className="md:col-span-2">
            <TextAreaField help="journal.tomorrow" name="tomorrow" rows={2} defaultValue={e?.tomorrow ?? ""} />
          </div>
          <div className="md:col-span-2">
            <p className="mb-1 text-sm font-medium">앱 밖에서 한 일</p>
            <div className="space-y-2">
              {rows.map((r, i) => (
                <div key={i} className="grid gap-2 sm:grid-cols-[7rem_7rem_12rem_1fr]">
                  <TextField help="journal.offFrom" name="offFrom" type="time" defaultValue={r.from} />
                  <TextField help="journal.offTo" name="offTo" type="time" defaultValue={r.to} />
                  <SelectField help="journal.offKind" name="offKind" placeholder="고르기" defaultValue={r.kind} options={OFF_APP_KINDS.map((k) => ({ value: k, label: k }))} />
                  <TextField help="journal.offDetail" name="offDetail" defaultValue={r.detail} />
                </div>
              ))}
            </div>
          </div>
          <div className="md:col-span-2">
            <TextAreaField help="journal.suggestion" name="suggestionText" rows={2} defaultValue={e?.suggestionText ?? ""} />
          </div>
          <RadioRow
            help="journal.safety"
            name="safety"
            defaultValue={safety}
            options={[
              { value: "yes", label: "없음", tone: "ok" },
              { value: "no", label: "있음", tone: "danger" },
            ]}
          />
          <TextField help="journal.safetyNote" name="safetyNote" defaultValue={e?.safetyNote ?? ""} />
          <div className="flex flex-wrap gap-2 md:col-span-2">
            <SubmitButton name="intent" value="save" variant="secondary" noValidate>
              저장(작성 중)
            </SubmitButton>
            <SubmitButton name="intent" value="close">
              마감하기
            </SubmitButton>
          </div>
        </AssistForm>
      ) : (
        <div className="mt-3 space-y-3">
          <ReadView e={e!} day={day} />
          {e!.safetyOk === false && (
            <Link href={`/incidents/new?kind=near&on=${day}&desc=${encodeURIComponent(e!.safetyNote ?? "")}`} className="text-sm text-[var(--accent)]">
              사고·아차사고 보고서 쓰기(내용 불러옴)
            </Link>
          )}
          <AssistForm id={`journal-add-${day}`} action={entryAction} className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="day" value={day} />
            <div className="min-w-64 flex-1">
              <TextField help="journal.addendum" name="addendum" required />
            </div>
            <SubmitButton name="intent" value="addendum" variant="secondary">
              덧붙이기
            </SubmitButton>
          </AssistForm>
        </div>
      )}
    </Card>
  );
}

/** 다른 사람 일지: 읽기 + (확인할 사람이면) 확인·보완 요청 */
export function OtherEntryPanel({ e, day, userId, canReview, confirmerLabel }: { e: Entry | null; day: string; userId: string; canReview: boolean; confirmerLabel: string | null }) {
  return (
    <Card title="본인이 적은 칸" help={{ kind: "panel", id: "journal.mine" }}>
      <StatusLine e={e} confirmerLabel={confirmerLabel} />
      {!e ? (
        <p className="mt-2 text-sm text-[var(--muted)]">아직 적지 않았습니다.</p>
      ) : (
        <div className="mt-3 space-y-3">
          <ReadView e={e} day={day} />
          {canReview && e.status === "closed" && (
            <AssistForm id={`journal-review-${userId}-${day}`} action={reviewAction} className="flex flex-wrap items-end gap-2">
              <input type="hidden" name="day" value={day} />
              <input type="hidden" name="user" value={userId} />
              <SubmitButton name="intent" value="confirm">
                확인
              </SubmitButton>
              <div className="min-w-64 flex-1">
                <TextField help="journal.returnNote" name="returnNote" />
              </div>
              <SubmitButton name="intent" value="return" variant="secondary">
                보완 요청
              </SubmitButton>
            </AssistForm>
          )}
        </div>
      )}
    </Card>
  );
}
