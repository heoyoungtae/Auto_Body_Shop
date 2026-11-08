import { inArray } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/db/runtime";
import { appUser } from "@/db/schema";
import { activeStep } from "@/modules/approval/machine";
import { ApprovalError, events, getDoc } from "@/modules/approval/service";
import type { DocumentFlag, ResolvedStep } from "@/modules/approval/types";
import { SubmitButton } from "../../_submit";
import { requireUser } from "../../_lib/session";
import { Badge, Card, ErrorBox, fmtTime, Notice, PageTitle, STATUS_LABEL, STATUS_TONE } from "../../_ui";
import { actAction, cancelAction, resubmitAction } from "../actions";

const FIELD_LABEL: Record<string, string> = { target: "대상", current: "현재 내용", proposed: "바꿀 내용", reason: "사유", targetDocNo: "취소할 문서", kind: "구분", body: "내용" };
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
  return (
    <div className="max-w-3xl space-y-4">
      <PageTitle sub={`${doc.formCode} · 개정 ${doc.revision}판`} actions={<Badge tone={STATUS_TONE[doc.status]}>{STATUS_LABEL[doc.status]}</Badge>}>
        {doc.docNo} {doc.title}
      </PageTitle>
      <ErrorBox message={error} />
      {notice && <Notice>{notice}</Notice>}
      {(doc.flags as DocumentFlag[]).length > 0 && (
        <div className="flex gap-2">
          {(doc.flags as DocumentFlag[]).map((f) => (
            <Badge key={f} tone="warn">
              {FLAG_LABEL[f]}
            </Badge>
          ))}
        </div>
      )}

      <Card title="결재란">
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

      <Card title="내용">
        <dl className="space-y-3 text-sm">
          {Object.entries(data)
            .sort(([a], [b]) => order(a) - order(b))
            .map(([k, v]) => (
            <div key={k}>
              <dt className="text-xs text-[var(--muted)]">{FIELD_LABEL[k] ?? k}</dt>
              <dd className="whitespace-pre-wrap">{String(v ?? "")}</dd>
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
        <Card title={`${active!.label} 처리`}>
          <form action={actAction} className="space-y-3">
            <input type="hidden" name="id" value={doc.id} />
            <textarea name="comment" placeholder="의견(반려할 때는 사유 필수)" className="min-h-20 w-full rounded-md border border-[var(--line-strong)] p-2 text-sm" />
            <div className="flex gap-2">
              <button name="type" value={active!.kind === "confirm" ? "confirm" : "approve"} className="inline-flex h-11 items-center rounded-md bg-[var(--accent)] px-4 text-sm font-medium text-[var(--accent-fg)]">
                {active!.kind === "confirm" ? "확인" : "승인"}
              </button>
              {active!.kind !== "confirm" && (
                <button name="type" value="reject" className="inline-flex h-11 items-center rounded-md border border-[var(--danger)]/50 px-4 text-sm font-medium text-[var(--danger)]">
                  반려
                </button>
              )}
            </div>
          </form>
        </Card>
      )}

      {doc.status === "rejected" && doc.drafterId === user.id && (
        <form action={resubmitAction}>
          <input type="hidden" name="id" value={doc.id} />
          <SubmitButton>다시 상신</SubmitButton>
        </form>
      )}

      {(doc.status === "confirmed" || doc.status === "checked") && !doc.cancelsId && (
        <Card title="취소 요청">
          <form action={cancelAction} className="flex flex-wrap gap-2">
            <input type="hidden" name="id" value={doc.id} />
            <input name="reason" required placeholder="취소 사유" className="h-11 min-w-0 flex-1 rounded-md border border-[var(--line-strong)] px-3 text-sm" />
            <SubmitButton variant="danger">취소 문서 상신</SubmitButton>
          </form>
        </Card>
      )}

      <Card title="처리 이력">
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
  );
}
