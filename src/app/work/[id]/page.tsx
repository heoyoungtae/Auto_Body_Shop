import Link from "next/link";
import { getDb } from "@/db/runtime";
import { getWorkOrder } from "@/modules/repair/work";
import { fmtMinutes } from "@/modules/repair/labor";
import { PROCESSES, WO_STATUS_LABEL, isProcess, processLabel } from "@/modules/repair/work-rules";
import { AssistForm } from "../../_assist";
import { CheckGroup, DateField, NumberField, SelectField, TextAreaField, TextField } from "../../_input";
import { SubmitButton } from "../../_submit";
import { requireUser } from "../../_lib/session";
import { Badge, Card, ErrorBox, Notice, PageTitle, fmtTime } from "../../_ui";
import { removeStepPhotoAction, uploadStepPhotoAction, workAction } from "../actions";
import { PhotoStrip } from "../../photo-strip";

function Hidden({ woId, stepId, intent }: { woId: string; stepId?: string; intent: string }) {
  return (
    <>
      <input type="hidden" name="woId" value={woId} />
      {stepId && <input type="hidden" name="stepId" value={stepId} />}
      <input type="hidden" name="intent" value={intent} />
    </>
  );
}

/** 공정별로 더 적는 것: 조색=배합, 건조=조건, 판금=용접 방식 */
function DetailFields({ process }: { process: string }) {
  if (process === "color")
    return (
      <div className="grid gap-3 md:grid-cols-2">
        <TextField help="work.colorCode" name="colorCode" required />
        <TextField help="work.paintMaker" name="paintMaker" />
        <TextField help="work.mixNo" name="mixNo" required />
        <TextField help="work.lot" name="lot" />
      </div>
    );
  if (process === "dry")
    return (
      <div className="grid gap-3 md:grid-cols-2">
        <NumberField help="work.tempC" name="tempC" unit="℃" min={0} max={150} required />
        <NumberField help="work.minutes" name="minutes" unit="분" min={1} max={1440} required />
      </div>
    );
  if (process === "sheet") return <TextField help="work.weld" name="weld" required suggestions={[{ value: "없음" }, { value: "스폿" }, { value: "MIG" }, { value: "MIG 브레이징" }]} />;
  return null;
}

const DETAIL_LABEL: Record<string, string> = { colorCode: "컬러 코드", paintMaker: "도료 회사", mixNo: "배합 번호", lot: "로트", tempC: "온도(℃)", minutes: "시간(분)", weld: "용접 방식" };

