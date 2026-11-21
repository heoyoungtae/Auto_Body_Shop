import Link from "next/link";
import { stdHref } from "@/modules/quality/std-ref";
import { getDb } from "@/db/runtime";
import { can } from "@/modules/auth/permissions";
import { getDocEntry } from "@/modules/quality/qms";
import { DOC_KINDS } from "@/modules/quality/qms-rules";
import { AssistForm } from "../../../_assist";
import { DateField, SelectField, TextField } from "../../../_input";
import { requireUser, userMessage } from "../../../_lib/session";
import { SubmitButton } from "../../../_submit";
import {
  Badge,
  buttonClass,
  Card,
  ErrorBox,
  Notice,
  PageTitle,
  fmtTime,
  StatusBadge,
} from "../../../_ui";
import { HistoryCard } from "../../../_history-card";
import { EvidenceFiles } from "../../../money/evidence-files";
import { reviewDue } from "@/modules/quality/doc-files";
import { seoulDate } from "@/modules/platform/time";
import { docAction } from "../../actions";

/** 문서 한 건: 현행 판·판 이력·개정 요청서 */
export default async function DocPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ notice?: string; error?: string }>;
}) {
  const { id } = await params;
  const q = await searchParams;
  const user = await requireUser();
  const db = await getDb();
  let g: Awaited<ReturnType<typeof getDocEntry>>;
  try {
    g = await getDocEntry(db, id);
  } catch (e) {
    return <ErrorBox message={userMessage(e)} />;
  }
  const { d, reqs } = g;
  const mgr = can(user, "qms.docs") && d.status === "current";
  const files = d.files.map((f, i) => ({ f, i }));
  const cur = files.filter((x) => x.f.rev === d.rev);
  const old = files.filter((x) => x.f.rev !== d.rev);
  const reviewable = d.kind === "std" || d.kind === "wi";
  const due = reviewable ? reviewDue(d) : null;
  const today = seoulDate();
  return (
    <>
      <PageTitle
        help="qms.doc"
        sub={`${DOC_KINDS[d.kind as keyof typeof DOC_KINDS]} · 현행 ${d.rev}${d.effectiveOn ? ` · ${d.effectiveOn} 시행` : ""}`}
        actions={
          <>
            {d.kind !== "external" && stdHref(d.no) && (
              <Link href={stdHref(d.no)!} className={buttonClass("secondary")}>
                본문 보기
              </Link>
            )}
            {d.status === "current" && d.kind !== "external" ? (
            <Link href={`/approvals/new?doc=${d.id}`} className={buttonClass()}>
              개정 요청(F-Q-05)
            </Link>
          ) : d.status === "retired" ? (
            <Badge>폐지</Badge>
          ) : null}
          </>
        }
      >
        {d.no} {d.name}
      </PageTitle>
      <ErrorBox message={q.error} />
      {q.notice && <Notice>{q.notice}</Notice>}
      <Card title="판 이력" help={{ kind: "panel", id: "docs.history" }}>
        <ul className="space-y-1 text-sm">
          <li>
            <Badge tone="ok">현행</Badge> {d.rev}{" "}
            {d.effectiveOn ? `${d.effectiveOn}부터` : ""}
          </li>
          {[...d.history].reverse().map((h, i) => (
            <li key={i} className="text-[var(--muted)]">
              <Badge tone="neutral">폐기</Badge> {h.rev} {h.effectiveOn ?? ""} ~{" "}
              {h.until} {h.ref ? `· ${h.ref}` : ""}
            </li>
          ))}
        </ul>
        {reqs.length > 0 && (
          <ul className="mt-3 space-y-1 text-sm">
            {reqs.map((r) => (
              <li key={r.id} className="flex items-center gap-2">
                <Link
                  href={`/approvals/${r.id}`}
                  className="text-[var(--accent)]"
                >
                  {r.docNo} {r.title}
                </Link>
                <StatusBadge status={r.status} />
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card title={`문서 파일 · 현행 ${d.rev}`} help={{ kind: "panel", id: "docs.files" }}>
        {cur.length ? (
          <ul className="divide-y divide-[var(--line)] text-sm">
            {cur.map(({ f, i }) => (
              <li key={f.path} className="flex flex-wrap items-center gap-2 py-1.5">
                <a href={`/api/doc-file/${d.id}/${i}`} target="_blank" rel="noreferrer" className="font-medium text-[var(--accent)] underline">
                  {f.name}
                </a>
                <span className="text-xs text-[var(--muted)]">{fmtTime(f.at)}</span>
                {mgr && (
                  <form action={docAction} className="ml-auto">
                    <input type="hidden" name="id" value={id} />
                    <input type="hidden" name="intent" value="removeFile" />
                    <input type="hidden" name="path" value={f.path} />
                    <SubmitButton variant="secondary">떼기</SubmitButton>
                  </form>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-[var(--muted)]">
            {d.kind === "std" || d.kind === "form" ? "본문은 앱 안 사내 표준서에 있습니다(위 '본문 보기'). 서명본 스캔 등이 있으면 올립니다." : "현행 판 파일이 없습니다. 지침서·매뉴얼·TDS·MSDS PDF를 올려 두면 현장에서 바로 엽니다."}
          </p>
        )}
        {old.length > 0 && (
          <details className="mt-2 text-sm">
            <summary className="cursor-pointer text-xs text-[var(--muted)]">이전 판 파일 {old.length}개</summary>
            <ul className="mt-1 space-y-1">
              {old.map(({ f, i }) => (
                <li key={f.path}>
                  <Badge tone="neutral">{f.rev}</Badge>{" "}
                  <a href={`/api/doc-file/${d.id}/${i}`} target="_blank" rel="noreferrer" className="text-[var(--accent)] underline">
                    {f.name}
                  </a>
                </li>
              ))}
            </ul>
          </details>
        )}
        {mgr && (
          <AssistForm id={`doc-files-${id}`} action={docAction} className="mt-3 space-y-2" guard={false}>
            <input type="hidden" name="id" value={id} />
            <input type="hidden" name="intent" value="file" />
            <EvidenceFiles help="docs.files" name="docFiles" pickLabel="+ PDF·사진 고르기" />
            <SubmitButton variant="secondary">현행 판 파일로 올리기</SubmitButton>
          </AssistForm>
        )}
      </Card>
      {reviewable && d.status === "current" && (
        <Card title="정기 검토(연 1회)" help={{ kind: "panel", id: "docs.review" }}>
          <p className="text-sm">
            마지막 검토 {d.reviewedOn ?? "없음"}
            {d.reviewNote ? ` · ${d.reviewNote}` : ""} · 다음 검토 <span className={due && due < today ? "font-semibold text-[var(--danger)]" : ""}>{due}</span>까지
          </p>
          {mgr && (
            <AssistForm id={`doc-review-${id}`} action={docAction} className="mt-2 flex flex-wrap items-end gap-2">
              <input type="hidden" name="id" value={id} />
              <input type="hidden" name="intent" value="review" />
              <div className="min-w-64 flex-1">
                <TextField help="docs.reviewNote" name="reviewNote" required suggestions={[{ value: "바꿀 것 없음" }, { value: "개정 요청함(F-Q-05)" }, { value: "법령 개정 반영 필요" }]} />
              </div>
              <SubmitButton>검토 기록</SubmitButton>
            </AssistForm>
          )}
        </Card>
      )}
      {mgr && (
        <Card title="고치기" help={{ kind: "panel", id: "docs.edit" }}>
          <AssistForm
            id={`doc-${id}`}
            action={docAction}
            className="grid gap-3 md:grid-cols-2"
          >
            <input type="hidden" name="id" value={id} />
            <TextField help="docs.no" name="no" required defaultValue={d.no} />
            <TextField
              help="docs.name"
              name="name"
              required
              defaultValue={d.name}
            />
            <SelectField
              help="docs.kind"
              name="kind"
              required
              defaultValue={d.kind}
              options={Object.entries(DOC_KINDS).map(([value, label]) => ({
                value,
                label,
              }))}
            />
            <TextField
              help="docs.rev"
              name="rev"
              required
              defaultValue={d.rev}
              readOnly={d.kind !== "external"}
            />
            <DateField
              help="docs.effectiveOn"
              name="effectiveOn"
              defaultValue={d.effectiveOn ?? ""}
              quick={["today"]}
            />
            <TextField
              help="docs.owner"
              name="owner"
              defaultValue={d.owner ?? ""}
            />
            <TextField
              help="docs.location"
              name="location"
              defaultValue={d.location ?? ""}
            />
            <TextField
              help="docs.source"
              name="source"
              defaultValue={d.source ?? ""}
            />
            <DateField
              help="docs.receivedOn"
              name="receivedOn"
              defaultValue={d.receivedOn ?? ""}
              quick={["today"]}
            />
            <TextField
              help="docs.note"
              name="note"
              defaultValue={d.note ?? ""}
            />
            <div className="md:col-span-2">
              <SubmitButton>저장</SubmitButton>
            </div>
          </AssistForm>
        </Card>
      )}
      {mgr && (
        <Card title="폐지" help={{ kind: "panel", id: "docs.retire" }}>
          <AssistForm
            id={`doc-retire-${id}`}
            action={docAction}
            className="flex flex-wrap items-end gap-2"
          >
            <input type="hidden" name="id" value={id} />
            <input type="hidden" name="intent" value="retire" />
            <div className="min-w-64 flex-1">
              <TextField help="docs.retireReason" name="reason" required />
            </div>
            <SubmitButton variant="danger">폐지</SubmitButton>
          </AssistForm>
        </Card>
      )}
      <HistoryCard db={db} user={user} keys={[d.no, d.id]} />
    </>
  );
}
