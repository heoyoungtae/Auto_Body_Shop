import Link from "next/link";
import { getDb } from "@/db/runtime";
import { can } from "@/modules/auth/permissions";
import { getExpense } from "@/modules/money/expense";
import {
  EVIDENCE_KINDS,
  evidenceWarning,
  EXP_CATEGORIES,
  EXP_PAY_METHODS,
  EXP_STATUS,
  SOURCE_KINDS,
} from "@/modules/money/rules";
import { seoulDate } from "@/modules/platform/time";
import { AssistForm } from "../../../_assist";
import { DateField, SelectField, TextField } from "../../../_input";
import { requireUser, userMessage } from "../../../_lib/session";
import { SubmitButton } from "../../../_submit";
import {
  Badge,
  buttonClass,
  Card,
  ErrorBox,
  fmtTime,
  Notice,
  PageTitle,
} from "../../../_ui";
import { expenseAction } from "../../actions";
import { EvidenceFiles } from "../../evidence-files";

const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;
const TONE = {
  draft: "neutral",
  in_progress: "warn",
  rejected: "danger",
  approved: "accent",
  paid: "ok",
  cancelled: "neutral",
} as const;

/** 지출 결의서 한 장(F-12-01): 결재·증빙·지급 */
export default async function ExpensePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ notice?: string; error?: string }>;
}) {
  const { id } = await params;
  const q = await searchParams;
  const user = await requireUser();
  if (!can(user, "expense.draft") && !can(user, "expense.pay"))
    return (
      <p className="text-sm text-[var(--muted)]">
        지출 결의는 공장장·회계 담당·대표가 봅니다.
      </p>
    );
  let g: Awaited<ReturnType<typeof getExpense>>;
  try {
    g = await getExpense(await getDb(), user, id);
  } catch (e) {
    return <ErrorBox message={userMessage(e)} />;
  }
  const { e, doc, status, bank, src } = g;
  const mine = e.createdBy === user.id;
  const payer = can(user, "expense.pay");
  const live = status !== "paid" && status !== "cancelled";
  const warn = evidenceWarning(
    e.evidenceKind as keyof typeof EVIDENCE_KINDS,
    e.amountWon,
  );
  const hidden = (intent: string) => (
    <>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="intent" value={intent} />
    </>
  );
  return (
    <>
      <PageTitle
        help="expenses.detail"
        sub={`${EXP_CATEGORIES[e.category as keyof typeof EXP_CATEGORIES]} · ${g.createdByName} 작성 ${fmtTime(e.createdAt)}`}
        actions={<Badge tone={TONE[status]}>{EXP_STATUS[status]}</Badge>}
      >
        {e.docNo} {e.payeeName} {won(e.amountWon)}
      </PageTitle>
      <ErrorBox message={q.error} />
      {q.notice && <Notice>{q.notice}</Notice>}

      <Card title="내용" help={{ kind: "panel", id: "exp.detail" }}>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs text-[var(--muted)]">받는 곳</dt>
            <dd>
              {e.supplierId ? (
                <Link
                  href={`/suppliers/${e.supplierId}`}
                  className="text-[var(--accent)]"
                >
                  {e.payeeName}
                </Link>
              ) : (
                e.payeeName
              )}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-[var(--muted)]">근거 전표</dt>
            <dd>
              {e.sourceNo ? (
                <Link
                  href={
                    e.sourceKind === "po"
                      ? `/purchases/${e.sourceId}`
                      : `/outsource/${e.sourceId}`
                  }
                  className="text-[var(--accent)]"
                >
                  {SOURCE_KINDS[e.sourceKind as keyof typeof SOURCE_KINDS]}{" "}
                  {e.sourceNo}
                </Link>
              ) : (
                SOURCE_KINDS.none
              )}
              {src && (
                <span className="text-xs text-[var(--muted)]">
                  {" "}
                  · 남은 금액 {won(src.remainWon)}
                </span>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-[var(--muted)]">금액</dt>
            <dd>
              공급가 {won(e.supplyWon)} + 부가세 {won(e.vatWon)} ={" "}
              <b>{won(e.amountWon)}</b>
            </dd>
          </div>
          <div>
            <dt className="text-xs text-[var(--muted)]">지급 방법·예정일</dt>
            <dd>
              {EXP_PAY_METHODS[e.payMethod as keyof typeof EXP_PAY_METHODS]}
              {e.dueOn ? ` · ${e.dueOn}` : ""}
            </dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-xs text-[var(--muted)]">용도</dt>
            <dd className="whitespace-pre-wrap">{e.purpose}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-xs text-[var(--muted)]">결재</dt>
            <dd>
              <Link
                href={`/approvals/${doc.id}`}
                className="text-[var(--accent)]"
              >
                결재 문서 {doc.docNo} 보기
              </Link>
            </dd>
          </div>
        </dl>
      </Card>

      <div id="evidence">
        <Card title="증빙" help={{ kind: "panel", id: "exp.evidence" }}>
          <p className="text-sm">
            {EVIDENCE_KINDS[e.evidenceKind as keyof typeof EVIDENCE_KINDS]}
            {e.evidenceNo ? ` ${e.evidenceNo}` : ""}
            {e.evidenceOn ? ` · ${e.evidenceOn}` : ""}
          </p>
          {warn && <p className="mt-1 text-xs text-[var(--warn)]">{warn}</p>}
          {e.files.length > 0 && (
            <ul className="mt-2 flex flex-wrap gap-2 text-xs">
              {e.files.map((f) => (
                <li key={f.path}>
                  <a
                    href={`/api/files/${f.path}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[var(--accent)] underline"
                  >
                    {f.name}
                  </a>
                </li>
              ))}
            </ul>
          )}
          {live && (mine || payer) && (
            <AssistForm
              id={`evi-${id}`}
              action={expenseAction}
              className="mt-3 grid gap-3 md:grid-cols-2"
            >
              {hidden("evidence")}
              <SelectField
                help="exp.evidenceKind"
                name="evidenceKind"
                required
                defaultValue={e.evidenceKind}
                options={Object.entries(EVIDENCE_KINDS).map(
                  ([value, label]) => ({ value, label }),
                )}
              />
              <TextField
                help="exp.evidenceNo"
                name="evidenceNo"
                defaultValue={e.evidenceNo ?? ""}
              />
              <DateField
                help="exp.evidenceOn"
                name="evidenceOn"
                defaultValue={e.evidenceOn ?? ""}
                quick={["today"]}
              />
              <EvidenceFiles saved={e.files.length} />
              <div className="md:col-span-2">
                <SubmitButton variant="secondary">증빙 저장</SubmitButton>
              </div>
            </AssistForm>
          )}
        </Card>
      </div>

      {status === "approved" && payer && (
        <Card title="지급" help={{ kind: "panel", id: "exp.pay" }}>
          {e.payMethod === "transfer" && e.supplierId && (
            <p className="mb-2 text-sm">
              입금 계좌:{" "}
              {bank ? (
                <>
                  {bank.bankName} {bank.full ?? bank.masked} {bank.holder}{" "}
                  {bank.verified ? (
                    <Badge tone="ok">확인함</Badge>
                  ) : (
                    <Badge tone="danger">확인 전 — 지급 불가</Badge>
                  )}
                </>
              ) : (
                <span className="text-[var(--danger)]">
                  없음(협력업체 화면에서 넣어 주세요)
                </span>
              )}
            </p>
          )}
          <AssistForm
            id={`pay-${id}`}
            action={expenseAction}
            className="grid gap-3 md:grid-cols-2"
          >
            {hidden("pay")}
            <DateField
              help="exp.paidOn"
              name="paidOn"
              required
              defaultValue={seoulDate()}
              quick={["today"]}
            />
            <TextField
              help="exp.paidNote"
              name="note"
              required={e.payMethod === "transfer" && !e.supplierId}
            />
            <div className="md:col-span-2">
              <SubmitButton>지급함으로 적기</SubmitButton>
            </div>
          </AssistForm>
        </Card>
      )}

      {status === "paid" && (
        <Card title="지급" help={{ kind: "panel", id: "exp.pay" }}>
          <p className="text-sm">
            {e.paidOn} {g.paidByName} 지급{e.paidTo ? ` · ${e.paidTo}` : ""}
            {e.paidNote ? ` · ${e.paidNote}` : ""}
          </p>
        </Card>
      )}

      {status === "cancelled" && e.cancelReason && (
        <Card title="취소" help={{ kind: "panel", id: "exp.cancel" }}>
          <p className="text-sm">
            {g.cancelledByName} {fmtTime(e.cancelledAt)} · {e.cancelReason}
          </p>
        </Card>
      )}

      {status === "rejected" && mine && (
        <Link href={`/money/expenses/new?from=${id}`} className={buttonClass()}>
          고쳐서 다시 올리기(내용 불러옴)
        </Link>
      )}

      {live && (mine || payer) && (
        <Card title="결의 취소" help={{ kind: "panel", id: "exp.cancel" }}>
          <AssistForm
            id={`cancel-${id}`}
            action={expenseAction}
            className="flex flex-wrap items-end gap-2"
          >
            {hidden("cancel")}
            <div className="min-w-64 flex-1">
              <TextField help="exp.cancelReason" name="reason" required />
            </div>
            <SubmitButton variant="danger">취소</SubmitButton>
          </AssistForm>
        </Card>
      )}
    </>
  );
}
