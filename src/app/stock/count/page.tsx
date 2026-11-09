import Link from "next/link";
import { getDb } from "@/db/runtime";
import { can } from "@/modules/auth/permissions";
import { COUNT_KINDS, type CountKind } from "@/modules/purchase/rules";
import { listCounts, listStock } from "@/modules/purchase/stock";
import { loadPolicy } from "@/modules/platform/policy";
import { AssistForm } from "../../_assist";
import { NumberField, TextAreaField } from "../../_input";
import { requireUser } from "../../_lib/session";
import { SubmitButton } from "../../_submit";
import { Card, ErrorBox, fmtTime, PageTitle } from "../../_ui";
import { countAction } from "../actions";

/** 재고 실사(STD-07 7절): 월말 도료·고가 소모품, 분기 말 전체 */
export default async function StockCountPage({ searchParams }: { searchParams: Promise<{ kind?: string; error?: string }> }) {
  const q = await searchParams;
  const user = await requireUser();
  const db = await getDb();
  const kind: CountKind = q.kind === "quarterly" ? "quarterly" : "monthly";
  const [all, counts, p] = await Promise.all([listStock(db, "all"), listCounts(db), loadPolicy(db)]);
  const items = kind === "monthly" ? all.filter((i) => i.kind === "paint" || i.unitWon >= 30_000) : all;
  return (
    <>
      <PageTitle
        help="stock.count"
        sub={`세어 본 실물 수량을 적으면 장부를 맞춥니다. 금액 차이가 ${p["stock.count_diff_pct"]}%를 넘으면 원인을 적고 부적합이 발행됩니다.`}
        actions={
          <Link href="/stock" className="text-sm text-[var(--accent)]">
            ← 재고
          </Link>
        }
      >
        재고 실사
      </PageTitle>
      <ErrorBox message={q.error} />
      {!can(user, "stock.manage") ? (
        <p className="text-sm text-[var(--muted)]">실사는 공장장이 합니다.</p>
      ) : (
        <div className="grid gap-4 xl:grid-cols-[2fr_1fr]">
          <Card title={COUNT_KINDS[kind]} help={{ kind: "panel", id: "stock.count" }}>
            <div className="mb-3 flex flex-wrap gap-1.5 text-sm">
              {(Object.keys(COUNT_KINDS) as CountKind[]).map((k) => (
                <Link key={k} href={`/stock/count?kind=${k}`} className={`rounded-full border px-3 py-1 ${kind === k ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]" : "border-[var(--line)]"}`}>
                  {COUNT_KINDS[k]}
                </Link>
              ))}
            </div>
            {items.length ? (
              <AssistForm id={`stock-count-${kind}`} action={countAction} className="space-y-3">
                <input type="hidden" name="kind" value={kind} />
                <div className="grid gap-2 md:grid-cols-2">
                  {items.map((i) => (
                    <div key={i.id}>
                      <input type="hidden" name="itemId" value={i.id} />
                      <NumberField help="st.actual" name={`actual_${i.id}`} label={`${i.name}${i.spec ? ` ${i.spec}` : ""}${i.location ? ` (${i.location})` : ""}`} min={0} unit={i.unit} current={i.qty} />
                    </div>
                  ))}
                </div>
                <TextAreaField help="st.countNote" name="countNote" rows={2} />
                <SubmitButton>실사 저장(장부를 실물에 맞춤)</SubmitButton>
              </AssistForm>
            ) : (
              <p className="text-sm text-[var(--muted)]">실사할 품목이 없습니다.</p>
            )}
          </Card>
          <Card title="지난 실사" help={{ kind: "panel", id: "stock.counts" }}>
            {counts.length ? (
              <ul className="divide-y divide-[var(--line)] text-sm">
                {counts.map(({ c, by }) => (
                  <li key={c.id} className="py-1.5">
                    {fmtTime(c.countedAt)} · {COUNT_KINDS[c.kind as CountKind]} · {by}
                    <br />
                    <span className="text-xs text-[var(--muted)]">
                      {c.lines.length}개 품목 · 차이 {c.diffWon.toLocaleString("ko-KR")}원 / 장부 {c.bookWon.toLocaleString("ko-KR")}원
                      {c.ncId && (
                        <>
                          {" "}
                          ·{" "}
                          <Link href={`/nc/${c.ncId}`} className="text-[var(--accent)]">
                            부적합
                          </Link>
                        </>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-[var(--muted)]">아직 실사가 없습니다.</p>
            )}
          </Card>
        </div>
      )}
    </>
  );
}
