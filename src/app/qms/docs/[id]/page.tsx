import Link from "next/link";
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
  StatusBadge,
} from "../../../_ui";
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
  let g: Awaited<ReturnType<typeof getDocEntry>>;
  try {
    g = await getDocEntry(await getDb(), id);
  } catch (e) {
    return <ErrorBox message={userMessage(e)} />;
  }
  const { d, reqs } = g;
  const mgr = can(user, "qms.docs") && d.status === "current";
  return (
    <>
      <PageTitle
        help="qms.doc"
        sub={`${DOC_KINDS[d.kind as keyof typeof DOC_KINDS]} · 현행 ${d.rev}${d.effectiveOn ? ` · ${d.effectiveOn} 시행` : ""}`}
        actions={
          d.status === "current" && d.kind !== "external" ? (
            <Link href={`/approvals/new?doc=${d.id}`} className={buttonClass()}>
              개정 요청(F-Q-05)
            </Link>
          ) : d.status === "retired" ? (
            <Badge>폐지</Badge>
          ) : undefined
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
    </>
  );
}
