import { inArray } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/db/runtime";
import { appUser } from "@/db/schema";
import { activeStep } from "@/modules/approval/machine";
import { ApprovalError, events, getDoc } from "@/modules/approval/service";
import type { DocumentFlag, ResolvedStep } from "@/modules/approval/types";
import { DEFAULT_DELEGATION, isDelegationTask } from "@/modules/platform/delegation";
import { DEFAULT_POLICY, isPolicyKey } from "@/modules/platform/policy";
import { AssistForm } from "../../_assist";
import { TextAreaField } from "../../_input";
import { SubmitButton } from "../../_submit";
import { requireUser } from "../../_lib/session";
import { Badge, buttonClass, Card, ErrorBox, fmtTime, Notice, PageTitle, StatusBadge } from "../../_ui";
import { ActForm } from "./act-form";
import { actAction, cancelAction, resubmitAction } from "../actions";

const FIELD_LABEL: Record<string, string> = {
  target: "대상",
  policyKey: "정책값",
  delegationTask: "전결 업무",
  current: "현재 내용",
  proposedValue: "바꿀 값",
  proposed: "바꿀 내용",
  reason: "사유",
  targetDocNo: "취소할 문서",
  kind: "구분",
  body: "내용",
};
/** 저장된 키·숫자를 사람이 읽는 말로 */
function show(k: string, v: unknown): string {
  if (k === "policyKey" && typeof v === "string" && isPolicyKey(v)) return DEFAULT_POLICY[v].label;
  if (k === "delegationTask" && typeof v === "string" && isDelegationTask(v)) return DEFAULT_DELEGATION[v].label;
  if (typeof v === "number") return v.toLocaleString("ko-KR");
  return String(v ?? "");
}
/** jsonb 는 키 순서를 바꾸므로 양식 순서대로 다시 놓는다 */
const order = (k: string) => { const i = Object.keys(FIELD_LABEL).indexOf(k); return i < 0 ? 99 : i; };
const EVENT_LABEL: Record<string, string> = { created: "작성", submit: "상신", resubmit: "재상신", approve: "승인", reject: "반려", confirm: "확인", cancelled: "취소됨" };
const FLAG_LABEL: Record<DocumentFlag, string> = { proxy_approved: "대리 승인", owner_self_approval: "대표 자기결재", escalated: "담당자 없어 대표에게 올림" };

