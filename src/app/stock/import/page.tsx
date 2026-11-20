import Link from "next/link";
import { getDb } from "@/db/runtime";
import { can } from "@/modules/auth/permissions";
import { listQuotes } from "@/modules/purchase/quote-import";
import { VAT_MODES } from "@/modules/purchase/rules";
import { lastVatMode } from "@/modules/purchase/stock";
import { supplierOptions } from "@/modules/purchase/supplier";
import { AssistForm } from "../../_assist";
import { DateField, NumberField, RadioRow, TextAreaField } from "../../_input";
import { requireUser } from "../../_lib/session";
import { SubmitButton } from "../../_submit";
import { Badge, buttonClass, Card, Empty, ErrorBox, Notice, PageTitle, fmtTime } from "../../_ui";
import { readQuoteAction } from "../actions";
import { SupplierPicker } from "../supplier-picker";
import { QuoteFile } from "./quote-file";

const STATUS: Record<string, [string, "neutral" | "ok" | "warn"]> = { draft: ["확인 중", "warn"], done: ["등록 끝", "ok"], cancelled: ["버림", "neutral"] };

/** 업체 견적서(단가표)로 재고 품목 일괄 등록: 올리기 */
export default async function QuoteImportPage({ searchParams }: { searchParams: Promise<{ error?: string; notice?: string }> }) {
  const q = await searchParams;
  const user = await requireUser();
  const db = await getDb();
  const manage = can(user, "stock.manage");
  const [sups, vm, quotes] = await Promise.all([supplierOptions(db), lastVatMode(db), listQuotes(db)]);
  return (
    <>
      <PageTitle
        help="stock.import"
        sub="업체가 보낸 견적서·단가표를 올리면 품목을 한꺼번에 읽어, 이미 있는 품목은 단가만 갱신하고 없는 품목은 새로 등록합니다. 업체별 단가와 단가 변동 이력이 함께 남습니다."
        actions={
          <div className="flex flex-wrap gap-2">
            <a href="/api/stock/quote-template" className={buttonClass("secondary")}>
              엑셀 양식 내려받기
            </a>
            <Link href="/stock" className={buttonClass("secondary")}>
              ← 재고
            </Link>
          </div>
        }
      >
        견적서로 품목 등록
      </PageTitle>
      <ErrorBox message={q.error} />
      {q.notice && <Notice>{q.notice}</Notice>}
      {manage ? (
        <Card title="견적서 올리기" help={{ kind: "panel", id: "stock.importForm" }}>
          <AssistForm id="stock-quote-read" action={readQuoteAction} className="grid gap-3 md:grid-cols-2" guard={false}>
            <div className="md:col-span-2">
              <SupplierPicker suppliers={sups} canCreate={can(user, "supplier.manage")} helpKey="qt.supplierId" />
            </div>
            <DateField help="qt.quotedOn" name="quotedOn" quick={["today"]} />
            <NumberField help="qt.validDays" name="validDays" min={1} max={365} unit="일" defaultValue={null} />
            <RadioRow help="qt.vatMode" name="vatMode" options={Object.entries(VAT_MODES).map(([value, label]) => ({ value, label }))} />
            <p className="text-xs text-[var(--muted)] md:col-span-2">업체·견적일·유효기간·부가세를 비워 두면 견적서(앱 양식이면 위쪽 업체 정보 칸)에 적힌 대로 읽습니다. 부가세가 어디에도 없으면 최근 품목과 같게({VAT_MODES[vm]}) 봅니다.</p>
            <div className="md:col-span-2">
              <QuoteFile />
            </div>
            <div className="md:col-span-2">
              <TextAreaField help="qt.paste" name="paste" rows={5} />
            </div>
            <p className="text-xs text-[var(--muted)] md:col-span-2">
              파일이나 붙여 넣은 표 중 하나만 있으면 됩니다. 사진·PDF는 아직 읽지 못합니다. 종이 견적서는 &apos;엑셀 양식 내려받기&apos;로 옮겨 적어 올리세요. 올리면 바로 등록되지 않고 다음 화면에서 줄마다 확인합니다.
            </p>
            <div className="md:col-span-2">
              <SubmitButton>읽기(다음: 확인)</SubmitButton>
            </div>
          </AssistForm>
        </Card>
      ) : (
        <p className="text-sm text-[var(--muted)]">견적서로 품목을 등록하는 일은 공장장·대표가 합니다.</p>
      )}
      <div className="mt-4">
        <Card title="받은 견적서" help={{ kind: "panel", id: "stock.quotes" }}>
          {quotes.length ? (
            <ul className="divide-y divide-[var(--line)] text-sm">
              {quotes.map(({ q: x, supplierName }) => {
                const [label, tone] = STATUS[x.status] ?? [x.status, "neutral"];
                return (
                  <li key={x.id} className="flex flex-wrap items-center gap-2 py-2">
                    <Link href={`/stock/import/${x.id}`} className="font-medium text-[var(--accent)]">
                      {x.docNo}
                    </Link>
                    <span>{supplierName ?? x.readName ?? "업체 미정"}</span>
                    <span className="text-xs text-[var(--muted)]">
                      견적일 {x.quotedOn}
                      {x.validUntil ? ` · ${x.validUntil}까지` : ""} · {x.lines.length}줄 · {x.totalWon.toLocaleString("ko-KR")}원
                    </span>
                    <Badge tone={tone}>{label}</Badge>
                    {x.status === "done" && (
                      <span className="text-xs text-[var(--muted)]">
                        새 {x.added} · 갱신 {x.updated} · 건너뜀 {x.skipped}
                      </span>
                    )}
                    <span className="ml-auto text-xs text-[var(--muted)]">{fmtTime(x.createdAt)}</span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <Empty>아직 올린 견적서가 없습니다.</Empty>
          )}
        </Card>
      </div>
    </>
  );
}
