import Link from "next/link";
import { getDb } from "@/db/runtime";
import { can } from "@/modules/auth/permissions";
import { getQuote } from "@/modules/purchase/quote-import";
import { isVatMode, VAT_MODES } from "@/modules/purchase/rules";
import { supplierOptions } from "@/modules/purchase/supplier";
import { AssistForm } from "../../../_assist";
import { DateField, RadioRow } from "../../../_input";
import { requireUser } from "../../../_lib/session";
import { Badge, buttonClass, Card, ErrorBox, Notice, PageTitle } from "../../../_ui";
import { commitQuoteAction, discardQuoteAction, quoteSupplierAction } from "../../actions";
import { SupplierPicker } from "../../supplier-picker";
import { QuoteReview } from "../quote-review";

/** 견적서 확인: 업체·견적일·유효기간을 맞추고 줄마다 처리를 정해 한꺼번에 등록 */
export default async function QuoteReviewPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; notice?: string }> }) {
  const { id } = await params;
  const q0 = await searchParams;
  const user = await requireUser();
  const db = await getDb();
  const { q, supplier, items, nowPrice } = await getQuote(db, id);
  const sups = await supplierOptions(db);
  const draft = q.status === "draft";
  const edit = draft && can(user, "stock.manage");
  const vm = isVatMode(q.vatMode) ? q.vatMode : "excluded";
  return (
    <>
      <PageTitle
        help="stock.importReview"
        sub={draft ? "줄마다 처리를 정하고 '등록'을 누르면 새 품목은 등록되고, 이미 있는 품목은 업체 단가만 바뀝니다. 노란 줄은 사람이 정해야 하는 줄입니다." : "등록을 마친 견적서입니다. 품목 화면의 '업체별 단가'와 '단가 이력'에 이 견적서 번호가 남아 있습니다."}
        actions={
          <Link href="/stock/import" className={buttonClass("secondary")}>
            ← 견적서 목록
          </Link>
        }
      >
        견적서 {q.docNo}
      </PageTitle>
      <ErrorBox message={q0.error} />
      {q0.notice && <Notice>{q0.notice}</Notice>}
      <Card title="견적 업체" help={{ kind: "panel", id: "stock.importHead" }}>
        <div className="space-y-2 text-sm">
          <p>
            견적서에서 읽은 값: {q.readName ?? "상호 못 읽음"} · 사업자번호 {q.readBizNo ?? "못 읽음"} · {q.source === "file" ? `파일 ${q.fileName ?? ""}` : "붙여 넣은 표"}
            {q.path && (
              <>
                {" "}
                <a href={`/api/files/${q.path}`} className="text-[var(--accent)] underline">
                  원본 받기
                </a>
              </>
            )}
          </p>
          {supplier ? (
            <p>
              업체: <b>{supplier.name}</b> {supplier.bizNo && <span className="text-xs text-[var(--muted)]">({supplier.bizNo})</span>} {supplier.status === "candidate" && <Badge tone="warn">후보 업체 · 등록 평가 전</Badge>}
            </p>
          ) : (
            <p className="text-[var(--warn)]">협력업체 대장에서 이 업체를 찾지 못했습니다. 아래에서 고르거나 &apos;+ 새 업체&apos;로 등록하세요(상호·사업자번호가 미리 들어갑니다).</p>
          )}
          {edit && (
            <AssistForm id={`quote-sup-${q.id}`} action={quoteSupplierAction} guard={false} bar={false}>
              <input type="hidden" name="id" value={q.id} />
              <SupplierPicker suppliers={sups} defaultValue={q.supplierId} canCreate={can(user, "supplier.manage")} helpKey="qt.supplierId" newName={q.readName} newBizNo={q.readBizNo} submitOnPick />
            </AssistForm>
          )}
        </div>
      </Card>
      <div className="mt-4">
        <Card title={`품목 ${q.lines.length}줄`} help={{ kind: "panel", id: "stock.importLines" }}>
          <AssistForm id={`quote-commit-${q.id}`} action={commitQuoteAction} className="space-y-3" guard={false}>
            <input type="hidden" name="id" value={q.id} />
            <input type="hidden" name="supplierId" value={q.supplierId ?? ""} />
            {edit ? (
              <div className="grid gap-3 md:grid-cols-3">
                <DateField help="qt.quotedOn" name="quotedOn" required defaultValue={q.quotedOn} quick={["today"]} />
                <DateField help="qt.validUntil" name="validUntil" defaultValue={q.validUntil ?? ""} quick={["nextMonth"]} />
                <RadioRow help="qt.vatMode" name="vatMode" required defaultValue={vm} options={Object.entries(VAT_MODES).map(([value, label]) => ({ value, label }))} />
              </div>
            ) : (
              <p className="text-sm">
                견적일 {q.quotedOn}
                {q.validUntil ? ` · ${q.validUntil}까지 유효` : ""} · {VAT_MODES[vm]}
                {q.status === "done" && ` · 새 ${q.added} · 갱신 ${q.updated} · 건너뜀 ${q.skipped}`}
              </p>
            )}
            <QuoteReview lines={q.lines} items={items.map((i) => ({ id: i.id, name: i.name, spec: i.spec, unit: i.unit, kind: i.kind }))} nowPrice={nowPrice} readTotalWon={q.readTotalWon} vatLabel={VAT_MODES[vm]} disabled={!edit} noSupplier={!q.supplierId} />
            {edit && !q.supplierId && <p className="text-sm text-[var(--danger)]">위에서 견적 업체를 먼저 골라야 등록됩니다.</p>}
          </AssistForm>
          {edit && (
            <form action={discardQuoteAction} className="mt-3 text-right">
              <input type="hidden" name="id" value={q.id} />
              <button className="text-xs text-[var(--danger)] underline">이 견적서 버리기</button>
            </form>
          )}
        </Card>
      </div>
    </>
  );
}