export default async function ApprovalDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; notice?: string }> }) {
  const [{ id }, { error, notice }] = await Promise.all([params, searchParams]);
  const user = await requireUser();
  const db = await getDb();
  let doc;
  try {
    doc = await getDoc(db, id);
  } catch (e) {
    if (e instanceof ApprovalError) notFound();
    throw e;
  }
  const steps = doc.steps as ResolvedStep[];
  const log = await events(db, id);
  const userIds = [...new Set([...steps.flatMap((s) => [...s.candidates, ...s.doneBy]), ...log.flatMap((e) => [e.actorId, e.onBehalfOf]).filter((x): x is string => !!x)])];
  const names = new Map((userIds.length ? await db.select({ id: appUser.id, name: appUser.name }).from(appUser).where(inArray(appUser.id, userIds)) : []).map((u) => [u.id, u.name]));
  const nm = (i: string) => names.get(i) ?? "?";
  const active = activeStep({ status: doc.status, steps, flags: [], revision: doc.revision } as never);
  const mine = !!active && active.candidates.includes(user.id) && !active.doneBy.includes(user.id);
  const data = doc.data as Record<string, unknown>;
  const settled = (doc.status === "confirmed" || doc.status === "checked") && !doc.cancelsId && doc.formCode === "F-Q-05";
  const applyLink =
    settled && user.roles.includes("owner")
      ? typeof data.policyKey === "string"
        ? `/settings/policies?key=${encodeURIComponent(data.policyKey)}&from=${doc.id}`
        : typeof data.delegationTask === "string"
          ? `/settings/delegation?task=${encodeURIComponent(data.delegationTask)}&from=${doc.id}`
          : null
      : null;
  return (
    <div className="space-y-4">
      <PageTitle help="approvals.detail" sub={`${doc.formCode} · 개정 ${doc.revision}판`} actions={<StatusBadge status={doc.status} />}>
        {doc.docNo} {doc.title}
      </PageTitle>
      <ErrorBox message={error} />
      {notice && <Notice>{notice}</Notice>}
      <NextStep
        text={nextStep({
          status: doc.status,
          mine,
          drafter: doc.drafterId === user.id,
          activeLabel: active?.label,
          activeWho: active ? active.candidates.map(nm).join(" 또는 ") : "",
        })}
      />
      {(doc.flags as DocumentFlag[]).length > 0 && (
        <div className="flex gap-2">
          {(doc.flags as DocumentFlag[]).map((f) => (
            <Badge key={f} tone="warn">
              {FLAG_LABEL[f]}
            </Badge>
          ))}
        </div>
      )}

      {/* 넓은 화면: 왼쪽은 결재란·내용·처리, 오른쪽은 처리 이력 */}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] xl:items-start">
        <div className="min-w-0 space-y-4">
      <Card title="결재란" help={{ kind: "panel", id: "doc.line" }}>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {steps.map((s) => (
            <div key={s.seq} className={`rounded-md border p-2 text-center text-sm ${s.status === "active" ? "border-[var(--accent)]" : "border-[var(--line)]"}`}>
              <div className="text-xs text-[var(--muted)]">{s.label}</div>
              <div className="font-medium">{s.doneBy.length ? s.doneBy.map(nm).join(", ") : s.candidates.map(nm).join(" 또는 ")}</div>
              <div className="text-xs">{s.status === "done" ? "완료" : s.status === "active" ? "처리 중" : s.status === "rejected" ? "반려" : "대기"}</div>
            </div>
          ))}
        </div>
      </Card>

      <Card title="내용" help={{ kind: "panel", id: "doc.content" }}>
        <dl className="space-y-3 text-sm">
          {Object.entries(data)
            .sort(([a], [b]) => order(a) - order(b))
            .map(([k, v]) => (
            <div key={k}>
              <dt className="text-xs text-[var(--muted)]">{FIELD_LABEL[k] ?? k}</dt>
              <dd className="whitespace-pre-wrap">{show(k, v)}</dd>
            </div>
          ))}
        </dl>
        {doc.cancelsId && (
          <p className="mt-3 text-sm">
            취소 대상: <Link className="text-[var(--accent)]" href={`/approvals/${doc.cancelsId}`}>원래 문서 보기</Link>
          </p>
        )}
        {doc.contentHash && <p className="mt-3 break-all text-xs text-[var(--muted)]">확정 {fmtTime(doc.confirmedAt)} · 내용 해시 {doc.contentHash}</p>}
      </Card>

      {mine && (
        <Card title={`${active!.label} 처리`} help={{ kind: "panel", id: "doc.act" }}>
          <ActForm id={doc.id} kind={active!.kind} action={actAction} />
        </Card>
      )}

      {doc.status === "rejected" && doc.drafterId === user.id && (
        <div className="flex flex-wrap gap-2">
          <form action={resubmitAction}>
            <input type="hidden" name="id" value={doc.id} />
            <SubmitButton>같은 내용으로 다시 상신</SubmitButton>
          </form>
          {doc.formCode === "F-Q-05" && (
            <Link href={`/approvals/new?from=${doc.id}`} className={buttonClass("secondary")}>
              고쳐서 새로 올리기(내용 불러옴)
            </Link>
          )}
        </div>
      )}

      {applyLink && (
        <Card title="설정에 반영" help={{ kind: "panel", id: "doc.apply" }}>
          <p className="mb-2 text-sm text-[var(--muted)]">확정된 요청서입니다. 아래 단추를 누르면 값·근거 번호·사유가 채워진 변경 화면이 열립니다(대표).</p>
          <Link href={applyLink} className={buttonClass()}>
            {data.policyKey ? "정책값 바꾸기 화면 열기" : "전결 규정 바꾸기 화면 열기"}
          </Link>
        </Card>
      )}

      {(doc.status === "confirmed" || doc.status === "checked") && !doc.cancelsId && (
        <Card title="취소 요청" help={{ kind: "panel", id: "doc.cancel" }}>
          <AssistForm id={`cancel-${doc.id}`} action={cancelAction} className="space-y-3">
            <input type="hidden" name="id" value={doc.id} />
            <TextAreaField help="approval.cancelReason" name="reason" required rows={2} />
            <SubmitButton variant="danger">취소 문서 상신</SubmitButton>
          </AssistForm>
        </Card>
      )}

        </div>
        <div className="min-w-0 space-y-4">
      <Card title="처리 이력" help={{ kind: "panel", id: "doc.history" }}>
        <ul className="space-y-1 text-sm">
          {log.map((e) => (
            <li key={e.id}>
              <span className="text-[var(--muted)]">{fmtTime(e.at)}</span> {e.actorId ? nm(e.actorId) : "시스템"}
              {e.onBehalfOf && ` (${nm(e.onBehalfOf)} 대리)`} · {EVENT_LABEL[e.type] ?? e.type}
              {e.comment && ` · ${e.comment}`}
            </li>
          ))}
        </ul>
      </Card>
        </div>
      </div>
    </div>
  );
}

function nextStep(x: { status: string; mine: boolean; drafter: boolean; activeLabel?: string; activeWho: string }): string {
  if (x.mine) return `지금 내 차례(${x.activeLabel})입니다. 내용을 읽고 아래에서 승인 또는 반려해 주세요.`;
  switch (x.status) {
    case "in_progress":
      return `지금 ${x.activeWho}의 ${x.activeLabel} 차례입니다.${x.drafter ? " 처리되면 알림으로 알려 드립니다." : " 내 차례가 아니라 볼 수만 있습니다."}`;
    case "rejected":
      return x.drafter ? "반려됐습니다. 아래 처리 이력의 반려 사유를 보고, 고쳐서 새로 올리거나 같은 내용으로 다시 상신하세요." : "반려되어 기안자가 고치는 중입니다.";
    case "confirmed":
    case "checked":
      return "확정된 문서입니다. 내용은 바꿀 수 없고, 무르려면 아래 '취소 요청'을 씁니다.";
    case "cancelled":
      return "취소 문서가 확정되어 무효가 된 문서입니다. 기록으로만 남아 있습니다.";
    default:
      return "작성 중인 문서입니다.";
  }
}

function NextStep({ text }: { text: string }) {
  return (
    <p className="rounded-md border border-[var(--accent)]/30 bg-[var(--accent-soft)] px-3 py-2.5 text-sm">
      <b>지금 할 일 · </b>
      {text}
    </p>
  );
}