export default async function WorkOrderPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; notice?: string }> }) {
  const [{ id }, { error, notice }] = await Promise.all([params, searchParams]);
  const user = await requireUser();
  const w = await getWorkOrder(await getDb(), id);
  const boss = user.roles.some((r) => r === "plant_manager" || r === "owner");
  const open = w.status !== "done";
  const v = w.vehicle;
  const lineName = (lid: string) => w.lines.find((l) => l.id === lid)?.name;

  return (
    <div>
      <PageTitle
        help="work.order"
        sub={
          <>
            F-04-01 작업 지시서 ·{" "}
            <Link href={`/repairs/${w.ro.id}/estimate/${w.estimate.id}`} className="text-[var(--accent)]">
              승인 견적 {w.estimate.docNo}
            </Link>
            의 승인 항목에서 불러옴 ·{" "}
            <Link href={`/repairs/${w.ro.id}`} className="text-[var(--accent)]">
              수리 건 {w.ro.docNo}
            </Link>
          </>
        }
        actions={<Badge tone={w.status === "done" ? "ok" : w.status === "working" ? "accent" : "warn"}>{WO_STATUS_LABEL[w.status]}</Badge>}
      >
        작업 {w.docNo}
      </PageTitle>
      <ErrorBox message={error} />
      {notice && <Notice>{notice}</Notice>}
      <p className="mt-3 text-sm">
        {w.customerName} · <b>{v.plateNo}</b> {[v.maker, v.model, v.generation].filter(Boolean).join(" ")} · 색상 {v.colorCode ?? "—"} · 출고 약속 <b>{w.dueDate ?? "—"}</b>
      </p>

      <div className="mt-4 grid gap-4 xl:grid-cols-3 xl:items-start">
        <div className="space-y-4 xl:col-span-2">
          {w.steps.map((s, i) => {
            const p = isProcess(s.process) ? PROCESSES[s.process] : null;
            const mine = s.assignee === user.id || boss;
            const state = s.endedAt ? "done" : s.startedAt ? "started" : s.blockedBy.length ? "waiting" : "ready";
            return (
              <div key={s.id} id={`step-${s.id}`}>
                <Card title={`${i + 1}. ${processLabel(s.process)}`} help={{ kind: "panel", id: "work.step" }} actions={<Badge tone={state === "done" ? "ok" : state === "started" ? "accent" : state === "ready" ? "warn" : "neutral"}>{{ done: "끝", started: "작업 중", ready: "시작 가능", waiting: "대기" }[state]}</Badge>}>
                  <div className="space-y-3 text-sm">
                    <p className="text-[var(--muted)]">
                      {s.lineIds.map(lineName).filter(Boolean).join(" · ") || "견적 항목 없음(마무리 공정)"}
                      {p?.std ? ` — ${p.std}` : ""}
                    </p>
                    <p>
                      담당 <b>{s.assigneeName ?? "미정"}</b> · 예정 {s.planDate ?? "—"} · 표준 {s.stdMinutes ? fmtMinutes(s.stdMinutes) : "—"}
                      {s.startedAt && ` · 시작 ${fmtTime(s.startedAt)}`}
                      {s.endedAt && ` · 끝 ${fmtTime(s.endedAt)} (${fmtMinutes(s.actualMinutes ?? 0)})`}
                    </p>
                    {state === "waiting" && <p className="text-[var(--muted)]">앞 공정을 기다립니다: {s.blockedBy.join(", ")}</p>}

                    {boss && open && !s.endedAt && (
                      <details>
                        <summary className="cursor-pointer font-semibold text-[var(--accent)]">{s.assignee ? "담당·예정 바꾸기" : "담당 정하기"}</summary>
                        <AssistForm id={`wa-${s.id}`} action={workAction} className="mt-2 grid gap-3 md:grid-cols-3">
                          <Hidden woId={w.id} stepId={s.id} intent="assign" />
                          <SelectField help="work.assignee" name="assignee" required defaultValue={s.assignee ?? ""} placeholder="고르기" options={w.workers.map((u) => ({ value: u.id, label: `${u.name}(${u.role})` }))} />
                          <DateField help="work.planDate" name="planDate" defaultValue={s.planDate ?? ""} quick={["today", "tomorrow"]} />
                          <NumberField help="work.stdMinutes" name="stdMinutes" unit="분" min={0} max={6000} defaultValue={s.stdMinutes || null} />
                          <div className="md:col-span-3">
                            <SubmitButton variant="secondary">담당 저장</SubmitButton>
                          </div>
                        </AssistForm>
                      </details>
                    )}

                    {state === "ready" && mine && s.assignee && open && (
                      <form action={workAction}>
                        <Hidden woId={w.id} stepId={s.id} intent="start" />
                        <SubmitButton>공정 시작</SubmitButton>
                      </form>
                    )}

                    {(s.startedAt || s.photos.length > 0) && <PhotoStrip fields={{ woId: w.id, stepId: s.id }} upload={uploadStepPhotoAction} remove={removeStepPhotoAction} photos={s.photos} editable={state === "started" && mine} label={processLabel(s.process)} />}

                    {state === "started" && mine && p && (
                      <AssistForm id={`wf-${s.id}`} action={workAction} className="space-y-3 rounded-md border border-[var(--line)] p-3">
                        <Hidden woId={w.id} stepId={s.id} intent="finish" />
                        <CheckGroup help="work.checks" name="checks" options={p.checks.map((c) => ({ value: c, label: c }))} />
                        <DetailFields process={s.process} />
                        <TextAreaField help="work.stepNote" name="stepNote" rows={2} />
                        <p className={`text-xs ${p.photo && !s.photos.length ? "text-[var(--warn)]" : "text-[var(--muted)]"}`}>
                          끝내려면: 자주 검사 {p.checks.length}개 모두 확인{p.photo ? ` · 사진 1장 이상(지금 ${s.photos.length}장)` : ""}
                          {s.process === "color" ? " · 컬러 코드·배합 번호" : s.process === "dry" ? " · 온도·시간" : s.process === "sheet" ? " · 용접 방식" : ""}
                        </p>
                        <SubmitButton>공정 끝</SubmitButton>
                      </AssistForm>
                    )}

                    {s.endedAt && (
                      <div className="text-xs text-[var(--muted)]">
                        자주 검사: {s.checks.join(" · ")}
                        {Object.entries(s.detail).length > 0 && <span className="block">기록: {Object.entries(s.detail).map(([k, val]) => `${DETAIL_LABEL[k] ?? k} ${val}`).join(" · ")}</span>}
                        {s.note && <span className="block">메모: {s.note}</span>}
                      </div>
                    )}
                  </div>
                </Card>
              </div>
            );
          })}
        </div>

        <div className="space-y-4 xl:sticky xl:top-4">
          {boss && open && w.steps.some((s) => !s.assignee && !s.endedAt) && (
            <Card title="한꺼번에 배정" help={{ kind: "panel", id: "work.assignRest" }}>
              <AssistForm id={`war-${w.id}`} action={workAction} className="space-y-3">
                <Hidden woId={w.id} intent="assignRest" />
                <p className="text-sm text-[var(--muted)]">담당 미정 공정 {w.steps.filter((s) => !s.assignee && !s.endedAt).length}개에 같은 담당·예정일을 넣습니다.</p>
                <SelectField help="work.assignee" name="assignee" required placeholder="고르기" options={w.workers.map((u) => ({ value: u.id, label: `${u.name}(${u.role})` }))} />
                <DateField help="work.planDate" name="planDate" quick={["today", "tomorrow"]} />
                <SubmitButton>배정</SubmitButton>
              </AssistForm>
            </Card>
          )}
          <Card title="지시 사항" help={{ kind: "panel", id: "work.header" }}>
            {boss && open ? (
              <AssistForm id={`wh-${w.id}`} action={workAction} className="space-y-3">
                <Hidden woId={w.id} intent="header" />
                <DateField help="work.dueDate" name="dueDate" defaultValue={w.dueDate ?? ""} from={w.dueDate ? `견적 ${w.estimate.docNo}` : undefined} quick={["tomorrow", "week"]} />
                <TextAreaField help="work.note" name="note" rows={4} defaultValue={w.note ?? undefined} />
                <SubmitButton variant="secondary">저장</SubmitButton>
              </AssistForm>
            ) : (
              <div className="space-y-1 text-sm">
                <p>출고 약속: {w.dueDate ?? "—"}</p>
                <p className="whitespace-pre-line">{w.note ?? "특이 사항 없음"}</p>
              </div>
            )}
          </Card>
          <Card title="승인 항목" help={{ kind: "panel", id: "work.lines" }}>
            <ul className="space-y-0.5 text-sm">
              {w.lines.map((l) => (
                <li key={l.id}>
                  {l.name}
                  {l.partCode && <span className="text-xs text-[var(--muted)]"> · 부품 코드 {l.partCode}</span>}
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
