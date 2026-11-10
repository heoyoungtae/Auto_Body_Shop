import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/db/runtime";
import { can } from "@/modules/auth/permissions";
import { listUsers } from "@/modules/auth/service";
import { TOOL_CHECK, TOOL_DECISION, TOOL_KEEP, TOOL_STATUS, TOOL_TONE, type ToolCheck, type ToolDecision, type ToolKeep, type ToolStatus } from "@/modules/equipment/rules";
import { getTool } from "@/modules/equipment/tools";
import { AssistForm } from "../../_assist";
import { RadioRow, TextField } from "../../_input";
import { requireUser } from "../../_lib/session";
import { SubmitButton } from "../../_submit";
import { Badge, buttonClass, Card, ErrorBox, fmtTime, Notice, PageTitle } from "../../_ui";
import { toolAction } from "../actions";
import { ToolFields } from "../_form";

const EVENT: Record<string, string> = { register: "등록", edit: "고침", out: "반출", return: "반납", check: "분기 점검", lost: "분실", found: "되찾음", repaired: "수리 끝", label: "라벨 부착", dispose: "폐기" };

/** 치공구 한 개(F-08-08): 정보·반출/반납·분기 점검·분실·수리·폐기·이력. 라벨 QR을 찍으면 이 화면이 열린다 */
export default async function ToolPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; notice?: string }> }) {
  const { id } = await params;
  const q = await searchParams;
  const user = await requireUser();
  const db = await getDb();
  const r = await getTool(db, id).catch(() => null);
  if (!r) notFound();
  const { t, events, names, quarter, checkedThisQuarter } = r;
  const manage = can(user, "equip.manage");
  const field = can(user, "equip.check");
  const status = t.status as ToolStatus;
  const live = status !== "disposed";
  const nm = (u: string | null) => (u ? (names.get(u) ?? "-") : "-");
  const users = manage ? (await listUsers(db)).filter((u) => u.active) : [];
  const mayLose = manage || t.outBy === user.id || t.holderId === user.id;
  const row = (k: string, v: React.ReactNode) => (
    <div className="flex gap-2 py-1">
      <dt className="w-28 shrink-0 text-[var(--muted)]">{k}</dt>
      <dd className="min-w-0 whitespace-pre-wrap">{v || "-"}</dd>
    </div>
  );
  return (
    <>
      <PageTitle
        help="tools.detail"
        sub={`${TOOL_KEEP[t.keep as ToolKeep]}${t.spec ? ` · ${t.spec}` : ""}${t.special ? " · 고가·특수(반출 기록)" : ""}`}
        actions={
          <Link href="/tools" className="text-sm text-[var(--accent)]">
            ← 치공구
          </Link>
        }
      >
        {t.no} {t.name} <Badge tone={TOOL_TONE[status]}>{TOOL_STATUS[status]}</Badge> {t.outAt && <Badge tone="warn">반출 중</Badge>}
      </PageTitle>
      <ErrorBox message={q.error} />
      {q.notice && <Notice>{q.notice}</Notice>}

      {live && field && (t.special || t.outAt) && (
        <Card title={t.outAt ? "반출 중" : "반출"} help={{ kind: "panel", id: "tool.out" }}>
          {t.outAt ? (
            <>
              <p className="mb-2 text-sm">
                <b>{nm(t.outBy)}</b> · {fmtTime(t.outAt)} 반출 · {t.outNote}
              </p>
              {(t.outBy === user.id || manage) && (
                <AssistForm id={`tool-ret-${id}`} action={toolAction} className="grid gap-3 md:grid-cols-2">
                  <input type="hidden" name="id" value={id} />
                  <input type="hidden" name="intent" value="return" />
                  <RadioRow
                    help="tool.broken"
                    name="broken"
                    required
                    defaultValue="0"
                    options={[
                      { value: "0", label: "이상 없음", tone: "ok" },
                      { value: "1", label: "상함(수리 필요)", tone: "danger" },
                    ]}
                  />
                  <TextField help="tool.returnNote" name="returnNote" />
                  <div className="md:col-span-2">
                    <SubmitButton>반납</SubmitButton>
                  </div>
                </AssistForm>
              )}
            </>
          ) : status === "ok" ? (
            <AssistForm id={`tool-out-${id}`} action={toolAction} className="flex flex-wrap items-end gap-2">
              <input type="hidden" name="id" value={id} />
              <input type="hidden" name="intent" value="out" />
              <div className="min-w-64 flex-1">
                <TextField help="tool.outNote" name="outNote" required />
              </div>
              <SubmitButton>반출</SubmitButton>
            </AssistForm>
          ) : (
            <p className="text-sm text-[var(--muted)]">{TOOL_STATUS[status]} 상태라 반출할 수 없습니다.</p>
          )}
        </Card>
      )}

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Card title="치공구 정보" help={{ kind: "panel", id: "tool.info" }}>
          <dl className="text-sm">
            {row("보관", TOOL_KEEP[t.keep as ToolKeep])}
            {row("보관 위치", t.location)}
            {t.keep === "personal" && row("쓰는 사람", nm(t.holderId))}
            {row("구역 담당", t.managerId ? nm(t.managerId) : null)}
            {row("구입일", t.purchasedOn)}
            {row("라벨", t.labeledAt ? fmtTime(t.labeledAt) : <span className="text-[var(--danger)]">아직 안 붙임</span>)}
            {row(`${quarter.slice(-1)}분기 점검`, checkedThisQuarter ? "했음" : "아직")}
            {row("메모", t.note)}
          </dl>
          {manage && live && (
            <div className="mt-3 flex flex-wrap gap-2">
              {!t.labeledAt && (
                <>
                  <Link href={`/tools/labels?ids=${id}`} className={buttonClass("secondary")}>
                    라벨 인쇄
                  </Link>
                  <AssistForm id={`tool-label-${id}`} action={toolAction} guard={false}>
                    <input type="hidden" name="id" value={id} />
                    <input type="hidden" name="intent" value="label" />
                    <SubmitButton variant="secondary">라벨 붙였음</SubmitButton>
                  </AssistForm>
                </>
              )}
            </div>
          )}
          {manage && live && (
            <details className="mt-3">
              <summary className="cursor-pointer text-sm text-[var(--accent)]">정보 고치기</summary>
              <AssistForm id={`tool-edit-${id}`} action={toolAction} className="mt-3 grid gap-3 md:grid-cols-2">
                <input type="hidden" name="id" value={id} />
                <input type="hidden" name="intent" value="update" />
                <ToolFields t={t} users={users} />
                <div className="md:col-span-2">
                  <SubmitButton>저장</SubmitButton>
                </div>
              </AssistForm>
            </details>
          )}
        </Card>

        {live && (manage || mayLose) && (
          <Card title="점검·분실·수리" help={{ kind: "panel", id: "tool.check" }}>
            <div className="space-y-4">
              {manage && !checkedThisQuarter && !t.outAt && (
                <AssistForm id={`tool-chk-${id}`} action={toolAction} className="grid gap-2 md:grid-cols-2">
                  <input type="hidden" name="id" value={id} />
                  <input type="hidden" name="intent" value="check" />
                  <p className="text-sm font-medium md:col-span-2">{quarter.slice(-1)}분기 점검</p>
                  <RadioRow help="tool.result" name="result" required options={Object.entries(TOOL_CHECK).map(([value, label]) => ({ value, label, tone: value === "ok" ? ("ok" as const) : value === "worn" ? ("warn" as const) : ("danger" as const) }))} />
                  <RadioRow help="tool.decision" name="decision" options={Object.entries(TOOL_DECISION).map(([value, label]) => ({ value, label }))} />
                  <div className="md:col-span-2">
                    <TextField help="tool.checkNote" name="checkNote" />
                  </div>
                  <div className="md:col-span-2">
                    <SubmitButton>점검 기록</SubmitButton>
                  </div>
                </AssistForm>
              )}
              {manage && (status === "repair" || status === "lost") && (
                <AssistForm id={`tool-restore-${id}`} action={toolAction} className="flex flex-wrap items-end gap-2">
                  <input type="hidden" name="id" value={id} />
                  <input type="hidden" name="intent" value="restore" />
                  <div className="min-w-64 flex-1">
                    <TextField help="tool.restoreNote" name="restoreNote" label={status === "lost" ? "되찾은 곳" : "수리 내용"} />
                  </div>
                  <SubmitButton variant="secondary">{status === "lost" ? "되찾았음" : "수리 끝"}</SubmitButton>
                </AssistForm>
              )}
              {mayLose && status !== "lost" && (
                <details>
                  <summary className="cursor-pointer text-sm text-[var(--danger)]">분실 신고</summary>
                  <AssistForm id={`tool-lost-${id}`} action={toolAction} className="mt-2 flex flex-wrap items-end gap-2">
                    <input type="hidden" name="id" value={id} />
                    <input type="hidden" name="intent" value="lost" />
                    <div className="min-w-64 flex-1">
                      <TextField help="tool.lostNote" name="lostNote" required />
                    </div>
                    <SubmitButton variant="danger">분실로 기록</SubmitButton>
                  </AssistForm>
                </details>
              )}
              {manage && (
                <details>
                  <summary className="cursor-pointer text-sm text-[var(--muted)]">폐기</summary>
                  <AssistForm id={`tool-dispose-${id}`} action={toolAction} className="mt-2 flex flex-wrap items-end gap-2">
                    <input type="hidden" name="id" value={id} />
                    <input type="hidden" name="intent" value="dispose" />
                    <div className="min-w-64 flex-1">
                      <TextField help="tool.disposeNote" name="disposeNote" required />
                    </div>
                    <SubmitButton variant="danger">폐기</SubmitButton>
                  </AssistForm>
                </details>
              )}
            </div>
          </Card>
        )}

        <Card title="이력(반출·점검 기록)" help={{ kind: "panel", id: "tool.history" }}>
          <ul className="divide-y divide-[var(--line)] text-sm">
            {events.map(({ e, by }) => (
              <li key={e.id} className="py-1.5">
                <span className="font-medium">{EVENT[e.kind] ?? e.kind}</span>
                {e.result && <Badge tone={e.result === "ok" ? "ok" : e.result === "worn" ? "warn" : "danger"}>{TOOL_CHECK[e.result as ToolCheck]}</Badge>}
                {e.decision && <span className="text-xs"> → {TOOL_DECISION[e.decision as ToolDecision]}</span>}
                {e.detail && <span className="text-[var(--muted)]"> · {e.detail}</span>}
                <span className="block text-xs text-[var(--muted)]">
                  {by ?? "-"} · {fmtTime(e.at)}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}
