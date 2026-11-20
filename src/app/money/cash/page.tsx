import Link from "next/link";
import { getDb } from "@/db/runtime";
import { can } from "@/modules/auth/permissions";
import { openBankTxs, runMatching } from "@/modules/bank/service";
import { runList, type Q } from "@/modules/listq/core";
import { cashbookList } from "@/modules/listq/defs/money";
import { CASH_KINDS, cashTotals, throughBank } from "@/modules/money/cashbook";
import { ListBar, ListPager } from "../../_list-bar";
import { requireUser } from "../../_lib/session";
import { Badge, buttonClass, Card, Empty, ErrorBox, Notice, PageTitle } from "../../_ui";

const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;

/** 입출금(대표 결정 2026-11-20): 돈 받기·내기를 여기서 시작하고, 들어오고 나간 전표를 한 목록으로 본다 */
export default async function CashPage({ searchParams }: { searchParams: Promise<Q> }) {
  const q = await searchParams;
  const user = await requireUser();
  const canIn = can(user, "money.view");
  const canOut = can(user, "expense.draft") || can(user, "expense.pay");
  const canBank = can(user, "bank.view");
  if (!canIn && !canOut && !canBank) return <p className="text-sm text-[var(--muted)]">입출금은 상담원·회계 담당·대표가 봅니다.</p>;
  const db = await getDb();
  if (canBank) await runMatching(db); // 그사이 적은 전표와 통장 거래를 저절로 잇기
  const [lr, bank] = await Promise.all([
    can(user, "money.view") || can(user, "expense.pay") || canBank ? runList(db, cashbookList, user, q) : null,
    canBank ? openBankTxs(db, user, 10) : null,
  ]);
  const tot = lr ? cashTotals(lr.all) : null;
  const tile = (label: string, v: string, tone = "") => (
    <div className="rounded-md border border-[var(--line)] bg-[var(--surface)] px-3 py-2">
      <p className="text-xs text-[var(--muted)]">{label}</p>
      <p className={`text-lg font-semibold tabular-nums ${tone}`}>{v}</p>
    </div>
  );
  return (
    <>
      <PageTitle
        help="cash"
        sub="돈을 받거나 낼 때 여기서 시작합니다. 누구와 주고받았는지 고르면 그 일을 하는 화면이 금액이 채워진 채 열립니다. 적은 전표는 모두 아래 한 목록에 모입니다."
        actions={
          <div className="flex flex-wrap gap-2">
            {canIn && (
              <Link href="/money/cash/in" className={buttonClass("primary")}>
                돈 받기
              </Link>
            )}
            {canOut && (
              <Link href="/money/cash/out" className={buttonClass("primary")}>
                돈 내기
              </Link>
            )}
            {canBank && (
              <Link href="/money/bank" className={buttonClass("secondary")}>
                통장·카드 내역
              </Link>
            )}
          </div>
        }
      >
        입출금
      </PageTitle>
      <ErrorBox message={q.error} />
      {q.notice && <Notice>{q.notice}</Notice>}

      {bank && (
        <Card title="통장 할 일" help={{ kind: "panel", id: "cash.bank" }}>
          {bank.rows.length ? (
            <ul className="divide-y divide-[var(--line)] text-sm">
              {bank.rows.map((t) => {
                const inflow = t.kind === "in";
                return (
                  <li key={t.id} className="flex flex-wrap items-center gap-2 py-2">
                    <span className="tabular-nums text-[var(--muted)]">
                      {t.on}
                      {t.at ? ` ${t.at}` : ""}
                    </span>
                    <Badge tone={inflow ? "ok" : "danger"}>{inflow ? "입금" : "출금"}</Badge>
                    <b className={`tabular-nums ${inflow ? "text-[var(--ok)]" : ""}`}>
                      {inflow ? "+" : "−"}
                      {won(t.amountWon)}
                    </b>
                    <span>{t.party ?? "(상대방 없음)"}</span>
                    <span className="text-xs text-[var(--muted)]">{t.accountLabel ?? ""}</span>
                    {(inflow ? canIn : canOut) && (
                      <Link href={`/money/cash/${inflow ? "in" : "out"}?tx=${t.id}`} className={`ml-auto ${buttonClass("secondary")}`}>
                        {inflow ? "받기로 적기" : "내기로 적기"}
                      </Link>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            <Empty>짝이 없는 통장 입출금이 없습니다.</Empty>
          )}
          {bank.more && (
            <p className="mt-2 text-sm">
              <Link href="/money/bank?kind=bank" className="text-[var(--accent)]">
                통장 내역에서 모두 보기
              </Link>
            </p>
          )}
        </Card>
      )}

      {lr && tot && (
        <div className="mt-4">
          <Card title="입출금 전표" help={{ kind: "panel", id: "cash.list" }}>
            <div className="mb-3 flex flex-wrap gap-2">
              {cashbookList.tabs!.options.map((o) => {
                const on = (q.d ?? "all") === o.v;
                return (
                  <Link key={o.v} href={`/money/cash${lr.qs({ d: o.v === "all" ? null : o.v, pg: null })}`} className={`rounded-md border px-3 py-1.5 text-sm ${on ? "border-[var(--accent)] bg-[var(--accent-soft)] font-semibold" : "border-[var(--line)]"}`}>
                    {o.label}
                  </Link>
                );
              })}
            </div>
            <ListBar r={lr} bare />
            <div className="mb-3 grid grid-cols-2 gap-2 md:grid-cols-4">
              {tile("들어온 돈", won(tot.inWon), "text-[var(--ok)]")}
              {tile("나간 돈", won(tot.outWon), "text-[var(--danger)]")}
              {tile("차이", won(tot.netWon))}
              {tile("통장과 아직 안 맞음(이체)", `${tot.unbanked}건`, tot.unbanked ? "text-[var(--warn)]" : "")}
            </div>
            {lr.rows.length ? (
              <ul className="divide-y divide-[var(--line)] text-sm">
                {lr.rows.map((r) => (
                  <li key={`${r.dir}-${r.id}`} className="flex flex-wrap items-center gap-2 py-2">
                    <span className="tabular-nums text-xs text-[var(--muted)]">{r.on}</span>
                    <Badge tone={r.dir === "in" ? "ok" : "danger"}>{r.dir === "in" ? "들어옴" : "나감"}</Badge>
                    <Badge tone={r.kind === "insurer" ? "accent" : "neutral"}>{CASH_KINDS[r.kind]}</Badge>
                    <Link href={r.href} className="text-[var(--accent)]">
                      {r.docNo}
                    </Link>
                    <span className="font-medium">{r.party}</span>
                    <span className="text-xs text-[var(--muted)]">{r.what}</span>
                    <b className={`ml-auto tabular-nums ${r.amountWon < 0 ? "text-[var(--danger)]" : r.dir === "in" ? "text-[var(--ok)]" : ""}`}>
                      {r.dir === "in" ? "+" : "−"}
                      {won(Math.abs(r.amountWon))}
                    </b>
                    <span className="text-xs text-[var(--muted)]">{r.method}</span>
                    {r.reversal && <Badge tone="danger">취소 전표</Badge>}
                    {r.bank ? <Badge tone="ok">통장 맞음</Badge> : throughBank(r) && !r.reversal ? <Badge tone="warn">통장 아직</Badge> : null}
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>조건에 맞는 입출금 전표가 없습니다.</Empty>
            )}
            <ListPager r={lr} />
          </Card>
        </div>
      )}
    </>
  );
}
