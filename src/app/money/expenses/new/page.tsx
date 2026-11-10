import Link from "next/link";
import { getDb } from "@/db/runtime";
import { can } from "@/modules/auth/permissions";
import { expenseSources, getExpense, sourceOf } from "@/modules/money/expense";
import {
  EVIDENCE_KINDS,
  EXP_CATEGORIES,
  EXP_PAY_METHODS,
  SIMPLE_RECEIPT_MAX,
  SOURCE_KINDS,
  vatOf,
} from "@/modules/money/rules";
import { listSuppliers } from "@/modules/purchase/supplier";
import { seoulDate } from "@/modules/platform/time";
import { AssistForm } from "../../../_assist";
import {
  DateField,
  NumberField,
  SelectField,
  TextAreaField,
  TextField,
} from "../../../_input";
import { requireUser } from "../../../_lib/session";
import { SubmitButton } from "../../../_submit";
import { Badge, Card, ErrorBox, PageTitle } from "../../../_ui";
import { createExpenseAction } from "../../actions";
import { EvidenceFiles } from "../../evidence-files";

const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;
const opts = (o: Record<string, string>) =>
  Object.entries(o).map(([value, label]) => ({ value, label }));

/** 지출 결의서 쓰기(F-12-01). ?src=po:<id> 근거 전표에서, ?from=<id> 반려된 결의서에서 불러온다 */
export default async function NewExpensePage({
  searchParams,
}: {
  searchParams: Promise<{ src?: string; from?: string; error?: string }>;
}) {
  const q = await searchParams;
  const user = await requireUser();
  if (!can(user, "expense.draft"))
    return (
      <p className="text-sm text-[var(--muted)]">
        지출 결의서는 공장장·회계 담당·대표가 씁니다.
      </p>
    );
  const db = await getDb();
  const [kind, sid] = (q.src ?? "").split(":");
  const src = kind && sid ? await sourceOf(db, kind, sid) : null;
  const old = q.from
    ? ((await getExpense(db, user, q.from).catch(() => null))?.e ?? null)
    : null;
  const sources = src || old ? [] : await expenseSources(db);
  const sups = await listSuppliers(db, "registered");
  const remain = src ? src.remainWon : 0;
  const supply = src
    ? src.remainWon === src.totalWon
      ? src.supplyWon
      : Math.round(remain / 1.1)
    : (old?.supplyWon ?? null);
  const vat = src ? remain - (supply ?? 0) : (old?.vatWon ?? null);
  const fromSrc = src
    ? `${SOURCE_KINDS[src.kind]} ${src.docNo}`
    : old
      ? `반려된 ${old.docNo}`
      : undefined;
  return (
    <>
      <PageTitle
        help="expenses.new"
        sub="근거 전표를 고르면 업체·금액·세금계산서 번호를 불러옵니다. 승인자는 금액에 따라 전결 규정(일반 지출)이 정합니다."
      >
        지출 결의서 쓰기
      </PageTitle>
      <ErrorBox message={q.error} />
      {sources.length > 0 && (
        <Card
          title="근거 전표에서 불러오기"
          help={{ kind: "panel", id: "exp.sources" }}
        >
          <ul className="divide-y divide-[var(--line)] text-sm">
            {sources.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-2 py-2">
                <Link
                  href={`/money/expenses/new?src=${s.kind}:${s.id}`}
                  className="font-medium text-[var(--accent)]"
                >
                  {s.docNo}
                </Link>
                <span>{s.supplierName}</span>
                <span>남음 {won(s.remainWon)}</span>
                <Badge>{SOURCE_KINDS[s.kind]}</Badge>
                {s.partial && <Badge tone="warn">일부 입고</Badge>}
                {s.invoiceNo && (
                  <span className="text-xs text-[var(--muted)]">
                    계산서 {s.invoiceNo}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}
      <Card
        title={
          src
            ? `${src.docNo} 대금 결의`
            : old
              ? `${old.docNo} 고쳐 다시 올리기`
              : "근거 전표 없이 결의(임차료·공과금·소모품 등)"
        }
        help={{ kind: "panel", id: "exp.form" }}
      >
        <AssistForm
          id={`exp-new-${q.src ?? q.from ?? "none"}`}
          action={createExpenseAction}
          className="grid gap-3 md:grid-cols-2"
        >
          <input
            type="hidden"
            name="sourceKind"
            value={src?.kind ?? old?.sourceKind ?? "none"}
          />
          <input
            type="hidden"
            name="sourceId"
            value={src?.id ?? old?.sourceId ?? ""}
          />
          {q.src && <input type="hidden" name="src" value={q.src} />}
          {old && <input type="hidden" name="fromId" value={old.id} />}
          {old && <input type="hidden" name="from" value={old.id} />}
          {src ? (
            <>
              <input
                type="hidden"
                name="supplierId"
                value={src.supplierId ?? ""}
              />
              <TextField
                help="exp.payeeName"
                name="payeeName"
                readOnly
                defaultValue={src.supplierName}
                from={fromSrc}
              />
            </>
          ) : (
            <>
              <SelectField
                help="exp.supplierId"
                name="supplierId"
                placeholder="협력업체가 아니면 비워 둠"
                defaultValue={old?.supplierId ?? ""}
                from={old ? fromSrc : undefined}
                options={sups.map((s) => ({ value: s.id, label: s.name }))}
              />
              <TextField
                help="exp.payeeName"
                name="payeeName"
                defaultValue={old && !old.supplierId ? old.payeeName : ""}
                from={old ? fromSrc : undefined}
              />
            </>
          )}
          <SelectField
            help="exp.category"
            name="category"
            required
            defaultValue={src?.category ?? old?.category ?? ""}
            placeholder="계정 고르기"
            from={fromSrc}
            options={opts(EXP_CATEGORIES)}
          />
          <SelectField
            help="exp.payMethod"
            name="payMethod"
            required
            defaultValue={old?.payMethod ?? "transfer"}
            options={opts(EXP_PAY_METHODS)}
          />
          <NumberField
            help="exp.supplyWon"
            name="supplyWon"
            required
            unit="원"
            min={1}
            defaultValue={supply}
            from={fromSrc}
          />
          <NumberField
            help="exp.vatWon"
            name="vatWon"
            unit="원"
            min={0}
            defaultValue={vat}
            suggested={supply ? vatOf(supply) : undefined}
            from={fromSrc}
          />
          {src && (
            <p className="text-xs text-[var(--muted)] md:col-span-2">
              이 전표의 남은 금액 {won(remain)}(근거 {won(src.totalWon)}, 이미
              결의 {won(src.usedWon)})을 넘을 수 없습니다.
            </p>
          )}
          <div className="md:col-span-2">
            <TextAreaField
              help="exp.purpose"
              name="purpose"
              required={!src}
              rows={2}
              defaultValue={old?.purpose ?? ""}
              from={old ? fromSrc : undefined}
            />
          </div>
          <SelectField
            help="exp.evidenceKind"
            name="evidenceKind"
            required
            defaultValue={
              src?.invoiceNo ? "tax_invoice" : (old?.evidenceKind ?? "")
            }
            placeholder="증빙 고르기"
            from={src?.invoiceNo ? "발주서에 연결한 세금계산서" : undefined}
            options={opts(EVIDENCE_KINDS)}
          />
          <TextField
            help="exp.evidenceNo"
            name="evidenceNo"
            defaultValue={src?.invoiceNo ?? old?.evidenceNo ?? ""}
            from={src?.invoiceNo ? "발주서" : undefined}
          />
          <DateField
            help="exp.evidenceOn"
            name="evidenceOn"
            defaultValue={src?.invoiceOn ?? old?.evidenceOn ?? ""}
            quick={["today"]}
          />
          <DateField
            help="exp.dueOn"
            name="dueOn"
            defaultValue={old?.dueOn ?? ""}
            min={seoulDate()}
            quick={["today", "week", "nextMonth"]}
          />
          <div className="md:col-span-2">
            <EvidenceFiles />
          </div>
          <p className="text-xs text-[var(--muted)] md:col-span-2">
            {won(SIMPLE_RECEIPT_MAX)}이 넘는데 간이영수증만 있으면 적격 증빙이
            아니어서 가산세(2%) 대상입니다. 증빙을 아직 못 받았으면 &apos;아직
            못 받음&apos;으로 올리고, 받으면 붙여야 지급됩니다. 업체 계좌 이체는
            전화로 확인한 계좌로만 보냅니다.
          </p>
          <div className="md:col-span-2">
            <SubmitButton>결재에 올리기</SubmitButton>
          </div>
        </AssistForm>
      </Card>
    </>
  );
}
