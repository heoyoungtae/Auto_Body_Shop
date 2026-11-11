import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/db/runtime";
import { can } from "@/modules/auth/permissions";
import { EXP_CATEGORIES } from "@/modules/money/rules";
import { addDays } from "@/modules/platform/time";
import { DOC_RESULTS, docExpiry, EXPIRY_ALERT_DAYS, ITEM_DOC_KINDS, itemExpCategory, MOVE_REASON, STOCK_KINDS, STOP_REASONS, VAT_MODES, type ItemDocKind, type StockKind, type StopReason, type VatMode } from "@/modules/purchase/rules";
import { chemicalOptions, getItem, replacementOptions } from "@/modules/purchase/stock";
import { supplierOptions } from "@/modules/purchase/supplier";
import { seoulDate } from "@/modules/platform/time";
import { AssistForm } from "../../_assist";
import { DateField, RadioRow, SelectField, TextField } from "../../_input";
import { requireUser } from "../../_lib/session";
import { SubmitButton } from "../../_submit";
import { Badge, buttonClass, Card, ErrorBox, fmtTime, Notice, PageTitle } from "../../_ui";
import { saveItemAction, stockAction } from "../actions";
import { ItemFields } from "../_form";
import { DocFileInput } from "../doc-file-input";

/** 재고 품목 한 개: 로트(유효기간)·움직임 기록·폐기·품목 고치기 */
export default async function StockItemPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; notice?: string }> }) {
  const { id } = await params;
  const q = await searchParams;
  const user = await requireUser();
  const db = await getDb();
  const r = await getItem(db, id).catch(() => null);
  if (!r) notFound();
  const { i, lots, moves, docs, chem, replacedBy, stoppedByName, replaces } = r;
  const manage = can(user, "stock.manage");
  const today = seoulDate();
  const soon = addDays(today, EXPIRY_ALERT_DAYS);
  const [sups, chems, reps] = manage ? await Promise.all([supplierOptions(db), chemicalOptions(db), replacementOptions(db, id)]) : [[], [], []];
  const liveDocs = docs.filter((x) => x.d.active);
  const oldDocs = docs.filter((x) => !x.d.active);
  const stopped = !i.active || i.windDown;
  const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;
  return (
    <>
      <PageTitle
        help="stock.detail"
        sub={`${STOCK_KINDS[i.kind as StockKind]}${i.spec ? ` · ${i.spec}` : ""}${i.packAmount ? ` · 1${i.unit}=${i.packAmount.toLocaleString("ko-KR")}${i.packUnit ?? ""}` : ""} · ${i.location ?? "위치 미정"} · 안전 재고 ${i.safetyQty}${i.unit} · 단가 ${won(i.unitWon)}(공급가, ${VAT_MODES[i.vatMode as VatMode] ?? "부가세 별도"}로 적음) · 계정 ${EXP_CATEGORIES[itemExpCategory(i) as keyof typeof EXP_CATEGORIES] ?? "-"}`}
        actions={
          <div className="flex flex-wrap gap-2">
            {can(user, "stock.use") && i.active && (
              <Link href={`/stock/use?item=${id}`} className={buttonClass()}>
                사용 기록
              </Link>
            )}
            <Link href="/stock" className="self-center text-sm text-[var(--accent)]">
              ← 재고
            </Link>
          </div>
        }
      >
        {i.name}{" "}
        <Badge tone={i.safetyQty > 0 && i.qty < i.safetyQty ? "danger" : "ok"}>
          {i.qty}
          {i.unit}
        </Badge>{" "}
        {!i.active && <Badge>사용 중지</Badge>}
        {i.windDown && <Badge tone="warn">소진 후 중지</Badge>}
      </PageTitle>
      <ErrorBox message={q.error} />
      {q.notice && <Notice>{q.notice}</Notice>}
      {stopped && (
        <div className="mb-4 rounded-md border border-[var(--warn)]/40 bg-[var(--warn-soft)] px-3 py-2.5 text-sm">
          <b>{i.active ? "소진 후 중지" : "사용 중지"}</b>: {STOP_REASONS[i.stopReason as StopReason] ?? "-"}
          {i.stopNote && ` · ${i.stopNote}`}
          {replacedBy && (
            <>
              {" "}· 대신{" "}
              <Link href={`/stock/${replacedBy.id}`} className="font-semibold text-[var(--accent)]">
                {replacedBy.name}
              </Link>
            </>
          )}
          <span className="ml-1 text-xs text-[var(--muted)]">
            ({stoppedByName ?? ""} {i.stoppedAt ? fmtTime(i.stoppedAt) : ""}){i.active ? " — 새 발주는 막혔고 남은 것을 다 쓰면 저절로 사용 중지됩니다" : ""}
          </span>
        </div>
      )}
      {replaces.length > 0 && (
        <p className="mb-4 text-xs text-[var(--muted)]">
          이 품목은 {replaces.map((x) => x.name).join(", ")}의 대체품입니다.
        </p>
      )}
      <div className="grid gap-4 xl:grid-cols-2">
        {i.expiryTracked && (
          <Card title="로트·유효기간(빠른 것부터 씀)" help={{ kind: "panel", id: "stock.lots" }}>
            {lots.length ? (
              <ul className="divide-y divide-[var(--line)] text-sm">
                {lots.map((l) => (
                  <li key={l.id} className="flex flex-wrap items-center gap-2 py-2">
                    <span className={l.expiresOn < today ? "font-bold text-[var(--danger)]" : ""}>
                      {l.expiresOn}까지 · {l.qty}
                      {i.unit}
                      {l.lot ? ` · 로트 ${l.lot}` : ""}
                    </span>
                    {l.expiresOn < today && <Badge tone="danger">사용 금지</Badge>}
                    {l.expiresOn < today && manage && (
                      <AssistForm id={`stock-discard-${l.id}`} action={stockAction} className="flex flex-wrap items-end gap-2">
                        <input type="hidden" name="id" value={id} />
                        <input type="hidden" name="intent" value="discard" />
                        <input type="hidden" name="lotId" value={l.id} />
                        <TextField help="st.discardNote" name="discardNote" />
                        <SubmitButton variant="danger">폐기 처리</SubmitButton>
                      </AssistForm>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-[var(--muted)]">남은 로트가 없습니다.</p>
            )}
          </Card>
        )}
        <Card title="움직임(최근 50건)" help={{ kind: "panel", id: "stock.moves" }}>
          {moves.length ? (
            <ul className="divide-y divide-[var(--line)] text-sm">
              {moves.map(({ m, by }) => (
                <li key={m.id} className="flex flex-wrap gap-2 py-1.5">
                  <span className="text-xs text-[var(--muted)]">{fmtTime(m.at)}</span>
                  <Badge tone={m.qty > 0 ? "ok" : m.reason === "discard" ? "danger" : "neutral"}>{MOVE_REASON[m.reason as keyof typeof MOVE_REASON]}</Badge>
                  <b>
                    {m.qty > 0 ? "+" : ""}
                    {m.qty}
                    {i.unit}
                  </b>
                  {m.ref && <span className="text-xs">{m.ref}</span>}
                  {m.lot && <span className="text-xs">로트 {m.lot}</span>}
                  {m.note && <span className="text-xs text-[var(--muted)]">{m.note}</span>}
                  <span className="text-xs text-[var(--muted)]">{by ?? ""}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-[var(--muted)]">기록이 없습니다.</p>
          )}
        </Card>
        <Card title="화학물질·MSDS" help={{ kind: "panel", id: "stock.msds" }}>
          {chem ? (
            <div className="space-y-1 text-sm">
              <p>
                <Link href={`/chemicals/${chem.id}`} className="font-semibold text-[var(--accent)]">
                  {chem.name}
                </Link>
                {chem.maker && <span className="ml-1 text-xs text-[var(--muted)]">{chem.maker}</span>}
                {!chem.active && <Badge>사용 중지</Badge>}
              </p>
              {chem.msdsPath ? (
                <p>
                  <a href={`/api/files/${chem.msdsPath}`} target="_blank" rel="noreferrer" className="text-[var(--accent)]">
                    {chem.msdsName ?? "MSDS"} 열기
                  </a>
                  {chem.msdsRevisedOn && <span className="ml-1 text-xs text-[var(--muted)]">개정 {chem.msdsRevisedOn}</span>}
                </p>
              ) : (
                <p className="text-[var(--danger)]">MSDS가 아직 없습니다. 안전환경 담당이 화학물질 화면에서 올립니다.</p>
              )}
              {chem.ppe.length > 0 && <p className="text-xs">보호구: {chem.ppe.join(", ")}</p>}
            </div>
          ) : (
            <p className="text-sm text-[var(--muted)]">
              연결된 화학물질이 없습니다.{i.kind === "paint" ? " 도료·퍼티·경화제는 '품목 고치기'에서 화학물질(MSDS)을 연결하세요." : ""}
            </p>
          )}
        </Card>
        <Card title="성적서·인증서" help={{ kind: "panel", id: "stock.docs" }}>
          {liveDocs.length ? (
            <ul className="divide-y divide-[var(--line)] text-sm">
              {liveDocs.map(({ d, by }) => {
                const st = docExpiry(d.expiresOn, today, soon);
                return (
                  <li key={d.id} className="flex flex-wrap items-center gap-2 py-2">
                    <Badge tone="accent">{d.kind === "other" && d.title ? d.title : ITEM_DOC_KINDS[d.kind as ItemDocKind]}</Badge>
                    {d.path && (
                      <a href={`/api/files/${d.path}`} target="_blank" rel="noreferrer" className="text-[var(--accent)]">
                        {d.fileName ?? "열기"}
                      </a>
                    )}
                    {d.result && <Badge tone={d.result === "pass" ? "ok" : "danger"}>{DOC_RESULTS[d.result as keyof typeof DOC_RESULTS]}</Badge>}
                    <span className="text-xs text-[var(--muted)]">
                      {[d.issuer, d.issuedOn && `발행 ${d.issuedOn}`, d.lot && `로트 ${d.lot}`].filter(Boolean).join(" · ")}
                    </span>
                    {d.expiresOn && (
                      <span className={`text-xs ${st === "expired" ? "font-bold text-[var(--danger)]" : st === "soon" ? "text-[var(--warn)]" : ""}`}>
                        {d.expiresOn}까지{st === "expired" ? " (지남)" : st === "soon" ? " (곧 끝남)" : ""}
                      </span>
                    )}
                    {d.note && <span className="text-xs">{d.note}</span>}
                    <span className="text-xs text-[var(--muted)]">{by ?? ""}</span>
                    {manage && (
                      <AssistForm id={`stock-doc-off-${d.id}`} action={stockAction} guard={false} className="ml-auto">
                        <input type="hidden" name="id" value={id} />
                        <input type="hidden" name="intent" value="docRetire" />
                        <input type="hidden" name="docId" value={d.id} />
                        <SubmitButton variant="secondary">빼기</SubmitButton>
                      </AssistForm>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-[var(--muted)]">올린 문서가 없습니다. 필요한 것만 올리면 됩니다(ICP 성적서는 납품처가 요구할 때).</p>
          )}
          {oldDocs.length > 0 && (
            <details className="mt-2 text-xs text-[var(--muted)]">
              <summary className="cursor-pointer">지난 판 {oldDocs.length}건</summary>
              <ul className="mt-1 space-y-1">
                {oldDocs.map(({ d }) => (
                  <li key={d.id}>
                    {ITEM_DOC_KINDS[d.kind as ItemDocKind]} · {d.path ? (
                      <a href={`/api/files/${d.path}`} target="_blank" rel="noreferrer" className="text-[var(--accent)]">
                        {d.fileName}
                      </a>
                    ) : d.fileName}{" "}
                    {d.issuedOn && `· 발행 ${d.issuedOn}`} {d.expiresOn && `· ${d.expiresOn}까지`}
                  </li>
                ))}
              </ul>
            </details>
          )}
          {manage && (
            <AssistForm id={`stock-doc-${id}`} action={stockAction} guard={false} className="mt-3 grid gap-3 border-t border-[var(--line)] pt-3 md:grid-cols-2">
              <input type="hidden" name="id" value={id} />
              <input type="hidden" name="intent" value="doc" />
              <div className="md:col-span-2">
                <RadioRow help="sd.kind" name="docKind" required options={Object.entries(ITEM_DOC_KINDS).map(([value, label]) => ({ value, label }))} />
              </div>
              <div className="md:col-span-2">
                <DocFileInput />
              </div>
              <TextField help="sd.title" name="docTitle" />
              <TextField help="sd.issuer" name="issuer" />
              <DateField help="sd.issuedOn" name="issuedOn" quick={["today"]} />
              <DateField help="sd.expiresOn" name="docExpiresOn" quick={[]} />
              <RadioRow help="sd.result" name="result" options={Object.entries(DOC_RESULTS).map(([value, label]) => ({ value, label, tone: value === "pass" ? ("ok" as const) : ("danger" as const) }))} />
              <TextField help="sd.lot" name="docLot" suggestions={lots.filter((l) => l.lot).map((l) => ({ value: l.lot!, label: `${l.expiresOn}까지 ${l.qty}${i.unit}` }))} />
              {liveDocs.length > 0 && (
                <SelectField help="sd.replaceId" name="replaceId" placeholder="새 문서(바꾸지 않음)" options={liveDocs.map(({ d }) => ({ value: d.id, label: `${ITEM_DOC_KINDS[d.kind as ItemDocKind]} ${d.issuedOn ?? ""} ${d.fileName ?? ""}` }))} />
              )}
              <TextField help="sd.note" name="docNote" />
              <div className="md:col-span-2">
                <SubmitButton>문서 올리기</SubmitButton>
              </div>
            </AssistForm>
          )}
        </Card>
        {manage && (
          <Card title="품목 고치기" help={{ kind: "panel", id: "stock.item" }}>
            <AssistForm id={`stock-edit-${id}`} action={saveItemAction} className="grid gap-3 md:grid-cols-2">
              <input type="hidden" name="id" value={id} />
              <ItemFields i={i} suppliers={sups} chemicals={chems} canAddSupplier={can(user, "supplier.manage")} canAddChemical={can(user, "safety.manage")} />
              <div className="md:col-span-2">
                <SubmitButton>저장</SubmitButton>
              </div>
            </AssistForm>
          </Card>
        )}
        {manage && (
          <Card title={stopped ? "다시 쓰기" : "사용 중지"} help={{ kind: "panel", id: "stock.stop" }}>
            {stopped ? (
              <AssistForm id={`stock-resume-${id}`} action={stockAction} guard={false} className="space-y-2">
                <input type="hidden" name="id" value={id} />
                <input type="hidden" name="intent" value="resume" />
                <p className="text-sm text-[var(--muted)]">다시 쓰면 발주·사용 목록에 돌아오고 안전 재고 알림도 다시 갑니다.</p>
                <SubmitButton variant="secondary">다시 쓰는 품목으로</SubmitButton>
              </AssistForm>
            ) : (
              <AssistForm id={`stock-stop-${id}`} action={stockAction} className="grid gap-3 md:grid-cols-2">
                <input type="hidden" name="id" value={id} />
                <input type="hidden" name="intent" value="stop" />
                <div className="md:col-span-2">
                  <RadioRow help="st.stopReason" name="stopReason" required options={Object.entries(STOP_REASONS).map(([value, label]) => ({ value, label }))} />
                </div>
                <SelectField help="st.replacedById" name="replacedById" placeholder="없음" options={reps.map((x) => ({ value: x.id, label: `${x.name}${x.spec ? ` ${x.spec}` : ""}` }))} />
                <TextField help="st.stopNote" name="stopNote" />
                <p className="text-xs text-[var(--muted)] md:col-span-2">
                  {i.qty > 0 ? `남은 ${i.qty}${i.unit}이 있어 '소진 후 중지'가 됩니다. 새 발주는 막고 남은 것은 씁니다.` : "남은 수량이 없어 바로 사용 중지됩니다."}
                </p>
                <div className="md:col-span-2">
                  <SubmitButton variant="danger">{i.qty > 0 ? "소진 후 중지" : "사용 중지"}</SubmitButton>
                </div>
              </AssistForm>
            )}
          </Card>
        )}
      </div>
    </>
  );
}
